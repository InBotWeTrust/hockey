import { describe, expect, it } from 'vitest';
import {
  parseRules,
  tournamentScheduleOtherGamesQuerySchema,
  tournamentScheduleQuerySchema,
  tournamentTitleSchema,
} from '../../src/tournament/routes.js';

describe('tournament route validation', () => {
  it('returns a bad request for obsolete daily-aggregate rules', () => {
    expect(() =>
      parseRules({
        config: {
          regularSource: 'daily_aggregate',
          participantLimit: 16,
          playoffSize: 8,
          timezone: 'Europe/Moscow',
          registrationMode: 'open',
          visibility: 'public',
          entryFeeCoins: 0,
          roundRobinCycles: null,
          roundsPerDay: null,
          firstRoundLocalTime: null,
          fixtureWindowMs: null,
          roundBreakMs: null,
          dailyDays: 7,
          dailyMetric: 'goals_sum',
          bestDays: null,
        },
        eligibility: {
          minLevel: null,
          maxLevel: null,
          minGoals: 0,
          minExperience: 0,
          invitedUserIds: [],
          bannedUserIds: [],
        },
      }),
    ).toThrow(expect.objectContaining({ code: 'bad_request', statusCode: 400 }));
  });

  it('rejects tournament titles longer than 60 characters', () => {
    expect(tournamentTitleSchema.safeParse('Т'.repeat(60)).success).toBe(true);
    expect(tournamentTitleSchema.safeParse('Т'.repeat(61)).success).toBe(false);
  });

  it('requires an explicit local date for a public schedule read', () => {
    expect(tournamentScheduleQuerySchema.safeParse({ date: '2030-09-03' }).success).toBe(true);
    expect(tournamentScheduleQuerySchema.safeParse({}).success).toBe(false);
    expect(tournamentScheduleQuerySchema.safeParse({ date: '03.09.2030' }).success).toBe(false);
  });

  it('accepts only complete stable cursors for other-game pages', () => {
    expect(
      tournamentScheduleOtherGamesQuerySchema.safeParse({
        date: '2030-09-03',
        cursorFixtureNumber: '15',
        cursorId: '00000000-0000-4000-8000-000000000715',
      }).success,
    ).toBe(true);
    expect(
      tournamentScheduleOtherGamesQuerySchema.safeParse({
        date: '2030-09-03',
        cursorFixtureNumber: '15',
      }).success,
    ).toBe(false);
  });
});
