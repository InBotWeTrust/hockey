import {
  advanceFight,
  createFightState,
  DEFAULT_FIGHT_RULES,
  getFightPosture,
  fightPositionsAt,
  type FightState,
  type FightCommand,
} from '@hockey/game-core';
export interface OlegFightRuntime {
  state: FightState;
  random: number;
  nextDecisionAt: number;
  nextAttackAt?: number;
}
export function createOlegRuntime(at: number, seed: number): OlegFightRuntime {
  return {
    state: createFightState(
      { ...DEFAULT_FIGHT_RULES, initialHpByPlayer: [5, 10], guardUnitsByPlayer: [3, 5] },
      at,
    ),
    random: seed >>> 0 || 1,
    nextDecisionAt: at + 300,
    nextAttackAt: at + 1800,
  };
}
export function advanceOlegRuntime(
  input: OlegFightRuntime,
  now: number,
  commands: FightCommand[] = [],
): OlegFightRuntime {
  if (['resolved', 'cancelled'].includes(input.state.status)) return input;
  const runtime: OlegFightRuntime = structuredClone(input);
  runtime.nextAttackAt ??= runtime.state.phaseStartedAtMs + 1800;
  const random = () => {
    let n = runtime.random;
    n ^= n << 13;
    n ^= n >>> 17;
    n ^= n << 5;
    runtime.random = n >>> 0;
    return runtime.random / 4294967296;
  };
  let pending = [...commands].sort((a, b) => a.effectiveAtMs - b.effectiveAtMs);
  const advance = (at: number) => {
    const due = pending.filter((c) => c.effectiveAtMs <= at);
    pending = pending.filter((c) => c.effectiveAtMs > at);
    runtime.state = advanceFight(runtime.state, due, at).state;
  };
  for (let decisions = 0; runtime.nextDecisionAt <= now && decisions < 1000; decisions++) {
    const at = Math.max(
      runtime.nextDecisionAt,
      runtime.state.phaseStartedAtMs,
      runtime.state.finalizedThroughMs + 1,
    );
    if (at > now) break;
    advance(at - 1);
    if (['resolved', 'cancelled'].includes(runtime.state.status)) break;
    if (at >= runtime.state.deadlineMs) {
      advance(at);
      runtime.nextDecisionAt = runtime.state.phaseStartedAtMs + 300;
      continue;
    }
    const posture = getFightPosture(runtime.state, 1, at - 1);
    const positions = fightPositionsAt(runtime.state, at - 1);
    const choose = random();
    let command: FightCommand;
    const base = {
      player: 1 as const,
      phaseId: runtime.state.phaseId,
      seq: runtime.state.lastSeq[1] + 1,
      effectiveAtMs: at,
    };
    if (at >= runtime.nextAttackAt! && at >= posture.readyAtMs && positions[1] - positions[0] <= 0.4 && choose < 0.44) {
      command = { ...base, kind: 'attack', zone: posture.crouch ? 'body' : 'head' };
      runtime.nextAttackAt = at + 1800 + Math.floor(random() * 701);
    } else {
      const cautious = runtime.state.hp[1] < 4;
      command = {
        ...base,
        kind: 'input',
        input: {
          direction:
            positions[1] - positions[0] > 0.4 ? 1 : choose > 0.86 ? -1 : choose > 0.65 ? 1 : 0,
          crouch: random() < 0.25,
          guard: posture.guardUnits > 0 && random() < (cautious ? 0.55 : 0.32),
        },
      };
    }
    runtime.state = advanceFight(runtime.state, [command], at).state;
    runtime.nextDecisionAt = at + 200 + Math.floor(random() * 351);
  }
  advance(now);
  return runtime;
}
