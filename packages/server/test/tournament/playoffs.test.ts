import { describe, expect, it } from 'vitest';
import {
  buildFixedPlayoffBracket,
  buildPlayoffFixtureWindows,
  buildPlayoffSeriesPlan,
  expandSeriesSchedule,
} from '../../src/tournament/playoffs.js';

describe('fixed playoff bracket', () => {
  it.each([2, 4, 8, 16])('pairs 1-N without reseeding for %i players', (size) => {
    const seeds = Array.from({ length: size }, (_, index) => `p${index + 1}`);
    const bracket = buildFixedPlayoffBracket(seeds);
    expect(bracket.firstRound[0]).toMatchObject({ higherSeedId: 'p1', lowerSeedId: `p${size}` });
    expect(bracket.thirdPlaceRequired).toBe(size >= 4);
  });

  it('prebuilds the maximum conditional schedule from the home pattern', () => {
    expect(expandSeriesSchedule(4, ['H', 'H', 'A', 'A', 'H', 'A', 'H'])).toEqual([
      { gameNumber: 1, higherSeedIsHome: true, conditional: false },
      { gameNumber: 2, higherSeedIsHome: true, conditional: false },
      { gameNumber: 3, higherSeedIsHome: false, conditional: false },
      { gameNumber: 4, higherSeedIsHome: false, conditional: false },
      { gameNumber: 5, higherSeedIsHome: true, conditional: true },
      { gameNumber: 6, higherSeedIsHome: false, conditional: true },
      { gameNumber: 7, higherSeedIsHome: true, conditional: true },
    ]);
  });

  it('builds dependent rounds and a separate third-place series', () => {
    const plan = buildPlayoffSeriesPlan(['p1', 'p2', 'p3', 'p4']);
    expect(plan.map((series) => series.key)).toEqual(['R1S1', 'R1S2', 'R2S1', 'BRONZE']);
    expect(plan[2]).toMatchObject({
      higherSource: { type: 'winner', seriesKey: 'R1S1' },
      lowerSource: { type: 'winner', seriesKey: 'R1S2' },
    });
    expect(plan[3]).toMatchObject({
      kind: 'third_place',
      higherSource: { type: 'loser', seriesKey: 'R1S1' },
      lowerSource: { type: 'loser', seriesKey: 'R1S2' },
    });
  });

  it('builds injectable series windows with configured breaks', () => {
    expect(
      buildPlayoffFixtureWindows({
        gameCount: 3,
        firstStart: new Date('2030-09-01T10:00:00.000Z'),
        gameWindowMs: 60 * 60_000,
        gameBreakMs: 30 * 60_000,
      }),
    ).toEqual([
      { gameNumber: 1, startsAt: '2030-09-01T10:00:00.000Z', endsAt: '2030-09-01T11:00:00.000Z' },
      { gameNumber: 2, startsAt: '2030-09-01T11:30:00.000Z', endsAt: '2030-09-01T12:30:00.000Z' },
      { gameNumber: 3, startsAt: '2030-09-01T13:00:00.000Z', endsAt: '2030-09-01T14:00:00.000Z' },
    ]);
  });
});
