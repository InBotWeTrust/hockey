import { describe, expect, it } from 'vitest';
import * as core from '../src/index.js';

const techniques = [
  'near_goalie', 'counter_direction', 'complex', 'precise',
  'behind_goalie', 'corner', 'edge', 'super_precise',
] as const;
const sides = ['left', 'right'] as const;

describe('advanced training V2 scenario contract', () => {
  it('exposes a deterministic scenario selector for every non-ordinary V6 technique', () => {
    const selector = (core as Record<string, unknown>).getAdvancedTrainingV2Scenario;
    expect(selector).toBeTypeOf('function');
  });

  it('commits separate validated examples, practice, and two assessment scenes per side', () => {
    const bank = (core as Record<string, unknown>).ADVANCED_TRAINING_V2_SCENARIOS as
      | Array<{ id: string; technique: string; side: string; stage: string; sessionSeed: string;
        shotSeed: string; shotIndex: number; goalieId: string; targetTapTimeMs: number;
        sceneStartMs: number; speeds: { shooterFrequency: number; goalieFrequency: number;
          goalFrequency: number; puckSpeedPerMs: number } }>
      | undefined;
    expect(bank).toBeDefined();
    const ids = new Set(bank?.map((scenario) => scenario.id));
    expect(ids.size).toBe(bank?.length);
    for (const technique of techniques) for (const side of sides) {
      const scenes = bank!.filter((scenario) => scenario.technique === technique && scenario.side === side);
      expect(scenes.filter((scene) => scene.stage === 'demonstration')).toHaveLength(1);
      expect(scenes.filter((scene) => scene.stage === 'practice')).toHaveLength(1);
      expect(scenes.filter((scene) => scene.stage === 'assessment')).toHaveLength(2);
      for (const scene of scenes) {
        const halfTraverseMs = 500 / scene.speeds.shooterFrequency;
        expect(scene.targetTapTimeMs - scene.sceneStartMs).toBeGreaterThanOrEqual(4 * halfTraverseMs - 0.01);
        const phase = (scene.sceneStartMs + core.getSessionPhaseOffsets(scene.sessionSeed).shooter) /
          halfTraverseMs;
        expect(Math.abs(phase - Math.round(phase))).toBeLessThan(0.001);
        const context = core.resolveMarksmanshipShotContext({
          shotInput: { tapTime: scene.targetTapTimeMs, shooterTapTime: scene.targetTapTimeMs,
            ...scene.speeds },
          goalie: core.getGoalie(scene.goalieId), seed: scene.shotSeed,
          shotIndex: scene.shotIndex,
          phaseOffsets: core.getSessionPhaseOffsets(scene.sessionSeed), earliestTapTime: 0,
          scoring: core.DEFAULT_MARKSMANSHIP_V6_SCORING_RULES,
        });
        expect(context.result.type, scene.id).toBe('goal');
        expect(core.classifyMarksmanshipV6Score(context.v6Measurements!).technique, scene.id)
          .toBe(technique);
        const evaluate = (core as Record<string, unknown>).evaluateAdvancedTrainingV2Shot as
          (scenario: typeof scene, input: { tapTime: number; shooterTapTime: number }) =>
            { success: boolean; actualSide: string | null };
        const result = evaluate(scene, {
          tapTime: scene.targetTapTimeMs, shooterTapTime: scene.targetTapTimeMs,
        });
        expect(result.success, scene.id).toBe(true);
        expect(result.actualSide, scene.id).toBe(side);
      }
    }
  });

  it('selects scenes deterministically and rejects a secondary-only technique', () => {
    const select = (core as Record<string, unknown>).getAdvancedTrainingV2Scenario as
      (technique: string, side: string, stage: string, ordinal: number) =>
        { technique: string; targetTapTimeMs: number };
    const evaluate = (core as Record<string, unknown>).evaluateAdvancedTrainingV2Shot as
      (scenario: { technique: string; targetTapTimeMs: number }, input: { tapTime: number }) =>
        { success: boolean; actualTechnique: string | null };
    const first = select('complex', 'left', 'assessment', 0);
    expect(select('complex', 'left', 'assessment', 0)).toEqual(first);
    expect(select('complex', 'left', 'assessment', 1)).not.toEqual(first);
    const secondary = { ...first, technique: 'ordinary' };
    const result = evaluate(secondary, { tapTime: first.targetTapTimeMs });
    expect(result.actualTechnique).toBe('complex');
    expect(result.success).toBe(false);
  });
});
