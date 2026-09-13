import { describe, expect, it } from 'vitest';
import { resolveStageDisplayProgress } from '../../src/achievements/service.js';

describe('resolveStageDisplayProgress', () => {
  it.each([
    'underdog',
    'ice-hand',
    'training-monster',
    'third-period-decides',
    'classic-speed',
    'blowout',
    'no-error-express',
    'no-error-mix',
    'no-error-classic',
  ])('shows %s as one compound completion rather than its qualifier', (achievementId) => {
    expect(
      resolveStageDisplayProgress({
        achievementId,
        target: { minimumExperienceDifference: 100 },
        progress: { minimumExperienceDifference: 0 },
        completed: false,
      }),
    ).toEqual({ progressValue: 0, targetValue: 1 });

    expect(
      resolveStageDisplayProgress({
        achievementId,
        target: { minimumExperienceDifference: 100 },
        progress: { minimumExperienceDifference: 150 },
        completed: true,
      }),
    ).toEqual({ progressValue: 1, targetValue: 1 });
  });

  it('keeps a cumulative stage on its numeric scale', () => {
    expect(
      resolveStageDisplayProgress({
        achievementId: 'career-goals',
        target: { total: 5_000 },
        progress: { total: 3_200 },
        completed: false,
      }),
    ).toEqual({ progressValue: 3_200, targetValue: 5_000 });
  });
});
