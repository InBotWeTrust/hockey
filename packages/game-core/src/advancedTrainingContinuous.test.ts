import { describe, expect, it } from 'vitest';
import type { AdvancedTrainingV2Technique } from './advancedTrainingV2.js';
import { evaluateAdvancedTrainingContinuousShot, findNextAdvancedTrainingWindow,
  getAdvancedTrainingContinuousSeed,
  type AdvancedTrainingContinuousContext } from './advancedTrainingContinuous.js';

const speeds = { shooterFrequency: 0.75, goalieFrequency: 0.6,
  goalFrequency: 0.5, puckSpeedPerMs: 1.25 };

function context(technique: AdvancedTrainingV2Technique,
  side: 'left' | 'right'): AdvancedTrainingContinuousContext {
  return { runSeed: getAdvancedTrainingContinuousSeed(technique),
    technique, side, speeds, goalieId: 'rookie' };
}

describe('continuous advanced training', () => {
  it('uses one stable seed for every player, attempt, stage and side of an exercise', () => {
    expect(getAdvancedTrainingContinuousSeed('near_goalie'))
      .toBe(getAdvancedTrainingContinuousSeed('near_goalie'));
    expect(getAdvancedTrainingContinuousSeed('super_precise'))
      .not.toBe(getAdvancedTrainingContinuousSeed('near_goalie'));
  });
  it.each([
    'near_goalie', 'counter_direction', 'complex', 'precise',
    'behind_goalie', 'corner', 'edge', 'super_precise',
  ] as const)('finds server-verifiable %s windows on both sides', (technique) => {
    for (const side of ['left', 'right'] as const) {
      const movement = context(technique, side);
      const first = findNextAdvancedTrainingWindow(movement, 0);
      expect(first, `${technique}/${side}`).not.toBeNull();
      expect(first!.startMs).toBeGreaterThanOrEqual(4 * 500 / speeds.shooterFrequency);
      expect(first!.endMs).toBeGreaterThanOrEqual(first!.startMs);
      expect(first!.targetMs).toBeGreaterThanOrEqual(first!.startMs);
      expect(first!.targetMs).toBeLessThanOrEqual(first!.endMs);
      const result = evaluateAdvancedTrainingContinuousShot(movement,
        { tapTime: first!.targetMs, shooterTapTime: first!.targetMs });
      expect(result.success, `${technique}/${side} at ${first!.targetMs}`).toBe(true);
      expect(result.actualTechnique).toBe(technique);
      expect(result.actualSide).toBe(side);
      const next = findNextAdvancedTrainingWindow(movement, first!.endMs);
      expect(next, `second ${technique}/${side}`).not.toBeNull();
      expect(next!.startMs).toBeGreaterThanOrEqual(first!.endMs + 4 * 500 / speeds.shooterFrequency);
    }
  });

  it('keeps the shot result fixed when a recorded shot index changes', () => {
    const movement = context('near_goalie', 'left');
    const first = findNextAdvancedTrainingWindow(movement, 0)!;
    const input = { tapTime: first.targetMs, shooterTapTime: first.targetMs };
    const firstRecordedShot = { ...movement, shotIndex: 1 };
    const ninthRecordedShot = { ...movement, shotIndex: 9 };
    expect(evaluateAdvancedTrainingContinuousShot(firstRecordedShot, input))
      .toEqual(evaluateAdvancedTrainingContinuousShot(ninthRecordedShot, input));
  });

  it('returns no opportunity for an invalid starting clock', () => {
    expect(findNextAdvancedTrainingWindow(context('near_goalie', 'left'), Infinity)).toBeNull();
  });
});
