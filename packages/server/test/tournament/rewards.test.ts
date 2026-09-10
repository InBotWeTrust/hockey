import { describe, expect, it } from 'vitest';
import { resolvePlayoffPlacements } from '../../src/tournament/rewards.js';

describe('tournament playoff placements', () => {
  it('resolves champion, finalist, bronze and fourth place', () => {
    expect(
      resolvePlayoffPlacements({
        final: { higherId: 'a', lowerId: 'b', winnerId: 'b' },
        bronze: { higherId: 'c', lowerId: 'd', winnerId: 'c' },
      }),
    ).toEqual([
      { place: 1, participantId: 'b' },
      { place: 2, participantId: 'a' },
      { place: 3, participantId: 'c' },
      { place: 4, participantId: 'd' },
    ]);
  });
});
