import { describe, expect, it } from 'vitest';
import {
  BONUS_SHOT_RESULT_PAUSE_MS,
  evaluateEnduranceDeadlines,
  nextEnduranceGoalWindow,
  pauseEnduranceGoalWindow,
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
  it('starts after the goal visual finishes so the player receives a full new window', () => {
    const window = nextEnduranceGoalWindow({
      shotStartedAt: new Date('2026-09-20T10:00:05.000Z'),
      flightMs: 750,
      goalWindowMs: 7_000,
    });

    expect(window.startsAt.getTime()).toBe(Date.parse('2026-09-20T10:00:05.750Z') + BONUS_SHOT_RESULT_PAUSE_MS);
    expect(window.endsAt.getTime()).toBe(Date.parse('2026-09-20T10:00:13.750Z'));
  });
});

describe('pauseEnduranceGoalWindow', () => {
  it('preserves the remaining goal time across a missed-shot result modal', () => {
    const window = pauseEnduranceGoalWindow({
      goalWindowEndsAt: new Date('2026-09-20T10:00:07.000Z'),
      shotStartedAt: new Date('2026-09-20T10:00:03.000Z'),
      flightMs: 750,
    });
    expect(window).toEqual({
      startsAt: new Date('2026-09-20T10:00:04.750Z'),
      endsAt: new Date('2026-09-20T10:00:08.000Z'),
    });
    expect(window!.endsAt.getTime() - window!.startsAt.getTime()).toBe(3_250);
  });
  it('does not revive a goal window that expired during puck flight', () => {
    expect(pauseEnduranceGoalWindow({
      goalWindowEndsAt: new Date('2026-09-20T10:00:07.000Z'),
      shotStartedAt: new Date('2026-09-20T10:00:06.500Z'),
      flightMs: 750,
    })).toBeNull();
  });
});
