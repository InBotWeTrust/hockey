import { describe, expect, it } from 'vitest';
import {
  DEFAULT_INITIAL_TRAINING_CONFIG,
  buildInitialTrainingCatalog,
  exerciseSceneForProgress,
  evaluateInitialTrainingGoal,
  requiredInitialTrainingZone,
  isInitialTrainingCompleted,
  parseInitialTrainingConfig,
  resolveInitialTrainingGoalieId,
} from '../../src/duel/training/initialCourse.js';

describe('initial training course configuration', () => {
  it('maps the durable completion count to one authoritative boolean', async () => {
    const db = {
      query: async () => ({ rows: [{ completed: true }] }),
    };

    expect(await isInitialTrainingCompleted(db as never, 'user-id')).toBe(true);
  });

  it('uses the courtyard rookie goalie independently of open training settings', () => {
    expect(resolveInitialTrainingGoalieId('wall')).toBe('rookie');
  });

  it('falls back atomically when the hidden setting is invalid', () => {
    expect(parseInitialTrainingConfig({ targetGoals: [0] })).toEqual(
      DEFAULT_INITIAL_TRAINING_CONFIG,
    );
    expect(parseInitialTrainingConfig({
      ...DEFAULT_INITIAL_TRAINING_CONFIG,
      enabled: true,
      targetGoals: { ...DEFAULT_INITIAL_TRAINING_CONFIG.targetGoals, 'moving-goal': 10 },
    })).toEqual(DEFAULT_INITIAL_TRAINING_CONFIG);
  });

  it('uses the current exercise goal balance', () => {
    expect(DEFAULT_INITIAL_TRAINING_CONFIG.targetGoals).toEqual({
      'first-shot': 10,
      'three-positions': 9,
      'follow-the-goal': 10,
      'moving-goal': 9,
      'find-the-gap': 9,
      'pressure-window': 6,
      'game-pace': 6,
    });
  });

  it('requires right, left and center in three-goal stages', () => {
    expect([0, 2, 3, 5, 6, 8, 9].map((goals) =>
      requiredInitialTrainingZone('moving-goal', goals, 9),
    )).toEqual(['right', 'right', 'left', 'left', 'center', 'center', null]);
  });

  it('alternates right and left after each credited goal', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((goals) =>
      requiredInitialTrainingZone('game-pace', goals, 6),
    )).toEqual(['right', 'left', 'right', 'left', 'right', 'left', null]);
  });

  it('credits only a goal from the required third of the player path', () => {
    expect(evaluateInitialTrainingGoal('moving-goal', 0, 9, 'goal', 500)).toEqual({
      credited: true,
      wrongZone: false,
    });
    expect(evaluateInitialTrainingGoal('moving-goal', 0, 9, 'goal', 286)).toEqual({
      credited: false,
      wrongZone: true,
    });
    expect(evaluateInitialTrainingGoal('moving-goal', 0, 9, 'save', 500)).toEqual({
      credited: false,
      wrongZone: false,
    });
    expect(evaluateInitialTrainingGoal('moving-goal', 0, 9, 'miss', 286)).toEqual({
      credited: false,
      wrongZone: true,
    });
    expect(evaluateInitialTrainingGoal('game-pace', 1, 6, 'save', 500)).toEqual({
      credited: false,
      wrongZone: true,
    });
    expect(evaluateInitialTrainingGoal('first-shot', 0, 10, 'goal', 286)).toEqual({
      credited: true,
      wrongZone: false,
    });
  });

  it('keeps the existing seven-exercise setting active while adding default goal speeds', () => {
    const migrated = parseInitialTrainingConfig({
      enabled: true,
      targetGoals: {
        'first-shot': 10,
        'three-positions': 9,
        'follow-the-goal': 10,
        'moving-goal': 9,
        'find-the-gap': 9,
        'pressure-window': 6,
        'game-pace': 6,
      },
      positionOffsetX: 160,
      goalieFrequencyMultipliers: {
        'find-the-gap': 0.35,
        'pressure-window': 0.65,
        'game-pace': 1,
      },
      rewardStars: 1,
      rewardExperience: 1,
    });

    expect(migrated).toMatchObject({
      enabled: true,
      goalFrequencyMultipliers: {
        'moving-goal': 1,
        'find-the-gap': 1,
        'pressure-window': 1,
        'game-pace': 1,
      },
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
      ['pressure-window', 'locked'],
      ['game-pace', 'locked'],
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

  it('uses empty goals in the first four exercises and in the side-switching exercise', () => {
    for (const key of ['first-shot', 'three-positions', 'follow-the-goal', 'moving-goal', 'pressure-window'] as const) {
      expect(
        exerciseSceneForProgress(
          key,
          { shotIndex: 1, goals: 0 },
          DEFAULT_INITIAL_TRAINING_CONFIG,
        ).hasGoalie,
      ).toBe(false);
    }
  });

  it('uses game-speed goals and goalie in the positional exercises', () => {
    const moving = exerciseSceneForProgress(
      'moving-goal',
      { shotIndex: 1, goals: 0 },
      DEFAULT_INITIAL_TRAINING_CONFIG,
    );
    const slowWindow = exerciseSceneForProgress(
      'find-the-gap',
      { shotIndex: 1, goals: 0 },
      DEFAULT_INITIAL_TRAINING_CONFIG,
    );
    const pressureWindow = exerciseSceneForProgress(
      'pressure-window',
      { shotIndex: 1, goals: 0 },
      DEFAULT_INITIAL_TRAINING_CONFIG,
    );
    const gamePace = exerciseSceneForProgress(
      'game-pace',
      { shotIndex: 1, goals: 0 },
      DEFAULT_INITIAL_TRAINING_CONFIG,
    );

    expect(moving).toMatchObject({
      hasGoalie: false,
      movingGoal: true,
      goalFrequencyMultiplier: 1,
    });
    expect(slowWindow).toMatchObject({
      hasGoalie: true,
      movingGoal: true,
      goalFrequencyMultiplier: 1,
      goalieFrequencyMultiplier: 1,
    });
    expect(pressureWindow).toMatchObject({
      hasGoalie: false,
      movingGoal: true,
      goalFrequencyMultiplier: 1,
      goalieFrequencyMultiplier: 1,
    });
    expect(gamePace).toMatchObject({
      hasGoalie: true,
      movingGoal: true,
      goalFrequencyMultiplier: 1,
      goalieFrequencyMultiplier: 1,
    });
  });
});
