import { describe, expect, it } from 'vitest';
import { tournamentTitleSchema } from '../../src/tournament/routes.js';

describe('tournament route validation', () => {
  it('rejects tournament titles longer than 60 characters', () => {
    expect(tournamentTitleSchema.safeParse('Т'.repeat(60)).success).toBe(true);
    expect(tournamentTitleSchema.safeParse('Т'.repeat(61)).success).toBe(false);
  });
});
