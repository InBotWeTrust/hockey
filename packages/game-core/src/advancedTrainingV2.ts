import { getGoalie } from './balance/goalies.js';
import { getSessionPhaseOffsets } from './session.js';
import { DEFAULT_MARKSMANSHIP_V6_SCORING_RULES, resolveMarksmanshipShotContext } from './marksmanship.js';
import { classifyMarksmanshipV6Score, type MarksmanshipV6Measurements,
  type MarksmanshipV6Technique } from './marksmanshipV6.js';
import type { ShotInput, ShotResult } from './shot/types.js';
import { ADVANCED_TRAINING_V2_SCENARIOS } from './advancedTrainingV2Scenarios.js';
import { GAME_CORE_VERSION } from './version.js';

export type AdvancedTrainingV2Technique = Exclude<MarksmanshipV6Technique, 'ordinary'>;
export type AdvancedTrainingV2Side = 'left' | 'right';
export type AdvancedTrainingV2Stage = 'demonstration' | 'practice' | 'assessment';

export interface AdvancedTrainingV2Scenario {
  id: string;
  technique: AdvancedTrainingV2Technique;
  side: AdvancedTrainingV2Side;
  stage: AdvancedTrainingV2Stage;
  sessionSeed: string;
  shotSeed: string;
  shotIndex: number;
  goalieId: string;
  speeds: {
    shooterFrequency: number;
    goalieFrequency: number;
    goalFrequency: number;
    puckSpeedPerMs: number;
  };
  sceneStartMs: number;
  targetTapTimeMs: number;
  gameCoreVersion: number;
  bankVersion: number;
}

export function getAdvancedTrainingV2Side(technique: MarksmanshipV6Technique, m: MarksmanshipV6Measurements):
  AdvancedTrainingV2Side | null {
  if (technique === 'near_goalie') {
    if (m.goalieMax < m.goalMin) return 'left';
    if (m.goalieMin > m.goalMax) return 'right';
    return null;
  }
  if (technique === 'counter_direction' || technique === 'behind_goalie') {
    return m.shooterDirection < 0 ? 'left' : m.shooterDirection > 0 ? 'right' : null;
  }
  if (technique === 'corner') {
    if ((m.goalMin >= 55 && m.goalMin <= 105) ||
      (m.goalieMin >= 36.7 && m.goalieMin <= 86.7)) return 'left';
    return 'right';
  }
  if (m.puckX < m.goalieMin) return 'left';
  if (m.puckX > m.goalieMax) return 'right';
  return null;
}

export function getAdvancedTrainingV2Scenario(
  technique: AdvancedTrainingV2Technique,
  side: AdvancedTrainingV2Side,
  stage: AdvancedTrainingV2Stage,
  ordinal: number,
): AdvancedTrainingV2Scenario {
  const matching = ADVANCED_TRAINING_V2_SCENARIOS.filter((scenario) =>
    scenario.technique === technique && scenario.side === side && scenario.stage === stage);
  if (!Number.isSafeInteger(ordinal) || ordinal < 0 || matching.length === 0) {
    throw new RangeError('Invalid advanced training V2 scenario request');
  }
  const scenario = matching[ordinal % matching.length]!;
  if (scenario.gameCoreVersion !== GAME_CORE_VERSION) {
    throw new Error('Advanced training V2 scenario bank requires revalidation');
  }
  return scenario;
}

export function evaluateAdvancedTrainingV2Shot(
  scenario: AdvancedTrainingV2Scenario,
  input: ShotInput,
): {
  result: ShotResult;
  actualTechnique: MarksmanshipV6Technique | null;
  actualSide: AdvancedTrainingV2Side | null;
  success: boolean;
  measurements: MarksmanshipV6Measurements | null;
} {
  if (scenario.gameCoreVersion !== GAME_CORE_VERSION) {
    throw new Error('Advanced training V2 scenario bank requires revalidation');
  }
  const context = resolveMarksmanshipShotContext({
    shotInput: { tapTime: input.tapTime, shooterTapTime: input.shooterTapTime ?? input.tapTime,
      ...scenario.speeds },
    goalie: getGoalie(scenario.goalieId), seed: scenario.shotSeed,
    shotIndex: scenario.shotIndex,
    phaseOffsets: getSessionPhaseOffsets(scenario.sessionSeed), earliestTapTime: 0,
    scoring: DEFAULT_MARKSMANSHIP_V6_SCORING_RULES,
  });
  const measurements = context.result.type === 'goal' ? context.v6Measurements ?? null : null;
  const actualTechnique = measurements === null ? null : classifyMarksmanshipV6Score(measurements).technique;
  const actualSide = measurements === null || actualTechnique === null ? null
    : getAdvancedTrainingV2Side(actualTechnique, measurements);
  return {
    result: context.result,
    actualTechnique,
    actualSide,
    success: actualTechnique === scenario.technique && actualSide === scenario.side,
    measurements,
  };
}
