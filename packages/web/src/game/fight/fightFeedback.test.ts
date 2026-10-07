import { describe, expect, it } from 'vitest';
import {
  advanceFight,
  createFightState,
  DEFAULT_FIGHT_RULES,
  type FightCommand,
} from '@hockey/game-core';
import { FightFeedbackTracker } from './fightFeedback.js';
const command = (
  player: 0 | 1,
  kind: 'attack' | 'block',
  zone: 'head' | 'body' = 'head',
): FightCommand => ({ player, kind, zone, phaseId: 0, seq: 1, effectiveAtMs: 1000 });
const base = () => createFightState(DEFAULT_FIGHT_RULES, 0);
describe('confirmed fight feedback', () => {
  it('plays a confirmed hit once, expires it, and does not replay it on reconnect', () => {
    const initial = base();
    const tracker = new FightFeedbackTracker(initial);
    const pending = advanceFight(initial, [command(0, 'attack')], 1100).state;
    expect(tracker.advance(pending, 1100)).toEqual([]);
    const hit = advanceFight(pending, [], 1600).state;
    const effects = tracker.advance(hit, 1600);
    expect(effects).toHaveLength(1);
    expect(effects[0]).toMatchObject({ attacker: 0, defender: 1, blocked: false, zone: 'head' });
    expect(tracker.advance(hit, 1650)).toEqual(effects);
    expect(tracker.advance(hit, 2200)).toEqual([]);
    expect(new FightFeedbackTracker(hit).advance(hit, 2200)).toEqual([]);
  });
  it('only counts the matching block active at contact, not a different zone or late guard', () => {
    for (const [zone, time, blocked] of [
      ['head', 1000, true],
      ['body', 1000, false],
      ['head', 1501, false],
    ] as const) {
      const initial = base();
      const tracker = new FightFeedbackTracker(initial);
      const state = advanceFight(
        initial,
        [command(0, 'attack'), { ...command(1, 'block', zone), effectiveAtMs: time }],
        1600,
      ).state;
      expect(tracker.advance(state, 1600)[0]).toMatchObject({ blocked });
    }
  });
  it('shows simultaneous trades and discards effects when the phase changes', () => {
    const initial = base();
    const tracker = new FightFeedbackTracker(initial);
    const trade = advanceFight(initial, [command(0, 'attack'), command(1, 'attack')], 1600).state;
    expect(tracker.advance(trade, 1600)).toHaveLength(2);
    expect(tracker.advance({ ...trade, phaseId: 1, actions: [] }, 1650)).toEqual([]);
  });
  it('skips attacks sealed long before a delayed snapshot arrives', () => {
    const tracker = new FightFeedbackTracker(base());
    const state = advanceFight(base(), [command(0, 'attack')], 1600).state;
    expect(tracker.advance(state, 8000)).toEqual([]);
  });
});
