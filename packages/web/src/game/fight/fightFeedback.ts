import type { FightState, FightZone } from '@hockey/game-core';
export const FIGHT_FEEDBACK_MS = 520;
export interface FightFeedback {
  id: string;
  attacker: 0 | 1;
  defender: 0 | 1;
  zone: FightZone;
  blocked: boolean;
  startedAtMs: number;
}
/** Only new, sealed attacks produce feedback; mounting/reconnecting never replays history. */
export class FightFeedbackTracker {
  private phaseId: number;
  private seen: Set<string>;
  private effects: FightFeedback[] = [];
  constructor(state: FightState) {
    this.phaseId = state.phaseId;
    this.seen = new Set(state.actions.filter((a) => a.resolved).map((a) => `${a.player}:${a.seq}`));
  }
  advance(state: FightState, nowMs: number): FightFeedback[] {
    if (this.phaseId !== state.phaseId) {
      this.phaseId = state.phaseId;
      this.seen = new Set(
        state.actions.filter((a) => a.resolved).map((a) => `${a.player}:${a.seq}`),
      );
      this.effects = [];
      return this.effects;
    }
    this.effects = this.effects.filter((e) => nowMs < e.startedAtMs + FIGHT_FEEDBACK_MS);
    for (const attack of state.actions) {
      if (attack.kind !== 'attack' || !attack.resolved) continue;
      const key = `${attack.player}:${attack.seq}`;
      if (this.seen.has(key)) continue;
      this.seen.add(key);
      if (attack.activeAtMs >= state.deadlineMs || nowMs - attack.activeUntilMs > 1500) continue;
      const defender = attack.player === 0 ? 1 : 0;
      const blocked = state.actions.some(
        (block) =>
          block.kind === 'block' &&
          block.player === defender &&
          block.zone === attack.zone &&
          block.activeAtMs <= attack.activeAtMs &&
          attack.activeAtMs < block.activeUntilMs,
      );
      this.effects.push({
        id: `${state.phaseId}:${key}`,
        attacker: attack.player,
        defender,
        zone: attack.zone,
        blocked,
        startedAtMs: nowMs,
      });
    }
    return this.effects;
  }
}
