import { describe, expect, it } from 'vitest';
import { parseTournamentConfig } from '../../src/tournament/config.js';
import {
  assertTournamentDatesReady,
  projectedTournamentEnd,
  type TournamentRulesSnapshot,
} from '../../src/tournament/service.js';

function rules(): TournamentRulesSnapshot {
  return {
    config: parseTournamentConfig({
      regularSource: 'head_to_head',
      participantLimit: 4,
      playoffSize: 2,
      timezone: 'Europe/Moscow',
      registrationMode: 'open',
      visibility: 'public',
      entryFeeCoins: 0,
      roundRobinCycles: 2,
      roundsPerDay: 2,
      firstRoundLocalTime: '10:00',
      fixtureWindowMs: 3_600_000,
      roundBreakMs: 900_000,
      dailyDays: null,
      dailyMetric: null,
      bestDays: null,
    }),
    eligibility: {
      minLevel: null,
      maxLevel: null,
      minGoals: 0,
      minExperience: 0,
      invitedUserIds: [],
      bannedUserIds: [],
    },
    playoffRounds: [
      {
        winsRequired: 2,
        gameWindowMs: 3_600_000,
        gameBreakMs: 1_800_000,
        roundBreakMs: 86_400_000,
      },
    ],
  };
}

describe('tournament dates', () => {
  it('requires registration opening, registration closing and tournament start in order', () => {
    expect(() => assertTournamentDatesReady(null, null, null)).toThrowError(
      expect.objectContaining({ code: 'dates_required' }),
    );
    expect(() =>
      assertTournamentDatesReady(
        new Date('2030-08-31T12:00:00.000Z'),
        new Date('2030-08-31T11:00:00.000Z'),
        new Date('2030-09-01T07:00:00.000Z'),
      ),
    ).toThrowError(expect.objectContaining({ code: 'invalid_date_order' }));
    expect(() =>
      assertTournamentDatesReady(
        new Date('2030-08-01T07:00:00.000Z'),
        new Date('2030-08-31T07:00:00.000Z'),
        new Date('2030-09-01T07:00:00.000Z'),
      ),
    ).not.toThrow();
  });

  it('projects the maximum schedule without adding a pause after the final series', () => {
    expect(projectedTournamentEnd(new Date('2030-09-01T07:00:00.000Z'), rules())?.toISOString()).toBe(
      '2030-09-03T13:15:00.000Z',
    );
  });
});
