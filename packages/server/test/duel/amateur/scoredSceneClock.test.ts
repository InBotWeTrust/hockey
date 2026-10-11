import { describe, expect, it } from 'vitest';
import { restoreScoredSceneClocks } from '../../../src/duel/amateur/scoredFormats.js';

describe('scored duel visual clock restoration', () => {
  const shot = { tapTime: 4000, periodTapTime: 5000, shooterTapTime: 3500, resultPauseMs: 1000 };

  it('holds the scene through the result and resumes without advancing through the pause', () => {
    expect(restoreScoredSceneClocks(6000, shot, 200).scene_elapsed_ms).toBe(4200);
    expect(restoreScoredSceneClocks(6200, shot, 200).scene_elapsed_ms).toBe(4200);
    expect(restoreScoredSceneClocks(6400, shot, 200)).toEqual({
      scene_elapsed_ms: 4400,
      shooter_elapsed_ms: 3700,
    });
  });

  it('respects reduced motion instead of inventing a one second pause', () => {
    expect(restoreScoredSceneClocks(6200, { ...shot, resultPauseMs: 1 }, 200).scene_elapsed_ms).toBe(5199);
  });

  it('preserves continuous clocks for legacy shots and periods without shots', () => {
    expect(restoreScoredSceneClocks(6000, undefined, 0)).toEqual({
      scene_elapsed_ms: 6000,
      shooter_elapsed_ms: 6000,
    });
    expect(restoreScoredSceneClocks(6000, { tapTime: 5000 }, 200).scene_elapsed_ms).toBe(6000);
  });
});
