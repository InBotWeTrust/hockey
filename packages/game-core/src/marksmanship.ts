import {
  PERSPECTIVE_COURT_GOALIE_VISUAL_X_SCALE,
  PERSPECTIVE_COURT_GOAL_VISUAL_OFFSET_X_SCALE,
  PERSPECTIVE_COURT_HITBOX_GOALIE_INSET,
  PERSPECTIVE_COURT_HITBOX_GOALIE_WIDTH_SCALE,
  PERSPECTIVE_COURT_HITBOX_GOAL_INSET,
  PERSPECTIVE_COURT_HITBOX_GOAL_WIDTH_SCALE,
  PERSPECTIVE_COURT_VISUAL_X_CENTER,
  resolvePerspectiveCourtShot,
} from './court/perspective.js';
import { simulateGoal } from './goal/simulate.js';
import { simulateGoalie } from './goalie/simulate.js';
import { GOALIE_Y } from './goalie/types.js';
import type { GoalieConfig } from './goalie/types.js';
import { GOAL_OPENING, PUCK_START } from './rink.js';
import type { SessionPhaseOffsets } from './session.js';
import { simulateShooter } from './shooter/simulate.js';
import { SHOOTER_FREQUENCY, SHOOTER_MAX_X, SHOOTER_MIN_X } from './shooter/types.js';
import { GOALIE_HITBOX_EXPAND, GOAL_HITBOX_MARGIN } from './shot/resolve.js';
import { PUCK_SPEED_PER_MS, STICK_NEUTRAL, type ShotInput, type ShotResult } from './shot/types.js';

export type MarksmanshipDifficultyCode =
  | 'open'
  | 'timed'
  | 'precise'
  | 'narrow'
  | 'very_narrow'
  | 'instant';

export interface MarksmanshipScoreBracket {
  minWindowMs: number;
  points: number;
  code: MarksmanshipDifficultyCode;
}

export interface MarksmanshipScoringRules {
  scanStepMs: number;
  counterDirectionBonus: number;
  counterDirectionGoalDistance: number;
  closeGoalieBonus: number;
  behindGoalieBonus: number;
  boardNarrowBonus: number;
  doubleMultiplier: number;
  tripleMultiplier: number;
  brackets: readonly MarksmanshipScoreBracket[];
}

export const DEFAULT_MARKSMANSHIP_SCORING_RULES = {
  scanStepMs: 10,
  counterDirectionBonus: 20,
  counterDirectionGoalDistance: 24,
  closeGoalieBonus: 15,
  behindGoalieBonus: 30,
  boardNarrowBonus: 10,
  doubleMultiplier: 1.7,
  tripleMultiplier: 1.8,
  brackets: [
    { minWindowMs: 250, points: 100, code: 'open' },
    { minWindowMs: 160, points: 115, code: 'timed' },
    { minWindowMs: 100, points: 130, code: 'precise' },
    { minWindowMs: 70, points: 140, code: 'narrow' },
    { minWindowMs: 50, points: 155, code: 'very_narrow' },
    { minWindowMs: 0, points: 170, code: 'instant' },
  ],
} as const satisfies MarksmanshipScoringRules;

