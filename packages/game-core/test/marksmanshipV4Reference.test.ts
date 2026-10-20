import { describe, expect, it } from 'vitest';
import { getGoalie } from '../src/balance/goalies.js';
import {
  DEFAULT_MARKSMANSHIP_V4_SCORING_RULES,
  classifyMarksmanshipShot,
  resolveMarksmanshipShotContext,
} from '../src/marksmanship.js';
import { deriveShotSeed } from '../src/session.js';
import { manualLabels, referenceOffsets, referenceSeed, referenceShots } from './fixtures/marksmanshipV4Reference.js';

const goalie = getGoalie('rookie');
const offsets = referenceOffsets;

function replay() {
  return referenceShots.map(([tapTime, shooterTapTime], index) => classifyMarksmanshipShot({
    shotInput: {
      tapTime, shooterTapTime, puckSpeedPerMs: 1.25,
      shooterFrequency: 0.75, goalieFrequency: 0.6, goalFrequency: 0.5,
    },
    goalie, seed: deriveShotSeed(referenceSeed, 1, index + 1), shotIndex: index + 1,
    phaseOffsets: offsets, earliestTapTime: 0,
    scoring: DEFAULT_MARKSMANSHIP_V4_SCORING_RULES,
  }));
}

describe('anonymized V4 reference replay', () => {
  it('preserves all 87 factual outcomes before interpreting techniques', () => {
    const classifications = replay();
    expect(classifications).toHaveLength(87);
    expect(classifications.map((classification) => classification.result.type)).toEqual(
      referenceShots.map((shot) => shot[2]),
    );
    expect(classifications.filter((classification) => classification.result.type === 'goal')).toHaveLength(70);
  });

  it('keeps five closed situations and recognizes the late chance in shot 48', () => {
    const classifications = replay();
    const closedNumbers = classifications.flatMap((classification, index) =>
      classification.result.type !== 'goal' && classification.opportunity === 'closed' ? [index + 1] : []);
    expect(closedNumbers).toEqual([29, 42, 61, 74, 81]);
    expect(classifications[47]?.opportunity).not.toBe('closed');
    expect(classifications[47]?.timingErrorMs).toBeGreaterThan(250);
    const tooShortNumbers = classifications.flatMap((classification, index) =>
      classification.opportunity === 'too_short' ? [index + 1] : []);
    expect(tooShortNumbers).toEqual([4, 9, 48, 76, 85]);
  });

  it('records geometric reasons when a manual label differs from strict V4 priority', () => {
    const classifications = replay();
    // №16: 12.11 units from goalie, just outside the approved <=12 boundary.
    expect(classifications[15]?.v4Measurements?.goalieGap).toBeGreaterThan(12);
    expect(classifications[15]?.v4Score?.technique).toBe('precise');
    // №30 is at the board, but a simultaneous precise shot wins the approved priority.
    expect(classifications[29]?.v4Score?.availableTechniques).toContain('board_side');
    expect(classifications[29]?.v4Score?.technique).toBe('precise');
    expect(classifications[16]?.result.type).toBe('miss');
    expect(classifications[16]?.awardedPoints).toBe(0);
  });

  it('describes the available goal technique for a miss, not the missed position', () => {
    const missed = replay()[16]!;
    const [tapTime, shooterTapTime] = referenceShots[16]!;
    expect(missed.result.type).toBe('miss');
    expect(missed.timingErrorMs).not.toBeNull();
    const atOpportunity = resolveMarksmanshipShotContext({
      shotInput: {
        tapTime: tapTime + missed.timingErrorMs!,
        shooterTapTime: shooterTapTime + missed.timingErrorMs!,
        puckSpeedPerMs: 1.25, shooterFrequency: 0.75,
        goalieFrequency: 0.6, goalFrequency: 0.5,
      },
      goalie, seed: deriveShotSeed(referenceSeed, 1, 17), shotIndex: 17,
      phaseOffsets: offsets, earliestTapTime: 0,
      scoring: DEFAULT_MARKSMANSHIP_V4_SCORING_RULES,
    });
    expect(atOpportunity.result.type).toBe('goal');
    expect(missed.v4Measurements).toEqual(atOpportunity.v4Measurements);
    expect(missed.awardedPoints).toBe(0);
  });

  it('does not claim an available technique for a fully closed situation', () => {
    const closed = replay()[28]!;
    expect(closed.opportunity).toBe('closed');
    expect(closed.v4Score).toBeNull();
    expect(closed.v4Measurements).toBeNull();
  });

  it('compares all 87 manual labels with V4 rather than assuming they are ground truth', () => {
    const techniques = {
      h: 'behind_goalie', d: 'counter_direction', p: 'precise', n: 'near_goalie',
      o: 'ordinary', b: 'board_side', s: 'super_precise', c: null,
    } as const;
    const classifications = replay();
    expect(manualLabels).toHaveLength(87);
    const differences = classifications.flatMap((classification, index) => {
      const manual = techniques[manualLabels[index] as keyof typeof techniques];
      const actual = classification.v4Score?.technique ?? null;
      return manual === actual ? [] : [index + 1];
    });
    expect(differences).toEqual([
      1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 16, 17, 18, 20, 24,
      25, 26, 27, 30, 36, 39, 40, 41, 43, 44, 45, 46, 48, 54, 55,
      56, 58, 59, 60, 62, 63, 64, 65, 66, 67, 73, 76, 77, 83, 86,
    ]);
  });
});
