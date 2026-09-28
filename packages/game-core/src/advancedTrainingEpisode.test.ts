import { describe, expect, it } from 'vitest';
import type { AdvancedTrainingV2Technique } from './advancedTrainingV2.js';
import { evaluateAdvancedTrainingEpisodeShot, getAdvancedTrainingEpisode,
  sampleAdvancedTrainingEpisode, validateAdvancedTrainingEpisode } from './advancedTrainingEpisode.js';

const techniques: AdvancedTrainingV2Technique[] = [
  'near_goalie', 'counter_direction', 'complex', 'precise',
  'behind_goalie', 'corner', 'edge', 'super_precise',
];

describe('repeatable advanced-training episodes', () => {
  it('moves every entity during the lead-in and never retimes an early tap', () => {
    const profile = getAdvancedTrainingEpisode('near_goalie', 'left');
    const start = sampleAdvancedTrainingEpisode(profile, 1000);
    const later = sampleAdvancedTrainingEpisode(profile, 1500);
    expect(start.playerX).not.toBe(later.playerX);
    expect(start.goalieX).not.toBe(later.goalieX);
    expect(start.goalOffsetX).not.toBe(later.goalOffsetX);
    expect(evaluateAdvancedTrainingEpisodeShot(profile, profile.intervalStartMs - 1000).success)
      .toBe(false);
    expect(evaluateAdvancedTrainingEpisodeShot(profile, profile.intervalStartMs).success)
      .toBe(true);
  });

  it.each(techniques)('provides a human-playable %s shot on both sides', (technique) => {
    for (const side of ['left', 'right'] as const) {
      const profile = getAdvancedTrainingEpisode(technique, side);
      expect(profile.intervalEndMs - profile.intervalStartMs).toBeGreaterThanOrEqual(500);
      expect(profile.intervalStartMs - profile.sceneStartMs)
        .toBeGreaterThanOrEqual(8 * profile.traversalMs);
      expect(() => validateAdvancedTrainingEpisode(profile), `${technique}/${side}`).not.toThrow();
      for (let t = profile.intervalStartMs; t <= profile.intervalEndMs; t += 1) {
        const shot = evaluateAdvancedTrainingEpisodeShot(profile, t);
        expect(shot.result.type, `${technique}/${side} at ${t}`).toBe('goal');
        expect(shot.actualTechnique, `${technique}/${side} at ${t}`).toBe(technique);
        expect(shot.actualSide, `${technique}/${side} at ${t}`).toBe(side);
        expect(shot.success, `${technique}/${side} at ${t}`).toBe(true);
      }
      const middle = profile.intervalStartMs + 250;
      expect(sampleAdvancedTrainingEpisode(profile, middle))
        .toEqual(sampleAdvancedTrainingEpisode(profile, middle));
      const justBefore = sampleAdvancedTrainingEpisode(profile, profile.intervalStartMs - 1);
      const atStart = sampleAdvancedTrainingEpisode(profile, profile.intervalStartMs);
      expect(Math.abs(atStart.playerX - justBefore.playerX)).toBeLessThan(1);
      expect(Math.abs(atStart.goalieX - justBefore.goalieX)).toBeLessThan(1);
      expect(Math.abs(atStart.goalOffsetX - justBefore.goalOffsetX)).toBeLessThan(1);
      expect(evaluateAdvancedTrainingEpisodeShot(profile, profile.intervalStartMs - 1).result)
        .toBeDefined();
    }
  });
});
