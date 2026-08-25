import { describe, expect, it } from 'vitest';
import { decideNextFixtureSegment } from '../../src/tournament/segments.js';

describe('fixture segment progression', () => {
  const rules = { overtimeCount: 2, shootoutInitialShots: 3 };

  it('finishes immediately when regulation has a winner', () => {
    expect(
      decideNextFixtureSegment({ kind: 'regulation', sequenceNumber: 1, pairNumber: null }, 3, 2, rules),
    ).toEqual({ completed: true, winner: 'home' });
  });

  it('runs configured overtimes before the initial shootout', () => {
    expect(
      decideNextFixtureSegment({ kind: 'regulation', sequenceNumber: 1, pairNumber: null }, 2, 2, rules),
    ).toMatchObject({ completed: false, next: { kind: 'overtime', sequenceNumber: 2, pairNumber: 1 } });
    expect(
      decideNextFixtureSegment({ kind: 'overtime', sequenceNumber: 3, pairNumber: 2 }, 2, 2, rules),
    ).toMatchObject({ completed: false, next: { kind: 'shootout_initial', pairNumber: null } });
  });

  it('creates unlimited equal sudden-death pairs until one wins', () => {
    expect(
      decideNextFixtureSegment(
        { kind: 'shootout_initial', sequenceNumber: 4, pairNumber: null },
        1,
        1,
        rules,
      ),
    ).toMatchObject({ completed: false, next: { kind: 'shootout_sudden_death', pairNumber: 1 } });
    expect(
      decideNextFixtureSegment(
        { kind: 'shootout_sudden_death', sequenceNumber: 104, pairNumber: 100 },
        0,
        0,
        rules,
      ),
    ).toMatchObject({ completed: false, next: { kind: 'shootout_sudden_death', pairNumber: 101 } });
  });
});
