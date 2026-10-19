import type { FightState } from '@hockey/game-core';

/** Contact emphasis only: never pauses authoritative clocks or input delivery. */
export class FightHitstop {
  private seen: Set<string>;
  private phase: number;
  private at = 0;
  private until = 0;
  constructor(state: FightState) {
    this.phase = state.phaseId;
    this.seen = new Set(state.responsive?.contacts.map(c => c.id) ?? []);
  }
  observe(state: FightState, now: number): void {
    if (state.phaseId !== this.phase) {
      this.phase = state.phaseId;
      this.until = 0;
    }
    let duration = 0;
    for (const contact of state.responsive?.contacts ?? []) {
      if (this.seen.has(contact.id)) continue;
      this.seen.add(contact.id);
      if (contact.outcome === 'hit') duration = Math.max(duration, state.hp[contact.defender] === 0 ? 90 : 60);
      if (contact.outcome === 'blocked') duration = Math.max(duration, 35);
    }
    if (duration) {
      this.at = now;
      this.until = now + duration;
    }
  }
  time(now: number): number { return now < this.until ? this.at : now; }
}
