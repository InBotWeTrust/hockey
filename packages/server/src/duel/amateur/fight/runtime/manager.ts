import { AppError } from '../../../../plugins/errors.js';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type { FastifyInstance } from 'fastify';
import type { FightState } from '@hockey/game-core';
import type { FightDuelAdapter } from '../routes.js';
import type { FightActionPayload } from '../commands.js';
import {
  getFight,
  persistAdvancedFight,
  queueFightSnapshot,
  denyFight,
  type PersistedFight,
} from '../service.js';
import { FightRoom, type RoomAck } from './room.js';
import { renewRuntimeLease, RUNTIME_LEASE_MS } from './persistence.js';

interface Entry {
  fight: PersistedFight;
  room: FightRoom;
  users: [string, string];
  generation: number;
  revisionLimit: number;
  expires: number;
  savedAt: number;
  sentAt: number;
  revision: number;
  saving: boolean;
  retryAt: number;
  publishing: boolean;
  visible: FightState;
  contactCount: number;
}
/** Initial deployment is one configured game process. Database fencing protects settlement. */
export class FightRuntime {
  private readonly owner = randomUUID();
  private readonly rooms = new Map<string, Entry>();
  private readonly loading = new Map<string, Promise<Entry | null>>();
  private readonly jobs = new Set<Promise<void>>();
  private stopped = false;
  private scanning = false;
  private timer: ReturnType<typeof setInterval> | undefined;
  private scanner: ReturnType<typeof setInterval> | undefined;
  constructor(
    private app: FastifyInstance,
    private adapter: FightDuelAdapter,
  ) {}

