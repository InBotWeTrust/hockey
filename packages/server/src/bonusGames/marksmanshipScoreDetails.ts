import type {
  MarksmanshipDifficultyCode,
  MarksmanshipGeometry,
  MarksmanshipSeriesClassification,
  MarksmanshipShotClassification,
  MarksmanshipV3Reason,
} from '@hockey/game-core';

export type MarksmanshipScoreDetails =
  | {
      version: 1;
      windowDurationMs: number | null;
      difficultyCode: MarksmanshipDifficultyCode | null;
      counterDirection: boolean;
    }
  | {
      version: 2;
      windowDurationMs: number | null;
      difficultyCode: MarksmanshipDifficultyCode | null;
      counterDirection: boolean;
      opportunity: 'scored' | 'human_error' | 'closed';
      timingErrorMs: number | null;
      geometry: MarksmanshipGeometry;
      series: MarksmanshipSeriesClassification;
      situationBonus: number;
      seriesBonus: number;
    }
  | {
      version: 3;
      windowDurationMs: number | null;
      difficultyCode: MarksmanshipDifficultyCode | null;
      counterDirection: boolean;
      opportunity: 'scored' | 'human_error' | 'closed';
      timingErrorMs: number | null;
      geometry: MarksmanshipGeometry;
      category: 1 | 2 | 3 | 4 | null;
      reason: MarksmanshipV3Reason | null;
    };

export function toMarksmanshipScoreDetails(
  classification: MarksmanshipShotClassification,
  version: 2 | 3,
): Extract<MarksmanshipScoreDetails, { version: 2 | 3 }> {
  const common = {
    windowDurationMs: classification.windowDurationMs,
    difficultyCode: classification.difficultyCode,
    counterDirection: classification.counterDirection,
    opportunity: classification.opportunity,
    timingErrorMs: classification.timingErrorMs,
    geometry: classification.geometry,
  };
  if (version === 3) {
    if (classification.result.type === 'goal' &&
      (classification.category == null || classification.reason == null)) {
      throw new Error('missing V3 category for marksmanship goal');
    }
    return {
      version: 3,
      ...common,
      category: classification.category ?? null,
      reason: classification.reason ?? null,
    };
  }
  return {
    version: 2,
    ...common,
    series: classification.series,
    situationBonus: classification.situationBonus,
    seriesBonus: classification.seriesBonus,
  };
}
