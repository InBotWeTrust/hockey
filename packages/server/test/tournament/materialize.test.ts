import { describe, expect, it } from 'vitest';
import { buildHeadToHeadSchedulePlan } from '../../src/tournament/materialize.js';

describe('head-to-head schedule materialization', () => {
  it('joins pairings to sequential matchdays and preserves planned byes', () => {
    const plan = buildHeadToHeadSchedulePlan({
      participantIds: ['a', 'b', 'c'],
      cycles: 1,
      roundsPerDay: 2,
      firstStart: new Date('2026-09-01T10:00:00.000Z'),
      fixtureWindowMs: 60 * 60_000,
      roundBreakMs: 30 * 60_000,
    });

    expect(plan).toHaveLength(3);
    expect(plan.map((round) => round.matchdayNumber)).toEqual([1, 1, 2]);
    expect(plan.map((round) => round.byeParticipantId).sort()).toEqual(['a', 'b', 'c']);
    expect(plan[1]?.startsAt).toBe('2026-09-01T11:30:00.000Z');
    expect(plan[2]?.startsAt).toBe('2026-09-02T10:00:00.000Z');
  });
});
