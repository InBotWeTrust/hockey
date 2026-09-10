import { describe, expect, it } from 'vitest';
import { duelVenueRole } from '../../src/duel/amateur/routes.js';

describe('duelVenueRole', () => {
  it.each([
    {
      name: 'ordinary challenge',
      match: { source: 'challenge' as const, venuePolicy: 'neutral_default' as const, homeUserId: null },
      userId: 'u1',
      expected: 'neutral',
    },
    {
      name: 'tournament home player',
      match: { source: 'tournament' as const, venuePolicy: 'home_selected' as const, homeUserId: 'u1' },
      userId: 'u1',
      expected: 'home',
    },
    {
      name: 'tournament away player',
      match: { source: 'tournament' as const, venuePolicy: 'home_selected' as const, homeUserId: 'u1' },
      userId: 'u2',
      expected: 'away',
    },
    {
      name: 'neutral tournament fixture',
      match: { source: 'tournament' as const, venuePolicy: 'neutral_default' as const, homeUserId: null },
      userId: 'u2',
      expected: 'neutral',
    },
  ])('returns $expected for $name', ({ match, userId, expected }) => {
    expect(duelVenueRole(match, userId)).toBe(expected);
  });
});