  start(recovery = true): void {
    this.timer = setInterval(() => this.tick(), 10);
    this.timer.unref();
    if (!recovery) return;
    this.scanner = setInterval(() => {
      if (!this.scanning && !this.stopped) {
        this.scanning = true;
        this.track(
          this.scan().finally(() => {
            this.scanning = false;
          }),
        );
      }
    }, 1000);
    this.scanner.unref();
  }
  private track(job: Promise<void>): void {
    const guarded = job.catch((err) =>
      this.app.log.error({ err }, 'fight runtime operation failed'),
    );
    this.jobs.add(guarded);
    void guarded.finally(() => this.jobs.delete(guarded));
  }
  private async scan(): Promise<void> {
    const rows = await this.app.pg.query<{ match_id: string }>(
      "select match_id from amateur_duel_fight where runtime_version=1 and status in ('starting','fighting','sudden_death') order by offered_at limit 500",
    );
    for (const row of rows.rows) {
      if (this.stopped) break;
      await this.ensure(row.match_id);
    }
  }
  private async ensure(matchId: string): Promise<Entry | null> {
    const current = this.rooms.get(matchId);
    if (current) return current;
    const loading = this.loading.get(matchId);
    if (loading) return loading;
    if (this.rooms.size + this.loading.size >= 500) denyFight('room_limit');
    const load = this.acquire(matchId);
    this.loading.set(matchId, load);
    try {
      return await load;
    } finally {
      this.loading.delete(matchId);
    }
  }
  private async acquire(matchId: string): Promise<Entry | null> {
    const found = await this.app.pg.query<PersistedFight>(
      'select * from amateur_duel_fight where match_id=$1 order by offered_at desc,id desc limit 1',
      [matchId],
    );
    const candidate = found.rows[0];
    if (
      this.stopped ||
      candidate?.runtime_version !== 1 ||
      !['starting', 'fighting', 'sudden_death'].includes(candidate.status)
    )
      return null;
    return this.adapter
      .transact(async (client) => {
        const ctx = await this.adapter.prepare(client, matchId, candidate.initiator_user_id);
        const fight = await getFight(client, matchId);
        if (
          this.stopped ||
          fight?.id !== candidate.id ||
          !['starting', 'fighting', 'sudden_death'].includes(fight.status)
        )
          return null;
        if (fight.runtime_owner) {
          const cancelled = await client.query(
            `update amateur_duel_fight set status='cancelled',reason='runtime_interrupted',resolved_at=clock_timestamp(),call_refunded=true,revision=greatest(revision,runtime_revision_limit)+1,
          engine_state=case when engine_state is null then null else engine_state || jsonb_build_object('status','cancelled','winner',null,'endedAtMs',floor(extract(epoch from clock_timestamp())*1000)::bigint) end
          where id=$1 and runtime_owner is not null and runtime_lease_until<=clock_timestamp() and status in ('starting','fighting','sudden_death') returning id`,
            [fight.id],
          );
          if (cancelled.rowCount) await queueFightSnapshot(client, ctx.id);
          return null;
        }
        if (!fight.engine_state || ctx.status !== 'active' || ctx.mandatoryBlocked) return null;
        // Conservative monotonic deadline starts before the lease write, never after it.
        const expires = performance.now() + RUNTIME_LEASE_MS - 200;
        const claim = await client.query<PersistedFight>(
          `update amateur_duel_fight set runtime_owner=$2,runtime_generation=runtime_generation+1,runtime_revision_limit=revision+1000000,runtime_lease_until=clock_timestamp()+interval '4 seconds'
        where id=$1 and runtime_owner is null returning *`,
          [fight.id, this.owner],
        );
        const claimed = claim.rows[0];
        if (!claimed) return null;
        const entry: Entry = {
          fight: claimed,
          room: new FightRoom(fight.id, fight.engine_state),
          users: [ctx.participants[0]!.userId, ctx.participants[1]!.userId],
          generation: Number(claimed.runtime_generation),
          revisionLimit: Number(claimed.runtime_revision_limit),
          expires,
          savedAt: 0,
          sentAt: 0,
          revision: Number(claimed.revision),
          saving: false,
          retryAt: 0,
          publishing: false,
          visible: fight.engine_state,
          contactCount: 0,
        };
        // Installation is deferred until acquire's transaction has committed by ensure's caller.
        return entry;
      })
      .then((entry) => {
        if (entry && !this.stopped) this.rooms.set(matchId, entry);
        return entry;
      });
  }
  async command(
    matchId: string,
    userId: string,
    body: FightActionPayload,
  ): Promise<RoomAck | null> {
    const entry = await this.ensure(matchId);
    if (!entry) return null;
    if (performance.now() >= entry.expires) {
      this.drop(matchId, entry);
      denyFight('owner_lost');
    }
    const player = entry.users.indexOf(userId);
    if (player !== 0 && player !== 1) denyFight('forbidden');
    return entry.room.enqueue(player, body, Date.now());
  }
  view(matchId: string, userId: string): Record<string, unknown> | null {
    const entry = this.rooms.get(matchId);
    if (!entry || !entry.users.includes(userId) || performance.now() >= entry.expires) return null;
    const state = entry.visible;
    const commands = ([0, 1] as const).flatMap((player) => {
      const input = [...(state.responsive?.commands ?? [])]
        .reverse()
        .find((c) => c.player === player && c.kind === 'input');
      return input ? [input] : [];
    });
    const compact: FightState = {
      ...state,
      actions: state.actions.filter((a) => a.busyUntilMs >= Date.now() - 1000),
      responsive: state.responsive
        ? {
            ...state.responsive,
            commands,
            timeline: state.responsive.timeline.slice(-1),
            contacts: state.responsive.contacts.slice(-64),
          }
        : undefined,
    } as FightState;
    return {
      type: 'fight:snapshot',
      matchId,
      serverNow: new Date().toISOString(),
      fight: {
        ...entry.fight,
        status: Date.now() < state.phaseStartedAtMs ? 'starting' : state.status,
        engine_state: compact,
        revision: entry.revision,
      },
    };
  }
  private drop(matchId: string, entry: Entry): void {
    entry.room.stop();
    if (this.rooms.get(matchId) === entry) this.rooms.delete(matchId);
  }
  private tick(): void {
    const now = Date.now();
    const monotonic = performance.now();
    for (const [matchId, entry] of this.rooms) {
      if (monotonic >= entry.expires || entry.revision >= entry.revisionLimit - 1) {
        this.drop(matchId, entry);
        continue;
      }
      if (now < entry.room.state.phaseStartedAtMs) continue;
      const before = entry.room.state;
      entry.room.tick(now);
      const state = entry.room.state;
      if (state.status === 'resolved' || state.status === 'cancelled') {
        if (!entry.saving && now >= entry.retryAt) {
          entry.saving = true;
          this.track(
            this.save(matchId, entry, true)
              .catch((error) => this.saveFailed(matchId, entry, error))
              .finally(() => {
                entry.saving = false;
              }),
          );
        }
        continue;
      }
      entry.visible = state;
      const contacts = state.responsive?.contacts.length ?? 0;
      const event =
        contacts !== entry.contactCount ||
        state.lastSeq[0] !== before.lastSeq[0] ||
        state.lastSeq[1] !== before.lastSeq[1] ||
        state.phaseId !== before.phaseId;
      if (event || now - entry.sentAt >= 50) {
        entry.revision++;
        entry.sentAt = now;
        entry.contactCount = contacts;
        if (!entry.publishing) {
          entry.publishing = true;
          this.track(
            this.notify(matchId, entry.revision).finally(() => {
              entry.publishing = false;
            }),
          );
        }
      }
      if (!entry.saving && now >= entry.retryAt && monotonic - entry.savedAt >= 1000) {
        entry.saving = true;
        this.track(
          this.save(matchId, entry, false)
            .catch((error) => this.saveFailed(matchId, entry, error))
            .finally(() => {
              entry.saving = false;
            }),
        );
      }
    }
  }
  private saveFailed(matchId: string, entry: Entry, error: unknown): never {
    entry.retryAt = Date.now() + 250;
    if (error instanceof AppError && error.code === 'not_found') this.drop(matchId, entry);
    throw error;
  }
  private async notify(matchId: string, revision: number): Promise<void> {
    await this.app.realtime.publish(`duel:fight:${matchId}`, {
      type: 'duel:fight_update',
      matchId,
      revision,
    });
  }
  private async save(matchId: string, entry: Entry, terminal: boolean): Promise<void> {
    const started = performance.now();
    const state = entry.room.state;
    const revision = entry.revision;
    const saved = await this.adapter.transact(async (client) => {
      const ctx = await this.adapter.prepare(client, matchId, entry.users[0]);
      if (!(await renewRuntimeLease(client, entry.fight.id, this.owner, entry.generation)))
        return false;
      const fight = await getFight(client, matchId);
      if (
        fight?.id !== entry.fight.id ||
        !['starting', 'fighting', 'sudden_death'].includes(fight.status) ||
        ctx.status !== 'active' ||
        ctx.mandatoryBlocked
      )
        return false;
      if (terminal) {
        // Bring durable revision up to the last emitted frame before final settlement.
        await client.query(
          'update amateur_duel_fight set revision=greatest(revision,$2) where id=$1',
          [fight.id, revision],
        );
        await persistAdvancedFight(client, ctx, fight, state);
      } else {
        await client.query(
          'update amateur_duel_fight set engine_state=$2,status=$3,revision=greatest(revision,$4) where id=$1',
          [fight.id, JSON.stringify(state), state.status, revision],
        );
      }
      return true;
    });
    if (!saved) {
      this.drop(matchId, entry);
      return;
    }
    entry.savedAt = started;
    entry.expires = started + RUNTIME_LEASE_MS - 200;
    if (terminal) {
      this.drop(matchId, entry);
      await this.notify(matchId, revision + 1);
    }
  }
  async close(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    if (this.scanner) clearInterval(this.scanner);
    for (const [id, entry] of this.rooms) this.drop(id, entry);
    await Promise.all([...this.jobs, ...this.loading.values()]);
  }
}
