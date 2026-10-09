import { AppError } from '../../../../plugins/errors.js';
import { advanceFight, type FightCommand, type FightState } from '@hockey/game-core';
import type { FightActionPayload } from '../commands.js';

export interface RoomAck {
  accepted: boolean;
  seq: number;
  reason?: string;
}
interface Pending {
  player: 0 | 1;
  command: FightCommand;
  resolve: (ack: RoomAck) => void;
  reject: (error: Error) => void;
}
interface Receipt {
  fingerprint: string;
  actionId: string;
  promise: Promise<RoomAck>;
}

/** A single process owns mutation; tick batches preserve simultaneous contacts. */
export class FightRoom {
  private current: FightState;
  private pending: Pending[] = [];
  private receipts: [Map<number, Receipt>, Map<number, Receipt>] = [new Map(), new Map()];
  private actionIds: [Map<string, number>, Map<string, number>] = [new Map(), new Map()];
  private nextSeq: [number, number];
  private stopped = false;

  constructor(
    readonly fightId: string,
    state: FightState,
  ) {
    this.current = state;
    this.nextSeq = [...state.lastSeq];
  }
  get state(): FightState {
    return this.current;
  }

  enqueue(player: 0 | 1, body: FightActionPayload, receivedAt: number): Promise<RoomAck> {
    const denied = (reason: string) =>
      Promise.reject<RoomAck>(new AppError('conflict', reason, 409, { reason }));
    if (this.stopped) return denied('owner_lost');
    if (body.fightId !== this.fightId) return denied('unknown_fight');
    const fingerprint = JSON.stringify(
      body.kind === 'input'
        ? [body.phaseId, body.kind, body.input.direction, body.input.crouch, body.input.guard]
        : body.kind === 'move'
          ? [body.phaseId, body.kind, body.direction]
          : [body.phaseId, body.kind, body.zone],
    );
    const prior = this.receipts[player].get(body.seq);
    if (prior)
      return prior.fingerprint === fingerprint && prior.actionId === body.actionId
        ? prior.promise
        : denied('duplicate_payload_mismatch');
    if (this.actionIds[player].has(body.actionId)) return denied('duplicate_payload_mismatch');
    if (!['fighting', 'sudden_death'].includes(this.current.status)) return denied('finished');
    if (body.phaseId !== this.current.phaseId) return denied('old_phase');
    if (!Number.isSafeInteger(receivedAt) || receivedAt < this.current.phaseStartedAtMs)
      return denied('not_started');
    if (receivedAt >= this.current.deadlineMs) return denied('late_action');
    if (body.kind !== 'input' && body.kind !== 'attack') return denied('unsupported_action');
    if (body.seq !== this.nextSeq[player] + 1) return denied('sequence');
    if (this.pending.length >= 64 || this.receipts[player].size >= 1024)
      return denied('rate_limit');
    // Commands received in the same millisecond as the last tick join the next tick.
    const effectiveAtMs = Math.max(receivedAt, this.current.finalizedThroughMs + 1);
    if (effectiveAtMs >= this.current.deadlineMs) return denied('late_action');
    const command: FightCommand = {
      player,
      phaseId: body.phaseId,
      seq: body.seq,
      actionId: body.actionId,
      effectiveAtMs,
      ...(body.kind === 'input'
        ? { kind: body.kind, input: { ...body.input } }
        : { kind: body.kind, zone: body.zone }),
    };
    const promise = new Promise<RoomAck>((resolve, reject) => {
      this.pending.push({ player, command, resolve, reject });
    });
    this.nextSeq[player] = body.seq;
    this.receipts[player].set(body.seq, { fingerprint, actionId: body.actionId, promise });
    this.actionIds[player].set(body.actionId, body.seq);
    return promise;
  }

  tick(now: number): void {
    if (this.stopped || now <= this.current.finalizedThroughMs || !Number.isSafeInteger(now))
      return;
    // Interpolate positions between 20 Hz frames instead of replaying idle history at 100 Hz.
    // Inputs, scheduled attacks/recovery and phase deadlines still run on the next tick.
    const frame = this.current.responsive?.timeline.at(-1);
    const scheduled =
      this.current.actions.some((a) => !a.resolved && a.activeAtMs <= now) ||
      frame?.players.some(
        (p) => p.readyAtMs > this.current.finalizedThroughMs && p.readyAtMs <= now,
      );
    if (
      this.pending.length === 0 &&
      !scheduled &&
      now < this.current.deadlineMs &&
      now - this.current.finalizedThroughMs < 50
    )
      return;
    const batch = this.pending.filter((item) => item.command.effectiveAtMs <= now);
    this.pending = this.pending.filter((item) => item.command.effectiveAtMs > now);
    const transition = advanceFight(
      this.current,
      batch.map((item) => item.command),
      now,
    );
    this.current = transition.state;
    for (const item of batch) {
      const failure = transition.events.find(
        (event) =>
          event.type === 'rejected' &&
          event.player === item.player &&
          event.seq === item.command.seq,
      );
      item.resolve(
        failure?.type === 'rejected'
          ? { accepted: false, seq: item.command.seq, reason: failure.reason }
          : { accepted: true, seq: item.command.seq },
      );
    }
  }

  stop(): void {
    this.stopped = true;
    for (const item of this.pending)
      item.reject(new AppError('conflict', 'owner_lost', 409, { reason: 'owner_lost' }));
    this.pending = [];
  }
}
