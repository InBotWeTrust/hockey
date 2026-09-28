import { describe, expect, it } from 'vitest';
import { getAdvancedTrainingV2Scenario } from '@hockey/game-core';
import { PRACTICE_SHOT_ARM_LEAD_MS, getAdvancedTrainingContinuousCue, getAdvancedTrainingV2Cue } from
  './advancedTrainingV2Timing.js';

const scenario = getAdvancedTrainingV2Scenario('precise', 'left', 'practice', 0);
const traverse = 500 / scenario.speeds.shooterFrequency;

describe('advanced training V2 cues', () => {
  it('counts four real edge-to-edge traversals before the target tap', () => {
    for (const [index, label] of [4, 3, 2, 1].entries()) {
      expect(getAdvancedTrainingV2Cue(scenario, scenario.sceneStartMs + index * traverse + 10,
        'practice').traversal).toBe(label);
    }
    expect(getAdvancedTrainingV2Cue(scenario, scenario.targetTapTimeMs, 'practice'))
      .toMatchObject({ traversal: null, shootNow: true, expired: false });
    expect(getAdvancedTrainingV2Cue(scenario, scenario.targetTapTimeMs + traverse + 1,
      'practice').expired).toBe(true);
  });

  it('never reveals countdown or target cue during assessment', () => {
    expect(getAdvancedTrainingV2Cue(scenario, scenario.sceneStartMs + 10, 'assessment'))
      .toMatchObject({ traversal: null, shootNow: false });
    expect(getAdvancedTrainingV2Cue(scenario, scenario.targetTapTimeMs, 'assessment'))
      .toMatchObject({ traversal: null, shootNow: false });
  });
});

describe('continuous opportunity cues', () => {
  const window = { startMs: 10_000, endMs: 10_120, targetMs: 10_030 };
  it('counts real seconds until the practice shot cue, accounting for slow motion', () => {
    for (const [label, sceneMs] of [[4, 7_000], [3, 8_000], [2, 9_000], [1, 9_600]] as const) {
      expect(getAdvancedTrainingContinuousCue(window, sceneMs,
        scenario.speeds.shooterFrequency, 'practice').secondsRemaining).toBe(label);
    }
    expect(getAdvancedTrainingContinuousCue(window, 5_000,
      scenario.speeds.shooterFrequency, 'practice').secondsRemaining).toBeNull();
    expect(getAdvancedTrainingContinuousCue(window, window.startMs - PRACTICE_SHOT_ARM_LEAD_MS,
      scenario.speeds.shooterFrequency, 'practice')).toMatchObject({
      secondsRemaining: null, shootNow: true,
    });
    expect(getAdvancedTrainingContinuousCue(window, window.startMs - PRACTICE_SHOT_ARM_LEAD_MS - 1,
      scenario.speeds.shooterFrequency, 'practice').shootNow).toBe(false);
    expect(getAdvancedTrainingContinuousCue(window, window.startMs,
      scenario.speeds.shooterFrequency, 'practice').shootNow).toBe(true);
    expect(getAdvancedTrainingContinuousCue(window, window.endMs,
      scenario.speeds.shooterFrequency, 'practice').shootNow).toBe(true);
    expect(getAdvancedTrainingContinuousCue(window, window.endMs + 1,
      scenario.speeds.shooterFrequency, 'practice').expired).toBe(true);
  });

  it('counts ordinary real seconds without showing shoot-now in assessment', () => {
    for (const [label, remaining] of [[4, 3_500], [3, 2_500], [2, 1_500], [1, 500]] as const) {
      expect(getAdvancedTrainingContinuousCue(window, window.startMs - remaining,
        scenario.speeds.shooterFrequency, 'assessment').secondsRemaining).toBe(label);
    }
    expect(getAdvancedTrainingContinuousCue(window, window.startMs,
      scenario.speeds.shooterFrequency, 'assessment')).toMatchObject({
      secondsRemaining: null, shootNow: false,
    });
  });
});