const MARKSMANSHIP_DIFFICULTY_CODES = new Set<MarksmanshipDifficultyCode>([
  'open',
  'timed',
  'precise',
  'narrow',
  'very_narrow',
  'instant',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

export function parseMarksmanshipScoringRules(value: unknown): MarksmanshipScoringRules {
  const legacyKeys = [
    'scanStepMs',
    'counterDirectionBonus',
    'counterDirectionGoalDistance',
    'brackets',
  ] as const;
  const v2Keys = [
    ...legacyKeys,
    'closeGoalieBonus',
    'behindGoalieBonus',
    'boardNarrowBonus',
    'doubleMultiplier',
    'tripleMultiplier',
  ] as const;
  const isLegacy = isRecord(value) && hasExactKeys(value, legacyKeys);
  if (
    !isRecord(value) ||
    (!isLegacy && !hasExactKeys(value, v2Keys)) ||
    !Number.isInteger(value.scanStepMs) ||
    (value.scanStepMs as number) < 1 ||
    (value.scanStepMs as number) > 1_000 ||
    !Number.isInteger(value.counterDirectionBonus) ||
    (value.counterDirectionBonus as number) < 0 ||
    (value.counterDirectionBonus as number) > 1_000_000 ||
    typeof value.counterDirectionGoalDistance !== 'number' ||
    !Number.isFinite(value.counterDirectionGoalDistance) ||
    value.counterDirectionGoalDistance < 0 ||
    value.counterDirectionGoalDistance > 10_000 ||
    !Array.isArray(value.brackets) ||
    value.brackets.length !== MARKSMANSHIP_DIFFICULTY_CODES.size ||
    (!isLegacy &&
      (!Number.isInteger(value.closeGoalieBonus) ||
        (value.closeGoalieBonus as number) < 0 ||
        !Number.isInteger(value.behindGoalieBonus) ||
        (value.behindGoalieBonus as number) < 0 ||
        !Number.isInteger(value.boardNarrowBonus) ||
        (value.boardNarrowBonus as number) < 0 ||
        typeof value.doubleMultiplier !== 'number' ||
        !Number.isFinite(value.doubleMultiplier) ||
        value.doubleMultiplier < 1 ||
        typeof value.tripleMultiplier !== 'number' ||
        !Number.isFinite(value.tripleMultiplier) ||
        value.tripleMultiplier < 1))
  ) {
    throw new Error('invalid marksmanship scoring rules');
  }

  const seenCodes = new Set<MarksmanshipDifficultyCode>();
  const seenThresholds = new Set<number>();
  const brackets = value.brackets.map((bracket): MarksmanshipScoreBracket => {
    if (
      !isRecord(bracket) ||
      !hasExactKeys(bracket, ['minWindowMs', 'points', 'code']) ||
      !Number.isInteger(bracket.minWindowMs) ||
      (bracket.minWindowMs as number) < 0 ||
      (bracket.minWindowMs as number) > 60_000 ||
      !Number.isInteger(bracket.points) ||
      (bracket.points as number) < 0 ||
      (bracket.points as number) > 1_000_000 ||
      typeof bracket.code !== 'string' ||
      !MARKSMANSHIP_DIFFICULTY_CODES.has(bracket.code as MarksmanshipDifficultyCode)
    ) {
      throw new Error('invalid marksmanship scoring rules');
    }
    const code = bracket.code as MarksmanshipDifficultyCode;
    const minWindowMs = bracket.minWindowMs as number;
    if (seenCodes.has(code) || seenThresholds.has(minWindowMs)) {
      throw new Error('invalid marksmanship scoring rules');
    }
    seenCodes.add(code);
    seenThresholds.add(minWindowMs);
    return { minWindowMs, points: bracket.points as number, code };
  });
  if (!seenThresholds.has(0)) throw new Error('invalid marksmanship scoring rules');

  return {
    scanStepMs: value.scanStepMs as number,
    counterDirectionBonus: value.counterDirectionBonus as number,
    counterDirectionGoalDistance: value.counterDirectionGoalDistance,
    closeGoalieBonus: isLegacy ? 0 : (value.closeGoalieBonus as number),
    behindGoalieBonus: isLegacy ? 0 : (value.behindGoalieBonus as number),
    boardNarrowBonus: isLegacy ? 0 : (value.boardNarrowBonus as number),
    doubleMultiplier: isLegacy ? 1 : (value.doubleMultiplier as number),
    tripleMultiplier: isLegacy ? 1 : (value.tripleMultiplier as number),
    brackets,
  };
}

export interface MarksmanshipShotInput {
  shotInput: ShotInput;
  goalie: GoalieConfig;
  seed: string;
  shotIndex: number;
  phaseOffsets: SessionPhaseOffsets;
  earliestTapTime: number;
  scoring: MarksmanshipScoringRules;
  previousGoals?: readonly MarksmanshipSeriesGoal[];
}

export interface MarksmanshipShotClassification {
  result: ShotResult;
  windowDurationMs: number | null;
  opportunity: 'scored' | 'human_error' | 'closed';
  timingErrorMs: number | null;
  basePoints: number;
  counterDirection: boolean;
  geometry: MarksmanshipGeometry;
  series: MarksmanshipSeriesClassification;
  situationBonus: number;
  seriesBonus: number;
  awardedPoints: number;
  difficultyCode: MarksmanshipDifficultyCode | null;
}

export interface MarksmanshipShotContext {
  result: ShotResult;
  counterDirection: boolean;
  geometry: MarksmanshipGeometry;
}

export interface MarksmanshipGeometryInput {
  puckX: number;
  shooterX: number;
  shooterDirection: number;
  goalieCenterX: number;
  goalieHalfWidth: number;
  goalieDirection: number;
  goalXMin: number;
  goalXMax: number;
  maxGoalDistance?: number;
}

export interface MarksmanshipGeometry {
  boardSide: boolean;
  closeToGoalie: boolean;
  counterDirection: boolean;
  behindGoalie: boolean;
}

export interface MarksmanshipSeriesGoal {
  tapTime: number;
  shooterTapTime: number;
}

export interface MarksmanshipSeriesInput {
  tapTime: number;
  shooterTapTime: number;
  shooterFrequency: number;
  shooterPhaseOffset: number;
  previousGoals: readonly MarksmanshipSeriesGoal[];
}

export interface MarksmanshipSeriesClassification {
  type: 'single' | 'double' | 'triple';
  index: 1 | 2 | 3;
  multiplier: number;
  passId: number;
}

export interface StrictCounterDirectionInput {
  puckX: number;
  goalieCenterX: number;
  goalieHalfWidth: number;
  goalieDirection: number;
  goalXMin: number;
  goalXMax: number;
  maxGoalDistance: number;
}

const MAX_WINDOW_SCAN_MS = 60_000;
const OPPORTUNITY_SCAN_MS = 250;
const BOARD_ZONE_WIDTH = 24;
const CLOSE_GOALIE_DISTANCE = 15;

export function classifyMarksmanshipGeometry(
  input: MarksmanshipGeometryInput,
): MarksmanshipGeometry {
  const goalieXMin = input.goalieCenterX - input.goalieHalfWidth;
  const goalieXMax = input.goalieCenterX + input.goalieHalfWidth;
  const goalieDistance = Math.max(0, goalieXMin - input.puckX, input.puckX - goalieXMax);
  const closeToGoalie = goalieDistance <= CLOSE_GOALIE_DISTANCE;
  const goalieNearGoal =
    Math.max(0, input.goalXMin - goalieXMax, goalieXMin - input.goalXMax) <=
    (input.maxGoalDistance ?? DEFAULT_MARKSMANSHIP_SCORING_RULES.counterDirectionGoalDistance);
  const oppositeSide =
    input.goalieDirection > 0
      ? input.puckX < input.goalieCenterX
      : input.goalieDirection < 0
        ? input.puckX > input.goalieCenterX
        : false;
  return {
    boardSide:
      input.shooterX <= SHOOTER_MIN_X + BOARD_ZONE_WIDTH ||
      input.shooterX >= SHOOTER_MAX_X - BOARD_ZONE_WIDTH,
    closeToGoalie,
    counterDirection: goalieNearGoal && oppositeSide,
    behindGoalie: closeToGoalie && oppositeSide,
  };
}

function shooterPassId(shooterTapTime: number, frequency: number, phaseOffset: number): number {
  const halfPeriodMs = 500 / frequency;
  return Math.floor((shooterTapTime + phaseOffset) / halfPeriodMs);
}

export function classifyMarksmanshipSeries(
  input: MarksmanshipSeriesInput,
  scoring: Pick<MarksmanshipScoringRules, 'doubleMultiplier' | 'tripleMultiplier'> =
    DEFAULT_MARKSMANSHIP_SCORING_RULES,
): MarksmanshipSeriesClassification {
  const passId = shooterPassId(
    input.shooterTapTime,
    input.shooterFrequency,
    input.shooterPhaseOffset,
  );
  const goalsInPass = input.previousGoals.filter(
    (goal) =>
      goal.tapTime <= input.tapTime &&
      shooterPassId(goal.shooterTapTime, input.shooterFrequency, input.shooterPhaseOffset) ===
      passId,
  );
  if (goalsInPass.length >= 2) {
    return { type: 'triple', index: 3, multiplier: scoring.tripleMultiplier, passId };
  }
  const previous = goalsInPass.at(-1);
  const previousDeltaMs = previous === undefined ? null : input.tapTime - previous.tapTime;
  if (previousDeltaMs !== null && previousDeltaMs >= 0 && previousDeltaMs < 1_000) {
    return { type: 'double', index: 2, multiplier: scoring.doubleMultiplier, passId };
  }
  return { type: 'single', index: 1, multiplier: 1, passId };
}

export interface MarksmanshipScoreBreakdownInput {
  basePoints: number;
  windowDurationMs: number;
  geometry: MarksmanshipGeometry;
  series: MarksmanshipSeriesClassification;
  scoring: MarksmanshipScoringRules;
}

export interface MarksmanshipScoreBreakdown {
  basePoints: number;
  multipliedBasePoints: number;
  situationBonus: number;
  seriesBonus: number;
  awardedPoints: number;
}

export function scoreMarksmanshipBreakdown(
  input: MarksmanshipScoreBreakdownInput,
): MarksmanshipScoreBreakdown {
  const multipliedBasePoints = Math.round(input.basePoints * input.series.multiplier);
  const situationBonus =
    (input.geometry.counterDirection ? input.scoring.counterDirectionBonus : 0) +
    (input.geometry.closeToGoalie ? input.scoring.closeGoalieBonus : 0) +
    (input.geometry.behindGoalie ? input.scoring.behindGoalieBonus : 0) +
    (input.geometry.boardSide && input.windowDurationMs < 160
      ? input.scoring.boardNarrowBonus
      : 0);
  return {
    basePoints: input.basePoints,
    multipliedBasePoints,
    situationBonus,
    seriesBonus: multipliedBasePoints - input.basePoints,
    awardedPoints: multipliedBasePoints + situationBonus,
  };
}

function bracketForWindow(
  windowDurationMs: number,
  rules: MarksmanshipScoringRules,
): MarksmanshipScoreBracket {
  const bracket = [...rules.brackets]
    .sort((a, b) => b.minWindowMs - a.minWindowMs)
    .find((candidate) => windowDurationMs >= candidate.minWindowMs);
  if (bracket === undefined) {
    throw new Error('marksmanship scoring rules do not cover the supplied goal window');
  }
  return bracket;
}

export function scoreMarksmanshipWindow(
  windowDurationMs: number,
  rules: MarksmanshipScoringRules,
): number {
  return bracketForWindow(windowDurationMs, rules).points;
}

export function isStrictCounterDirection(input: StrictCounterDirectionInput): boolean {
  if (input.goalieDirection === 0) return false;
  const goalieXMin = input.goalieCenterX - input.goalieHalfWidth;
  const goalieXMax = input.goalieCenterX + input.goalieHalfWidth;
  const distanceToGoal = Math.max(0, input.goalXMin - goalieXMax, goalieXMin - input.goalXMax);
  if (distanceToGoal > input.maxGoalDistance) return false;
  return input.goalieDirection > 0
    ? input.puckX < input.goalieCenterX
    : input.puckX > input.goalieCenterX;
}

function shiftedShotInput(input: ShotInput, deltaMs: number): ShotInput {
  return {
    ...input,
    tapTime: input.tapTime + deltaMs,
    ...(input.shooterTapTime === undefined
      ? {}
      : { shooterTapTime: input.shooterTapTime + deltaMs }),
  };
}

function goalWindowDuration(input: MarksmanshipShotInput): number {
  const stepMs = input.scoring.scanStepMs;
  if (!Number.isFinite(stepMs) || stepMs <= 0) {
    throw new Error('marksmanship scan step must be positive');
  }
  const lowerBound = Math.min(input.shotInput.tapTime, Math.max(0, input.earliestTapTime));
  const maxSteps = Math.ceil(MAX_WINDOW_SCAN_MS / stepMs);
  let successfulSamples = 1;

  for (let step = 1; step <= maxSteps; step += 1) {
    const deltaMs = -(step * stepMs);
    if (input.shotInput.tapTime + deltaMs < lowerBound) break;
    const result = resolvePerspectiveCourtShot(
      shiftedShotInput(input.shotInput, deltaMs),
      input.goalie,
      input.seed,
      input.shotIndex,
      STICK_NEUTRAL,
      input.phaseOffsets,
    );
    if (result.type !== 'goal') break;
    successfulSamples += 1;
  }

  for (let step = 1; step <= maxSteps; step += 1) {
    const deltaMs = step * stepMs;
    const result = resolvePerspectiveCourtShot(
      shiftedShotInput(input.shotInput, deltaMs),
      input.goalie,
      input.seed,
      input.shotIndex,
      STICK_NEUTRAL,
      input.phaseOffsets,
    );
    if (result.type !== 'goal') break;
    successfulSamples += 1;
  }

  return successfulSamples * stepMs;
}

function geometryForShot(
  input: MarksmanshipShotInput,
  puckX: number,
): MarksmanshipGeometry {
  const speed = input.shotInput.puckSpeedPerMs ?? PUCK_SPEED_PER_MS;
  const effectiveGoalie = {
    ...input.goalie,
    frequency: input.shotInput.goalieFrequency ?? input.goalie.frequency,
    goalFrequency: input.shotInput.goalFrequency ?? input.goalie.goalFrequency,
  };
  const goalieCrossTime = input.shotInput.tapTime + (PUCK_START.y - GOALIE_Y) / speed;
  const before = simulateGoalie(
    effectiveGoalie,
    input.seed,
    input.shotIndex,
    goalieCrossTime - 5,
    input.phaseOffsets.goalie,
  );
  const atCross = simulateGoalie(
    effectiveGoalie,
    input.seed,
    input.shotIndex,
    goalieCrossTime,
    input.phaseOffsets.goalie,
  );
  const after = simulateGoalie(
    effectiveGoalie,
    input.seed,
    input.shotIndex,
    goalieCrossTime + 5,
    input.phaseOffsets.goalie,
  );
  const visualX = (x: number): number =>
    PERSPECTIVE_COURT_VISUAL_X_CENTER +
    (x - PERSPECTIVE_COURT_VISUAL_X_CENTER) * PERSPECTIVE_COURT_GOALIE_VISUAL_X_SCALE;
  const goalieWidth = Math.max(
    0,
    (atCross.width + GOALIE_HITBOX_EXPAND) * PERSPECTIVE_COURT_HITBOX_GOALIE_WIDTH_SCALE -
      PERSPECTIVE_COURT_HITBOX_GOALIE_INSET * 2,
  );
  const goalOffset =
    simulateGoal(effectiveGoalie, goalieCrossTime, input.phaseOffsets.goal).offsetX *
    PERSPECTIVE_COURT_GOAL_VISUAL_OFFSET_X_SCALE;
  const goalCenter = (GOAL_OPENING.xMin + GOAL_OPENING.xMax) / 2 + goalOffset;
  const goalWidth = Math.max(
    0,
    (GOAL_OPENING.xMax - GOAL_HITBOX_MARGIN - (GOAL_OPENING.xMin + GOAL_HITBOX_MARGIN)) *
      PERSPECTIVE_COURT_HITBOX_GOAL_WIDTH_SCALE -
      PERSPECTIVE_COURT_HITBOX_GOAL_INSET * 2,
  );

  const shooterTime = input.shotInput.shooterTapTime ?? input.shotInput.tapTime;
  const shooterAt = simulateShooter(
    shooterTime + input.phaseOffsets.shooter,
    input.shotInput.shooterFrequency,
  ).x;
  const shooterBefore = simulateShooter(
    shooterTime - 5 + input.phaseOffsets.shooter,
    input.shotInput.shooterFrequency,
  ).x;
  const shooterAfter = simulateShooter(
    shooterTime + 5 + input.phaseOffsets.shooter,
    input.shotInput.shooterFrequency,
  ).x;
  return classifyMarksmanshipGeometry({
    puckX,
    shooterX: shooterAt,
    shooterDirection: Math.sign(shooterAfter - shooterBefore),
    goalieCenterX: visualX(atCross.position.x),
    goalieHalfWidth: goalieWidth / 2,
    goalieDirection: Math.sign(visualX(after.position.x) - visualX(before.position.x)),
    goalXMin: goalCenter - goalWidth / 2,
    goalXMax: goalCenter + goalWidth / 2,
    maxGoalDistance: input.scoring.counterDirectionGoalDistance,
  });
}

function resultX(input: MarksmanshipShotInput, result: ShotResult): number {
  if (result.type === 'goal') return result.hitPoint.x;
  if (result.type === 'save') return result.goalieContact.x;
  const shooterTime = input.shotInput.shooterTapTime ?? input.shotInput.tapTime;
  return simulateShooter(
    shooterTime + input.phaseOffsets.shooter,
    input.shotInput.shooterFrequency,
  ).x;
}

function nearestGoalDelta(input: MarksmanshipShotInput): number | null {
  const stepMs = input.scoring.scanStepMs;
  const maxSteps = Math.floor(OPPORTUNITY_SCAN_MS / stepMs);
  for (let step = 1; step <= maxSteps; step += 1) {
    for (const direction of [-1, 1] as const) {
      const deltaMs = step * stepMs * direction;
      if (input.shotInput.tapTime + deltaMs < Math.max(0, input.earliestTapTime)) continue;
      const result = resolvePerspectiveCourtShot(
        shiftedShotInput(input.shotInput, deltaMs),
        input.goalie,
        input.seed,
        input.shotIndex,
        STICK_NEUTRAL,
        input.phaseOffsets,
      );
      if (result.type === 'goal') return deltaMs;
    }
  }
  return null;
}

export function resolveMarksmanshipShotContext(
  input: MarksmanshipShotInput,
): MarksmanshipShotContext {
  const result = resolvePerspectiveCourtShot(
    input.shotInput,
    input.goalie,
    input.seed,
    input.shotIndex,
    STICK_NEUTRAL,
    input.phaseOffsets,
  );
  const geometry = geometryForShot(input, resultX(input, result));
  return {
    result,
    counterDirection: geometry.counterDirection,
    geometry,
  };
}

export function classifyMarksmanshipShot(
  input: MarksmanshipShotInput,
): MarksmanshipShotClassification {
  const { result, counterDirection, geometry } = resolveMarksmanshipShotContext(input);
  const series = classifyMarksmanshipSeries(
    {
      tapTime: input.shotInput.tapTime,
      shooterTapTime: input.shotInput.shooterTapTime ?? input.shotInput.tapTime,
      shooterFrequency: input.shotInput.shooterFrequency ?? SHOOTER_FREQUENCY,
      shooterPhaseOffset: input.phaseOffsets.shooter,
      previousGoals: input.previousGoals ?? [],
    },
    input.scoring,
  );
  if (result.type !== 'goal') {
    const timingErrorMs = nearestGoalDelta(input);
    return {
      result,
      windowDurationMs: null,
      opportunity: timingErrorMs === null ? 'closed' : 'human_error',
      timingErrorMs,
      basePoints: 0,
      counterDirection,
      geometry,
      series: { ...series, type: 'single', index: 1, multiplier: 1 },
      situationBonus: 0,
      seriesBonus: 0,
      awardedPoints: 0,
      difficultyCode: null,
    };
  }

  const windowDurationMs = goalWindowDuration(input);
  const bracket = bracketForWindow(windowDurationMs, input.scoring);
  const breakdown = scoreMarksmanshipBreakdown({
    basePoints: bracket.points,
    windowDurationMs,
    geometry,
    series,
    scoring: input.scoring,
  });
  return {
    result,
    windowDurationMs,
    opportunity: 'scored',
    timingErrorMs: 0,
    basePoints: bracket.points,
    counterDirection,
    geometry,
    series,
    situationBonus: breakdown.situationBonus,
    seriesBonus: breakdown.seriesBonus,
    awardedPoints: breakdown.awardedPoints,
    difficultyCode: bracket.code,
  };
}
