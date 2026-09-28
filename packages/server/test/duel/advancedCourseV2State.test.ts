import { describe, expect, it } from 'vitest';
import { GAME_CORE_VERSION, findNextAdvancedTrainingWindow,
  getAdvancedTrainingContinuousSeed } from '@hockey/game-core';
import { advancedTrainingV2State, assertAdvancedTrainingV2RunVersion,
  assertAdvancedTrainingV2TapTime,
  evaluateAdvancedTrainingV2RunShot,
  type AdvancedTrainingV2Run } from
  '../../src/duel/training/advancedCourseV2Routes.js';

const run: AdvancedTrainingV2Run = {
  id: '11111111-1111-4111-8111-111111111111', user_id: 'user',
  exercise_key: 'near_goalie', state: 'active', stage: 'practice', side: 'left',
  side_successes: { left: 0, right: 0 }, seed: 'random-per-user',
  attempt_ordinal: 0, shot_index: 0, game_core_version: GAME_CORE_VERSION,
  bank_version: 2,
  started_at: new Date('2026-09-28T00:00:00Z'),
};

describe('continuous advanced training state', () => {
  it('returns one stable movement context regardless of attempt and side', () => {
    const first = advancedTrainingV2State(run, 0);
    const next = advancedTrainingV2State({ ...run, side: 'right', attempt_ordinal: 9,
      shot_index: 4 }, 15_000);
    expect(first.movement.runSeed).toBe(getAdvancedTrainingContinuousSeed('near_goalie'));
    expect(next.movement).toEqual({ ...first.movement, side: 'right' });
    expect(next.movement_id).toBe(first.movement_id);
    expect(next.resume_scene_ms).toBe(15_000);
  });

  it('evaluates a later recorded shot on the same movement', () => {
    const movement = advancedTrainingV2State(run).movement;
    const window = findNextAdvancedTrainingWindow(movement, 0)!;
    const input = { tapTime: window.targetMs };
    const first = evaluateAdvancedTrainingV2RunShot(run, input);
    const later = evaluateAdvancedTrainingV2RunShot({ ...run, attempt_ordinal: 7,
      shot_index: 7 }, input);
    expect(first.success).toBe(true);
    expect(later).toEqual(first);
  });

  it('rejects time moving backwards across recorded shots', () => {
    expect(() => assertAdvancedTrainingV2TapTime(9_999, 10_000)).toThrow();
    expect(() => assertAdvancedTrainingV2TapTime(10_000, 10_000)).toThrow();
    expect(() => assertAdvancedTrainingV2TapTime(10_001, 10_000)).not.toThrow();
    expect(() => assertAdvancedTrainingV2TapTime(30_000, null, 20_000)).toThrow();
  });

  it('rejects an active run from the previous scenario bank', () => {
    expect(() => assertAdvancedTrainingV2RunVersion({ ...run, bank_version: 1 })).toThrow();
    expect(() => assertAdvancedTrainingV2RunVersion(run)).not.toThrow();
  });
});
