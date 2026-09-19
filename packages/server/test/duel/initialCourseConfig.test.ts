import { describe, expect, it } from 'vitest';
import {
  DEFAULT_INITIAL_TRAINING_CONFIG,
  buildInitialTrainingCatalog,
  exerciseSceneForProgress,
  parseInitialTrainingConfig,
  resolveInitialTrainingGoalieId,
} from '../../src/duel/training/initialCourse.js';

describe('initial training course configuration', () => {
  it('uses the courtyard rookie goalie independently of open training settings', () => {
    expect(resolveInitialTrainingGoalieId('wall')).toBe('rookie');
  });

  it('falls back atomically when the hidden setting is invalid', () => {
    expect(parseInitialTrainingConfig({ targetGoals: [0] })).toEqual(
      DEFAULT_INITIAL_TRAINING_CONFIG,
    );
  });

  it('uses the current exercise goal balance', () => {
    expect(DEFAULT_INITIAL_TRAINING_CONFIG.targetGoals).toEqual({
      'first-shot': 10,
      'three-positions': 9,
      'follow-the-goal': 10,
      'moving-goal': 10,
      'find-the-gap': 10,
    });
  });

  it('unlocks exercises sequentially while keeping completed exercises replayable', () => {
    const catalog = buildInitialTrainingCatalog(
      new Set(['first-shot', 'three-positions']),
      DEFAULT_INITIAL_TRAINING_CONFIG,
    );

    expect(catalog.map((exercise) => [exercise.key, exercise.state])).toEqual([
      ['first-shot', 'completed'],
      ['three-positions', 'completed'],
      ['follow-the-goal', 'available'],
      ['moving-goal', 'locked'],
      ['find-the-gap', 'locked'],
    ]);
  });

  it('moves the three-position exercise after each three goals', () => {
    const offsets = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(
      (goals) =>
        exerciseSceneForProgress(
          'three-positions',
          { shotIndex: goals + 1, goals },
          DEFAULT_INITIAL_TRAINING_CONFIG,
        ).goalOffsetX,
    );

    expect(offsets).toEqual([-160, -160, -160, 0, 0, 0, 160, 160, 160]);
  });

  it('cycles the follow-the-goal exercise after every shot', () => {
    const offsets = [1, 2, 3, 4].map(
      (shotIndex) =>
        exerciseSceneForProgress(
          'follow-the-goal',
          { shotIndex, goals: 0 },
          DEFAULT_INITIAL_TRAINING_CONFIG,
        ).goalOffsetX,
    );

    expect(offsets).toEqual([-160, 0, 160, -160]);
  });

  it('uses empty goals through the first four exercises', () => {
    for (const key of ['first-shot', 'three-positions', 'follow-the-goal', 'moving-goal'] as const) {
      expect(
        exerciseSceneForProgress(
          key,
          { shotIndex: 1, goals: 0 },
          DEFAULT_INITIAL_TRAINING_CONFIG,
        ).hasGoalie,
      ).toBe(false);
    }
  });

  it('adds honest motion and a slowed goalie only in the final exercises', () => {
    const moving = exerciseSceneForProgress(
      'moving-goal',
      { shotIndex: 1, goals: 0 },
      DEFAULT_INITIAL_TRAINING_CONFIG,
    );
    const final = exerciseSceneForProgress(
      'find-the-gap',
      { shotIndex: 1, goals: 0 },
      DEFAULT_INITIAL_TRAINING_CONFIG,
    );

    expect(moving).toMatchObject({ hasGoalie: false, movingGoal: true });
    expect(final).toMatchObject({
      hasGoalie: true,
      movingGoal: true,
      goalieFrequencyMultiplier: 0.5,
    });
  });
});
