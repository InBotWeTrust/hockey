import { describe, expect, it } from 'vitest';
import {
  advanceBarResult,
  barStageTarget,
  BAR_DEFINITIONS,
} from '../../src/achievements/barCatalog.js';
describe('real bar achievement rules', () => {
  it('preserves all approved cards, levels and reward totals', () => {
    expect(BAR_DEFINITIONS).toHaveLength(95);
    expect(BAR_DEFINITIONS.flatMap((x) => x.levels)).toHaveLength(274);
    expect(BAR_DEFINITIONS.flatMap((x) => x.levels).reduce((s, x) => s + x.stars, 0)).toBe(10413);
    expect(barStageTarget(9, 6, 4)).toBe(4);
    expect(barStageTarget(1, 1000, 8)).toBe(1000);
  });
  it('keeps wins and peak streak while losses break the active streak', () => {
    let s = advanceBarResult(undefined, 'daria', true);
    s = advanceBarResult(s, 'daria', true);
    expect(s).toMatchObject({ wins: 2, streak: 2, bestStreak: 2, rematch: false });
    s = advanceBarResult(s, 'daria', false);
    expect(s).toMatchObject({ wins: 2, streak: 0, bestStreak: 2 });
    s = advanceBarResult(s, 'daria', true);
    expect(s).toMatchObject({ wins: 3, streak: 1, bestStreak: 2, rematch: true });
  });
  it('requires the immediate next result against the same opponent for a rematch', () => {
    const lost = advanceBarResult(undefined, 'player-a', false);
    expect(advanceBarResult(lost, 'player-b', true).rematch).toBe(false);
    const draw = advanceBarResult(lost, 'player-a', false, false);
    expect(advanceBarResult(draw, 'player-a', true).rematch).toBe(false);
  });
});
