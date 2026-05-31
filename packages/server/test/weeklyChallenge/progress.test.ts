import { describe, expect, it } from 'vitest';
import {
  EMPTY_WEEKLY_CHALLENGE_PROGRESS,
  isTaskCompleted,
} from '../../src/weeklyChallenge/progress.js';

describe('weekly challenge progress helpers', () => {
  it('marks a task complete only when progress reaches the target', () => {
    expect(
      isTaskCompleted(
        { type: 'goals_scored', target: 500 },
        { ...EMPTY_WEEKLY_CHALLENGE_PROGRESS, goals_scored: 499 },
      ),
    ).toBe(false);
    expect(
      isTaskCompleted(
        { type: 'goals_scored', target: 500 },
        { ...EMPTY_WEEKLY_CHALLENGE_PROGRESS, goals_scored: 500 },
      ),
    ).toBe(true);
  });
});
