import { describe, expect, it } from 'vitest';
import { getAdvancedTrainingV2Scenario } from '@hockey/game-core';
import { getAdvancedTrainingV2Cue } from './advancedTrainingV2Timing.js';

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
