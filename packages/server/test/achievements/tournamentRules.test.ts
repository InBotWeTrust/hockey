import { describe, expect, it } from 'vitest';
import {
  accuracyAtLeast,
  hockeySeasonKey,
  isMoreExperiencedOpponent,
  isSeriesComeback,
  reachesDeathBracket,
  type ResolvedPlayerSeries,
} from '../../src/achievements/tournamentRules.js';

function series(
  seriesId: string,
  day: number,
  overrides: Partial<ResolvedPlayerSeries> = {},
): ResolvedPlayerSeries {
  return {
    seriesId,
    tournamentId: `tournament-${seriesId}`,
    completedAt: new Date(`2026-09-${String(day).padStart(2, '0')}T12:00:00.000Z`),
    result: 'played_win',
    playerExperience: 100,
    opponentExperience: 101,
    ...overrides,
  };
}

describe('hockeySeasonKey', () => {
  it.each([
    ['2026-08-31T23:59:59.999Z', '2025-2026'],
    ['2026-09-01T00:00:00.000Z', '2026-2027'],
  ])('maps a tournament-local instant %s to season %s', (instant, expected) => {
    expect(hockeySeasonKey(new Date(instant))).toBe(expected);
  });
});

describe('accuracyAtLeast', () => {
  it.each([
    [90, 100, true],
    [9, 10, true],
    [89, 100, false],
    [0, 0, false],
  ])('evaluates %i goals from %i shots at a 90%% threshold', (goals, shots, expected) => {
    expect(accuracyAtLeast(goals, shots, 0.9)).toBe(expected);
  });
});

describe('more-experienced opponent rules', () => {
  it('requires both snapshots and a strictly stronger opponent', () => {
    expect(isMoreExperiencedOpponent(series('stronger', 1))).toBe(true);
    expect(isMoreExperiencedOpponent(series('equal', 2, { opponentExperience: 100 }))).toBe(false);
    expect(isMoreExperiencedOpponent(series('missing', 3, { playerExperience: null }))).toBe(false);
  });

  it('unlocks on the third consecutive played win against more experienced opponents', () => {
    const first = series('first', 1);
    const second = series('second', 2);
    const third = series('third', 3);

    expect(reachesDeathBracket([third, first, second])).toEqual({
      achievedAt: third.completedAt,
      qualifyingSeriesIds: ['first', 'second', 'third'],
    });
  });

  it.each([
    ['a loss', series('reset', 2, { result: 'loss' })],
    ['a win over a not-more-experienced opponent', series('reset', 2, { opponentExperience: 100 })],
    ['a technical win', series('reset', 2, { result: 'technical_win' })],
    ['a cancelled resolved series', series('reset', 2, { result: 'cancelled' })],
    ['a series with an unavailable snapshot', series('reset', 2, { opponentExperience: null })],
  ])('resets the chain after %s', (_label, resetSeries) => {
    expect(
      reachesDeathBracket([
        series('before-reset', 1),
        resetSeries,
        series('after-reset-one', 3),
        series('after-reset-two', 4),
      ]),
    ).toEqual({ achievedAt: null, qualifyingSeriesIds: [] });
  });

  it('allows repeated opponents and a third-place win because the series shape is generic', () => {
    const quarterfinal = series('quarterfinal-vs-same-player', 1, {
      tournamentId: 'tournament-a',
    });
    const nextTournament = series('next-tournament-vs-same-player', 2, {
      tournamentId: 'tournament-b',
    });
    const thirdPlace = series('third-place-vs-same-player', 3, {
      tournamentId: 'tournament-b',
    });

    expect(reachesDeathBracket([quarterfinal, nextTournament, thirdPlace])).toEqual({
      achievedAt: thirdPlace.completedAt,
      qualifyingSeriesIds: [
        'quarterfinal-vs-same-player',
        'next-tournament-vs-same-player',
        'third-place-vs-same-player',
      ],
    });
  });
});

describe('isSeriesComeback', () => {
  const winner = 'eventual-winner';
  const opponent = 'opponent';

  function fixture(
    fixtureId: string,
    day: number,
    winnerParticipantId: string | null,
    played = true,
  ) {
    return {
      fixtureId,
      settledAt: new Date(`2026-09-${String(day).padStart(2, '0')}T12:00:00.000Z`),
      winnerParticipantId,
      played,
    };
  }

  it('recognises a fully played 0-1 to 2-1 comeback', () => {
    expect(
      isSeriesComeback({
        winsRequired: 2,
        eventualWinnerParticipantId: winner,
        fixtures: [
          fixture('decider', 3, winner),
          fixture('loss', 1, opponent),
          fixture('tie', 2, winner),
        ],
      }),
    ).toBe(true);
  });

  it.each([
    ['a one-win series', 1, [fixture('win', 1, winner)]],
    [
      'a series where the winner never trailed',
      2,
      [fixture('win', 1, winner), fixture('loss', 2, opponent), fixture('decider', 3, winner)],
    ],
    [
      'a technical loss that only appears to put the winner behind',
      2,
      [
        fixture('technical-loss', 1, opponent, false),
        fixture('win', 2, winner),
        fixture('decider', 3, winner),
      ],
    ],
    [
      'a technical win by the eventual winner',
      2,
      [
        fixture('loss', 1, opponent),
        fixture('technical-win', 2, winner, false),
        fixture('decider', 3, winner),
      ],
    ],
    [
      'a technical deciding win',
      2,
      [
        fixture('loss', 1, opponent),
        fixture('tie', 2, winner),
        fixture('technical-decider', 3, winner, false),
      ],
    ],
  ])('rejects %s', (_label, winsRequired, fixtures) => {
    expect(
      isSeriesComeback({
        winsRequired,
        eventualWinnerParticipantId: winner,
        fixtures,
      }),
    ).toBe(false);
  });
});
