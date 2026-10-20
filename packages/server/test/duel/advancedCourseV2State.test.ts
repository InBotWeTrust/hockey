import { describe, expect, it } from 'vitest';
import { GAME_CORE_VERSION, getAdvancedTrainingEpisode } from '@hockey/game-core';
import { advancedTrainingV2State, assertAdvancedTrainingV2RunVersion,
  assertAdvancedTrainingV2TapTime, assertAdvancedTrainingV2Duplicate,
  evaluateAdvancedTrainingV2RunShot,
  type AdvancedTrainingV2Run } from
  '../../src/duel/training/advancedCourseV2Routes.js';

const run: AdvancedTrainingV2Run = {
  id: '11111111-1111-4111-8111-111111111111', user_id: 'user',
  exercise_key: 'near_goalie', state: 'active', stage: 'practice', side: 'left',
  side_successes: { left: 0, right: 0 }, seed: 'random-per-user',
  attempt_ordinal: 0, episode_token: '22222222-2222-4222-8222-222222222222',
  shot_index: 0, game_core_version: GAME_CORE_VERSION,
  bank_version: 3,
  started_at: new Date('2026-09-28T00:00:00Z'),
};

describe('repeatable advanced training state', () => {
  it('identifies the current side, stage and attempt, and starts clean on reconnect', () => {
    const first = advancedTrainingV2State(run, 0);
    const next = advancedTrainingV2State({ ...run, side: 'right', attempt_ordinal: 9,
      shot_index: 4 }, 15_000);
    expect(first.episode).toEqual(getAdvancedTrainingEpisode('near_goalie', 'left'));
    expect(next.episode).toEqual(getAdvancedTrainingEpisode('near_goalie', 'right'));
    expect(next.movement_id).not.toBe(first.movement_id);
    expect(advancedTrainingV2State({ ...run,
      episode_token: '33333333-3333-4333-8333-333333333333' }).movement_id)
      .not.toBe(first.movement_id);
    expect(next.attempt_ordinal).toBe(9);
    expect(next.resume_scene_ms).toBe(0);
  });

  it('evaluates local time independently on every recorded attempt', () => {
    const episode = getAdvancedTrainingEpisode('near_goalie', 'left');
    const input = { tapTime: episode.intervalStartMs + 250 };
    const first = evaluateAdvancedTrainingV2RunShot(run, input);
    const later = evaluateAdvancedTrainingV2RunShot({ ...run, attempt_ordinal: 7,
      shot_index: 7 }, input);
    expect(first.success).toBe(true);
    expect(later).toEqual(first);
  });

  it('rejects tap times outside the episode but permits repeated local times', () => {
    const episode = getAdvancedTrainingEpisode('near_goalie', 'left');
    expect(() => assertAdvancedTrainingV2TapTime(episode.intervalStartMs, episode)).not.toThrow();
    expect(() => assertAdvancedTrainingV2TapTime(episode.episodeEndMs + 1, episode)).toThrow();
    expect(() => assertAdvancedTrainingV2TapTime(-1, episode)).toThrow();
    expect(() => assertAdvancedTrainingV2TapTime(episode.intervalStartMs, episode, 1000)).toThrow();
    expect(() => assertAdvancedTrainingV2TapTime(episode.intervalStartMs, episode, 13_000)).toThrow();
    expect(() => assertAdvancedTrainingV2TapTime(episode.intervalStartMs, episode,
      episode.intervalStartMs + 250)).not.toThrow();
    expect(() => assertAdvancedTrainingV2TapTime(episode.intervalStartMs, episode,
      episode.intervalStartMs + 6000)).toThrow();
  });

  it('only replays an exact duplicate from the same attempt token', () => {
    const movement_id = advancedTrainingV2State(run).movement_id;
    const stored = { scenario_id: movement_id, input: { tapTime: 17_750 } };
    expect(() => assertAdvancedTrainingV2Duplicate(stored,
      { movement_id, input: { tapTime: 17_750 } })).not.toThrow();
    expect(() => assertAdvancedTrainingV2Duplicate(stored,
      { movement_id: `${movement_id}:old`, input: { tapTime: 17_750 } })).toThrow();
    expect(() => assertAdvancedTrainingV2Duplicate(stored,
      { movement_id, input: { tapTime: 17_751 } })).toThrow();
  });

  it('rejects an active run from the previous scenario bank', () => {
    expect(() => assertAdvancedTrainingV2RunVersion({ ...run, bank_version: 1 })).toThrow();
    expect(() => assertAdvancedTrainingV2RunVersion(run)).not.toThrow();
  });
});
