import { describe, expect, it } from 'vitest';
import {
  tournamentScheduleOtherGamesQuerySchema,
  tournamentScheduleQuerySchema,
  tournamentTitleSchema,
} from '../../src/tournament/routes.js';

describe('tournament route validation', () => {
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
