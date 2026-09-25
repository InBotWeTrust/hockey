import type {
  MarksmanshipDifficultyCode,
  MarksmanshipGeometry,
  MarksmanshipSeriesClassification,
  MarksmanshipShotClassification,
  MarksmanshipScoringRules,
  MarksmanshipV3Reason,
  MarksmanshipV4Measurements,
  MarksmanshipV4Technique,
  MarksmanshipV5Measurements,
  MarksmanshipV5Technique,
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
    }
  | {
      version: 4;
      windowDurationMs: number | null;
      difficultyCode: null;
      counterDirection: boolean;
      opportunity: 'scored' | 'human_error' | 'too_short' | 'closed';
      timingErrorMs: number | null;
      geometry: MarksmanshipGeometry;
      measurements: MarksmanshipV4Measurements | null;
      technique: MarksmanshipV4Technique | null;
      availableTechniques: readonly MarksmanshipV4Technique[];
      pointsTenths: number;
      result: 'goal' | 'save' | 'miss';
    }
  | {
      version: 5;
      windowDurationMs: number | null;
      difficultyCode: null;
      counterDirection: boolean;
      opportunity: 'scored' | 'human_error' | 'too_short' | 'closed';
      timingErrorMs: number | null;
      geometry: MarksmanshipGeometry;
      measurements: MarksmanshipV5Measurements | null;
      technique: MarksmanshipV5Technique | null;
      availableTechniques: readonly MarksmanshipV5Technique[];
      pointsTenths: number;
      result: 'goal' | 'save' | 'miss';
    };

export function toMarksmanshipScoreDetails(
  classification: MarksmanshipShotClassification,
  scoring: MarksmanshipScoringRules,
): Extract<MarksmanshipScoreDetails, { version: 2 | 3 | 4 | 5 }> {
  const common = {
    windowDurationMs: classification.windowDurationMs,
    difficultyCode: classification.difficultyCode,
    counterDirection: classification.counterDirection,
    opportunity: classification.opportunity === 'too_short' ? 'closed' : classification.opportunity,
    timingErrorMs: classification.timingErrorMs,
    geometry: classification.geometry,
  };
  if (scoring.version === 5) {
    if (classification.v5Score === undefined || classification.v5Measurements === undefined ||
      (classification.result.type === 'goal' && classification.v5Score === null)) {
      throw new Error('missing V5 classification for marksmanship shot');
    }
    return {
      version: 5,
      ...common,
      opportunity: classification.opportunity,
      difficultyCode: null,
      measurements: classification.v5Measurements,
      technique: classification.v5Score?.technique ?? null,
      availableTechniques: classification.v5Score?.availableTechniques ?? [],
      pointsTenths: classification.awardedPoints,
      result: classification.result.type,
    };
  }
  if (scoring.version === 4) {
    if (classification.v4Score === undefined || classification.v4Measurements === undefined ||
      (classification.result.type === 'goal' && classification.v4Score === null)) {
      throw new Error('missing V4 classification for marksmanship shot');
    }
    return {
      version: 4,
      ...common,
      opportunity: classification.opportunity,
      difficultyCode: null,
      measurements: classification.v4Measurements,
      technique: classification.v4Score?.technique ?? null,
      availableTechniques: classification.v4Score?.availableTechniques ?? [],
      pointsTenths: classification.awardedPoints,
      result: classification.result.type,
    };
  }
  if (scoring.version === 3) {
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
