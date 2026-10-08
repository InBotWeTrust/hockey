import { fightInRange } from './movement.js';
import type {
  FightRules,
  FightState,
  FightCommand,
  FightTransition,
  FightEvent,
  FightAction,
  FightPlayer,
} from './types.js';

export function createFightState(rules: FightRules, phaseStartMs: number): FightState {
  return {
    rules: { ...rules },
    phaseId: 0,
    phaseStartedAtMs: phaseStartMs,
    deadlineMs: phaseStartMs + rules.mainDurationMs,
    status: 'fighting',
    hp: [rules.initialHp, rules.initialHp],
    winner: null,
    actions: [],
    moves: [],
    lastSeq: [0, 0],
    finalizedThroughMs: phaseStartMs - 1,
  };
}

/** Advances only sealed action groups. The server owns admission and the delivery grace. */
export function advanceFight(
  input: FightState,
  commands: readonly FightCommand[],
  finalizedThroughMs: number,
): FightTransition {
  const state: FightState = {
    ...input,
    rules: { ...input.rules },
    hp: [...input.hp],
    moves: (input.moves ?? []).map((m) => ({ ...m })),
    lastSeq: [...input.lastSeq],
    actions: input.actions.map((a) => ({ ...a })),
  };
  const events: FightEvent[] = [];
  if (state.status === 'resolved' || state.status === 'cancelled') return { state, events };
  if (!Number.isSafeInteger(finalizedThroughMs) || finalizedThroughMs < state.finalizedThroughMs)
    return { state, events };
  const sorted = [...commands].sort(
    (a, b) => a.effectiveAtMs - b.effectiveAtMs || a.player - b.player || a.seq - b.seq,
  );
  for (const cmd of sorted) {
    const reject = (reason: 'phase' | 'duplicate' | 'busy' | 'time'): void => {
      events.push({ type: 'rejected', player: cmd.player, seq: cmd.seq, reason });
    };
    if (cmd.phaseId !== state.phaseId) {
      reject('phase');
      continue;
    }
    if (cmd.seq <= state.lastSeq[cmd.player]) {
      reject('duplicate');
      continue;
    }
    state.lastSeq[cmd.player] = cmd.seq;
    if (
      !Number.isSafeInteger(cmd.effectiveAtMs) ||
      cmd.effectiveAtMs < state.phaseStartedAtMs ||
      cmd.effectiveAtMs >= state.deadlineMs
    ) {
      reject('time');
      continue;
    }
    if (cmd.kind === 'move') {
      if (state.rules.version >= 2) state.moves!.push({ ...cmd });
      continue;
    }
    if (state.actions.some((a) => a.player === cmd.player && cmd.effectiveAtMs < a.busyUntilMs)) {
      reject('busy');
      continue;
    }
    const attack = cmd.kind === 'attack';
    const activeAtMs = cmd.effectiveAtMs + (attack ? state.rules.windupMs : 0);
    const activeUntilMs = activeAtMs + (attack ? state.rules.activeMs : state.rules.blockMs);
    state.actions.push({
      ...cmd,
      activeAtMs,
      activeUntilMs,
      busyUntilMs:
        activeUntilMs + (attack ? state.rules.attackRecoveryMs : state.rules.blockRecoveryMs),
      resolved: false,
    });
  }
  state.actions.sort((a, b) => a.activeAtMs - b.activeAtMs || a.player - b.player || a.seq - b.seq);
  const attacks = state.actions.filter((a) => a.kind === 'attack' && !a.resolved);
  const finish = (winner: FightPlayer | null, atMs: number): void => {
    state.status = winner === null ? 'cancelled' : 'resolved';
    state.winner = winner;
    state.endedAtMs = atMs;
    events.push({ type: 'result', winner, atMs });
  };
  const suddenDeath = (atMs: number): void => {
    state.status = 'sudden_death';
    state.hp = [1, 1];
    state.phaseId += 1;
    state.phaseStartedAtMs = atMs + state.rules.deliveryGraceMs;
    state.deadlineMs = state.phaseStartedAtMs + state.rules.suddenDeathDurationMs;
    state.actions = [];
    state.moves = [];
    events.push({ type: 'phase', phaseId: state.phaseId, startsAtMs: state.phaseStartedAtMs });
  };
  const clean = (attack: FightAction): boolean =>
    !state.actions.some(
      (block) =>
        block.kind === 'block' &&
        block.player !== attack.player &&
        block.zone === attack.zone &&
        block.activeAtMs <= attack.activeAtMs &&
        attack.activeAtMs < block.activeUntilMs,
    );
  for (const attack of attacks) {
    if (attack.resolved) continue;
    if (attack.activeAtMs >= state.deadlineMs) {
      attack.resolved = true;
      continue;
    }
    const closeAt = Math.min(attack.activeUntilMs, state.deadlineMs);
    if (finalizedThroughMs < closeAt) break;
    const other = attacks.find(
      (a) =>
        !a.resolved &&
        a.player !== attack.player &&
        a.activeAtMs < closeAt &&
        a.activeUntilMs > attack.activeAtMs,
    );
    const group = other ? [attack, other] : [attack];
    const damage: [number, number] = [0, 0];
    for (const a of group) {
      a.resolved = true;
      const inRange = fightInRange(state, a.activeAtMs);
      const unblocked = clean(a);
      a.outcome = !inRange ? 'miss' : unblocked ? 'hit' : 'blocked';
      if (inRange && unblocked) damage[a.player === 0 ? 1 : 0] += 1;
    }
    state.hp = [Math.max(0, state.hp[0] - damage[0]), Math.max(0, state.hp[1] - damage[1])];
    if (damage[0] || damage[1]) events.push({ type: 'damage', atMs: closeAt, damage });
    if (state.hp[0] === 0 && state.hp[1] === 0) {
      if (state.status === 'sudden_death') {
        state.hp = [1, 1];
      } else {
        suddenDeath(closeAt);
        return { state, events };
      }
    } else if (state.hp[0] === 0 || state.hp[1] === 0) {
      finish(state.hp[0] === 0 ? 1 : 0, closeAt);
      return { state, events };
    }
  }
  if (finalizedThroughMs >= state.deadlineMs) {
    if (state.hp[0] !== state.hp[1]) finish(state.hp[0] > state.hp[1] ? 0 : 1, state.deadlineMs);
    else if (state.status === 'sudden_death') finish(null, state.deadlineMs);
    else suddenDeath(state.deadlineMs);
  }
  state.finalizedThroughMs = finalizedThroughMs;
  return { state, events };
}
