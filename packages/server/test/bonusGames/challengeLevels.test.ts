import { describe, expect, it } from 'vitest';
import type { BonusChallengeEnvironmentRules } from '@hockey/game-core';
import { buildChallengeLevelEnvironment, supportsChallengeLevels } from '../../src/bonusGames/challengeLevels.js';

describe('cumulative challenge levels', () => {
  const fatigue = { slowdownStartMs: 1000, heavyStartMs: 2000, stopStartMs: 3000,
    stopDurationMs: 1000, recoveryDurationMs: 1000, slowMultiplier: 0.8, heavyMultiplier: 0.5 };
  for (const level of [1, 2, 3] as const) {
    it(`derives level ${level} without mutating catalog rules`, () => {
      const environment: BonusChallengeEnvironmentRules = {
        fatigue, stumbleWindows: [{ startMs: 1000, durationMs: 800 }],
        ski: { version: 1, seed: 'test', durationMs: 180000 },
        cyberpunk: { version: 1, seed: 'test', durationMs: 180000 },
        beach: { version: 1, meltDurationMs: 180000, finalSpeedMultiplier: 0.5,
          puddles: [{ id: 'puddle', x: 200, y: 200, radiusX: 30, radiusY: 10, startMs: 1000 }] },
      };
      const original = JSON.stringify(environment);
      const beach = buildChallengeLevelEnvironment('challenge-beach', level, environment);
      expect(beach.beach?.puddles.length).toBe(level >= 2 ? 1 : 0);
      const ski = buildChallengeLevelEnvironment('challenge-ski-resort', level, environment);
      expect(ski.ski?.slipsEnabled).toBe(level >= 2);
      expect(ski.ski?.fatigueEnabled).toBe(level === 3);
      const cyber = buildChallengeLevelEnvironment('challenge-cyberpunk-yard', level, environment);
      expect(cyber.cyberpunk?.outagesEnabled).toBe(level >= 2);
      expect(cyber.cyberpunk?.fatigueEnabled).toBe(level === 3);
      for (const result of [beach, ski, cyber]) {
        expect(Boolean(result.fatigue)).toBe(level === 3);
        expect(result.stumbleWindows?.length ?? 0).toBe(level === 3 ? 1 : 0);
      }
      expect(JSON.stringify(environment)).toBe(original);
    });
  }
  it('does not invent levels for other games', () => {
    expect(supportsChallengeLevels('challenge-desert')).toBe(false);
    expect(supportsChallengeLevels('challenge-beach')).toBe(true);
  });
});
