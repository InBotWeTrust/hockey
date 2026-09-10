import { describe, expect, it } from 'vitest';
import {
  buildFixedPlayoffBracket,
  buildPlayoffFixtureWindows,
  buildPlayoffSeriesPlan,
  expandSeriesSchedule,
  resolveDelayedPlayoffRoundStart,
} from '../../src/tournament/playoffs.js';

describe('fixed playoff bracket', () => {
  it.each([2, 4, 8, 16])('pairs 1-N without reseeding for %i players', (size) => {
    const seeds = Array.from({ length: size }, (_, index) => `p${index + 1}`);
    const bracket = buildFixedPlayoffBracket(seeds);
    expect(bracket.firstRound[0]).toMatchObject({ higherSeedId: 'p1', lowerSeedId: `p${size}` });
    expect(bracket.thirdPlaceRequired).toBe(size >= 4);
  });

  it('keeps the top two seeds in opposite halves of an eight-player bracket', () => {
    const seeds = Array.from({ length: 8 }, (_, index) => `p${index + 1}`);
    expect(buildFixedPlayoffBracket(seeds).firstRound).toEqual([
      { bracketPosition: 1, higherSeedId: 'p1', lowerSeedId: 'p8' },
      { bracketPosition: 2, higherSeedId: 'p4', lowerSeedId: 'p5' },
      { bracketPosition: 3, higherSeedId: 'p2', lowerSeedId: 'p7' },
      { bracketPosition: 4, higherSeedId: 'p3', lowerSeedId: 'p6' },
    ]);
  });

  it('uses standard seeded paths for a sixteen-player bracket', () => {
    const seeds = Array.from({ length: 16 }, (_, index) => `p${index + 1}`);
    expect(
      buildFixedPlayoffBracket(seeds).firstRound.map((pairing) => [
        pairing.higherSeedId,
        pairing.lowerSeedId,
      ]),
    ).toEqual([
      ['p1', 'p16'],
      ['p8', 'p9'],
      ['p4', 'p13'],
      ['p5', 'p12'],
      ['p2', 'p15'],
      ['p7', 'p10'],
      ['p3', 'p14'],
      ['p6', 'p11'],
    ]);
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

  it('delays a past next-round start to thirty minutes after the final prior series settles', () => {
    expect(
      resolveDelayedPlayoffRoundStart({
        configuredStart: new Date('2030-09-01T10:00:00.000Z'),
        finalPriorSeriesSettledAt: new Date('2030-09-01T12:00:00.000Z'),
      }),
    ).toEqual(new Date('2030-09-01T12:30:00.000Z'));
  });
});
