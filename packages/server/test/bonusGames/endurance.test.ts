import { describe, expect, it } from 'vitest';
import {
  BONUS_SHOT_RESULT_PAUSE_MS,
  evaluateEnduranceDeadlines,
  nextEnduranceGoalWindow,
} from '../../src/bonusGames/endurance.js';

describe('evaluateEnduranceDeadlines', () => {
  it.each([
    ['active', '2026-09-20T10:00:02.000Z'],
    ['completed', '2026-09-20T10:03:00.000Z'],
  ] as const)('returns %s at %s when both deadlines are equal', (expected, now) => {
    expect(
      evaluateEnduranceDeadlines({
        periodEndsAt: new Date('2026-09-20T10:03:00.000Z'),
        goalWindowEndsAt: new Date('2026-09-20T10:03:00.000Z'),
        now: new Date(now),
      }),
    ).toBe(expected);
  });

  it('fails when the goal window reaches its deadline before the total timer', () => {
    expect(
      evaluateEnduranceDeadlines({
        periodEndsAt: new Date('2026-09-20T10:03:00.000Z'),
        goalWindowEndsAt: new Date('2026-09-20T10:00:07.000Z'),
        now: new Date('2026-09-20T10:00:07.000Z'),
      }),
    ).toBe('failed');
  });

  it('completes when the total timer reaches its deadline before the goal window', () => {
    expect(
      evaluateEnduranceDeadlines({
        periodEndsAt: new Date('2026-09-20T10:03:00.000Z'),
        goalWindowEndsAt: new Date('2026-09-20T10:03:04.000Z'),
        now: new Date('2026-09-20T10:03:00.000Z'),
      }),
    ).toBe('completed');
  });
});

describe('nextEnduranceGoalWindow', () => {
  it('starts at the acknowledged result time', () => {
    const window = nextEnduranceGoalWindow({
      resultAcknowledgedAt: new Date('2026-09-20T10:00:05.000Z'),
      goalWindowMs: 7_000,
    });

    expect(window).toEqual({
      startsAt: new Date('2026-09-20T10:00:05.000Z'),
      endsAt: new Date('2026-09-20T10:00:12.000Z'),
    });
  });
});
