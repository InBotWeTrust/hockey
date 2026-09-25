import {
  PERSPECTIVE_COURT_GOALIE_VISUAL_X_SCALE,
  PERSPECTIVE_COURT_GOAL_VISUAL_OFFSET_X_SCALE,
  PERSPECTIVE_COURT_HITBOX_GOALIE_INSET,
  PERSPECTIVE_COURT_HITBOX_GOALIE_WIDTH_SCALE,
  PERSPECTIVE_COURT_HITBOX_GOAL_INSET,
  PERSPECTIVE_COURT_HITBOX_GOAL_WIDTH_SCALE,
  PERSPECTIVE_COURT_VISUAL_X_CENTER,
  getPerspectiveCourtGoalOpening,
  getPerspectiveCourtGoalieHitbox,
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
import {
  classifyMarksmanshipV5Score,
  type MarksmanshipV5Measurements,
  type MarksmanshipV5Score,
} from './marksmanshipV5.js';

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
  version?: 3 | 4 | 5;
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

export type MarksmanshipV3Reason =
  | 'ordinary' | 'timed' | 'narrow' | 'instant'
  | 'goalie_covers_goal' | 'near_goalie' | 'left_board' | 'right_board'
  | 'counter_direction' | 'close_counter_direction';

export interface MarksmanshipV3Score {
  category: 1 | 2 | 3 | 4;
  points: 1 | 2 | 3 | 4;
  reason: MarksmanshipV3Reason;
}

export type MarksmanshipV4Technique =
  | 'ordinary' | 'near_goalie' | 'board_side' | 'counter_direction'
  | 'precise' | 'behind_goalie' | 'super_precise';

export interface MarksmanshipV4Measurements {
  goalieGap: number;
  postGap: number;
  goalieOverlapsGoal: boolean;
  shooterDirection: number;
  goalDirection: number;
  goalieTravel: number;
  goalieAtTapCoversPuck: boolean;
  goalOffset: number;
  maxGoalOffset: number;
  goaliePosition: number;
}

export interface MarksmanshipV4Score {
  technique: MarksmanshipV4Technique;
  points: 10 | 12 | 13 | 14 | 15 | 20;
  availableTechniques: MarksmanshipV4Technique[];
}

const V4_PRIORITY: readonly { technique: MarksmanshipV4Technique; points: MarksmanshipV4Score['points'] }[] = [
  { technique: 'super_precise', points: 20 },
  { technique: 'behind_goalie', points: 15 },
  { technique: 'precise', points: 14 },
  { technique: 'counter_direction', points: 13 },
  { technique: 'board_side', points: 13 },
  { technique: 'near_goalie', points: 12 },
  { technique: 'ordinary', points: 10 },
];

export function classifyMarksmanshipV4Score(m: MarksmanshipV4Measurements): MarksmanshipV4Score {
  const counterDirection = m.shooterDirection !== 0 && m.goalDirection !== 0 &&
    m.shooterDirection !== m.goalDirection;
  const nearGoalie = m.goalieGap <= 80;
  const boardSide = m.maxGoalOffset > 0 &&
    Math.abs(m.goalOffset) >= m.maxGoalOffset - 30 &&
    (m.goalOffset < 0 ? m.goaliePosition <= 150 : m.goaliePosition >= 422);
  const active: Record<MarksmanshipV4Technique, boolean> = {
    super_precise: m.goalieGap <= 12 && m.postGap <= 12,
    behind_goalie: counterDirection && m.goalieTravel >= 200 && m.goalieAtTapCoversPuck,
    precise: m.goalieOverlapsGoal && m.goalieGap <= 35,
    counter_direction: counterDirection,
    board_side: boardSide,
    near_goalie: nearGoalie,
    ordinary: true,
  };
  const availableTechniques = V4_PRIORITY.filter(({ technique }) => active[technique])
    .map(({ technique }) => technique);
  const primary = V4_PRIORITY.find(({ technique }) => active[technique])!;
  return { technique: primary.technique, points: primary.points, availableTechniques };
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

export const DEFAULT_MARKSMANSHIP_V3_SCORING_RULES = {
  version: 3,
  scanStepMs: 10,
  counterDirectionBonus: 0,
  counterDirectionGoalDistance: 24,
  closeGoalieBonus: 0,
  behindGoalieBonus: 0,
  boardNarrowBonus: 0,
  doubleMultiplier: 1,
  tripleMultiplier: 1,
  brackets: [
    { minWindowMs: 160, points: 1, code: 'open' },
    { minWindowMs: 100, points: 2, code: 'precise' },
    { minWindowMs: 70, points: 3, code: 'narrow' },
    { minWindowMs: 0, points: 4, code: 'instant' },
  ],
} as const satisfies MarksmanshipScoringRules;

export const DEFAULT_MARKSMANSHIP_V4_SCORING_RULES = {
  ...DEFAULT_MARKSMANSHIP_V3_SCORING_RULES,
  version: 4,
} as const satisfies MarksmanshipScoringRules;

export const DEFAULT_MARKSMANSHIP_V5_SCORING_RULES = {
  ...DEFAULT_MARKSMANSHIP_V3_SCORING_RULES,
  version: 5,
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
  const isV3 = isRecord(value) && value.version === 3;
  const isV4 = isRecord(value) && value.version === 4;
  const isV5 = isRecord(value) && value.version === 5;
  const isLegacy = isRecord(value) && hasExactKeys(value, legacyKeys);
  if (
    !isRecord(value) ||
    (!isLegacy && !hasExactKeys(value, isV3 || isV4 || isV5 ? [...v2Keys, 'version'] : v2Keys)) ||
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
    value.brackets.length !== (isV3 || isV4 || isV5 ? 4 : MARKSMANSHIP_DIFFICULTY_CODES.size) ||
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
  if ((isV3 || isV4 || isV5) && (
    value.scanStepMs !== 10 || value.counterDirectionGoalDistance !== 24 ||
    value.counterDirectionBonus !== 0 || value.closeGoalieBonus !== 0 ||
    value.behindGoalieBonus !== 0 || value.boardNarrowBonus !== 0 ||
    value.doubleMultiplier !== 1 || value.tripleMultiplier !== 1 ||
    ![...DEFAULT_MARKSMANSHIP_V3_SCORING_RULES.brackets].every((expected) =>
      brackets.some((actual) => actual.minWindowMs === expected.minWindowMs &&
        actual.points === expected.points && actual.code === expected.code))
  )) throw new Error('invalid marksmanship scoring rules');

  return {
    ...(isV3 ? { version: 3 as const } : isV4 ? { version: 4 as const }
      : isV5 ? { version: 5 as const } : {}),
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
  opportunity: 'scored' | 'human_error' | 'too_short' | 'closed';
  timingErrorMs: number | null;
  basePoints: number;
  counterDirection: boolean;
  geometry: MarksmanshipGeometry;
  series: MarksmanshipSeriesClassification;
  situationBonus: number;
  seriesBonus: number;
  awardedPoints: number;
  difficultyCode: MarksmanshipDifficultyCode | null;
  category?: 1 | 2 | 3 | 4 | null;
  reason?: MarksmanshipV3Reason | null;
  v4Score?: MarksmanshipV4Score | null;
  v4Measurements?: MarksmanshipV4Measurements | null;
  v5Score?: MarksmanshipV5Score | null;
  v5Measurements?: MarksmanshipV5Measurements | null;
}

export interface MarksmanshipShotContext {
  result: ShotResult;
  counterDirection: boolean;
  geometry: MarksmanshipGeometry;
  v4Measurements?: MarksmanshipV4Measurements;
  v5Measurements?: MarksmanshipV5Measurements;
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
  boardSideLocation?: 'left' | 'right' | null;
  goalieNearGoal?: boolean;
}

export function classifyMarksmanshipV3Score(
  windowDurationMs: number,
  geometry: MarksmanshipGeometry,
): MarksmanshipV3Score {
  const windowCategory = windowDurationMs < 70 ? 4
    : windowDurationMs < 100 ? 3 : windowDurationMs < 160 ? 2 : 1;
  const candidates: readonly { category: 1 | 2 | 3 | 4; reason: MarksmanshipV3Reason; active: boolean }[] = [
    { category: 4, reason: 'close_counter_direction', active: geometry.behindGoalie },
    { category: 3, reason: 'counter_direction', active: geometry.counterDirection },
    { category: 3, reason: geometry.boardSideLocation === 'left' ? 'left_board' : 'right_board',
      active: geometry.boardSideLocation != null && windowDurationMs < 160 },
    { category: 2, reason: 'near_goalie', active: geometry.closeToGoalie },
    { category: 2, reason: 'goalie_covers_goal', active: geometry.goalieNearGoal === true },
    { category: windowCategory as 1 | 2 | 3 | 4,
      reason: windowCategory === 4 ? 'instant' : windowCategory === 3 ? 'narrow'
        : windowCategory === 2 ? 'timed' : 'ordinary', active: true },
  ];
  const category = Math.max(...candidates.filter((candidate) => candidate.active)
    .map((candidate) => candidate.category)) as 1 | 2 | 3 | 4;
  const reason = candidates.find((candidate) => candidate.active && candidate.category === category)!.reason;
  return { category, points: category, reason };
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

export function classifyMarksmanshipV3Geometry(
  input: MarksmanshipGeometryInput,
): MarksmanshipGeometry {
  const geometry = classifyMarksmanshipGeometry(input);
  const goalieXMin = input.goalieCenterX - input.goalieHalfWidth;
  const goalieXMax = input.goalieCenterX + input.goalieHalfWidth;
  return {
    ...geometry,
    boardSideLocation: input.shooterX <= SHOOTER_MIN_X + BOARD_ZONE_WIDTH ? 'left'
      : input.shooterX >= SHOOTER_MAX_X - BOARD_ZONE_WIDTH ? 'right' : null,
    goalieNearGoal: Math.max(0,
      input.goalXMin - goalieXMax,
      goalieXMin - input.goalXMax,
    ) <= (input.maxGoalDistance ?? DEFAULT_MARKSMANSHIP_SCORING_RULES.counterDirectionGoalDistance),
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
  const precedingGoals = input.previousGoals.filter((goal) => goal.tapTime <= input.tapTime);
  const goalsInPass = precedingGoals.filter(
    (goal) =>
      shooterPassId(goal.shooterTapTime, input.shooterFrequency, input.shooterPhaseOffset) ===
      passId,
  );
  if (goalsInPass.length >= 2) {
    return { type: 'triple', index: 3, multiplier: scoring.tripleMultiplier, passId };
  }
  const previous = precedingGoals.reduce<MarksmanshipSeriesGoal | null>(
    (latest, goal) => latest === null || goal.tapTime > latest.tapTime ? goal : latest,
    null,
  );
  const previousDeltaMs = previous === null ? null : input.tapTime - previous.tapTime;
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

function goalWindowDurationV4(input: MarksmanshipShotInput): number {
  const coarse = goalWindowDuration(input);
  if (coarse > 40) return coarse;
  const step = input.scoring.scanStepMs;
  const isGoal = (delta: number): boolean => resolvePerspectiveCourtShot(
    shiftedShotInput(input.shotInput, delta), input.goalie, input.seed, input.shotIndex,
    STICK_NEUTRAL, input.phaseOffsets,
  ).type === 'goal';
  const earliest = Math.max(0, input.earliestTapTime);
  let left = 0;
  let right = 0;
  while (input.shotInput.tapTime + left - step >= earliest && isGoal(left - step)) left -= step;
  while (isGoal(right + step)) right += step;
  if (input.shotInput.tapTime + left - step >= earliest) {
    let failed = left - step;
    let passed = left;
    for (let index = 0; index < 8; index += 1) {
      const midpoint = (failed + passed) / 2;
      if (isGoal(midpoint)) passed = midpoint;
      else failed = midpoint;
    }
    left = passed;
  }
  {
    let passed = right;
    let failed = right + step;
    for (let index = 0; index < 8; index += 1) {
      const midpoint = (passed + failed) / 2;
      if (isGoal(midpoint)) passed = midpoint;
      else failed = midpoint;
    }
    right = passed;
  }
  return Math.max(1, Math.round(right - left));
}

export function marksmanshipV4OpportunityForWindow(
  windowDurationMs: number | null,
): 'human_error' | 'too_short' | 'closed' {
  if (windowDurationMs === null) return 'closed';
  return windowDurationMs < 25 ? 'too_short' : 'human_error';
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
  const geometryInput = {
    puckX,
    shooterX: shooterAt,
    shooterDirection: Math.sign(shooterAfter - shooterBefore),
    goalieCenterX: visualX(atCross.position.x),
    goalieHalfWidth: goalieWidth / 2,
    goalieDirection: Math.sign(visualX(after.position.x) - visualX(before.position.x)),
    goalXMin: goalCenter - goalWidth / 2,
    goalXMax: goalCenter + goalWidth / 2,
    maxGoalDistance: input.scoring.counterDirectionGoalDistance,
  };
  return input.scoring.version === 3
    ? classifyMarksmanshipV3Geometry(geometryInput)
    : classifyMarksmanshipGeometry(geometryInput);
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

function measurementsForV4Shot(input: MarksmanshipShotInput, puckX: number): MarksmanshipV4Measurements {
  const speed = input.shotInput.puckSpeedPerMs ?? PUCK_SPEED_PER_MS;
  const goalie = {
    ...input.goalie,
    frequency: input.shotInput.goalieFrequency ?? input.goalie.frequency,
    goalFrequency: input.shotInput.goalFrequency ?? input.goalie.goalFrequency,
  };
  const tapTime = input.shotInput.tapTime;
  const goalieCrossTime = tapTime + (PUCK_START.y - GOALIE_Y) / speed;
  const goalCrossTime = tapTime + (PUCK_START.y - GOAL_OPENING.y) / speed;
  const atTap = simulateGoalie(goalie, input.seed, input.shotIndex, tapTime, input.phaseOffsets.goalie);
  const atCross = simulateGoalie(goalie, input.seed, input.shotIndex, goalieCrossTime, input.phaseOffsets.goalie);
  const visualX = (x: number): number =>
    PERSPECTIVE_COURT_VISUAL_X_CENTER +
    (x - PERSPECTIVE_COURT_VISUAL_X_CENTER) * PERSPECTIVE_COURT_GOALIE_VISUAL_X_SCALE;
  const goalieHalfWidthAt = (width: number): number => Math.max(0,
    (width + GOALIE_HITBOX_EXPAND) * PERSPECTIVE_COURT_HITBOX_GOALIE_WIDTH_SCALE -
    PERSPECTIVE_COURT_HITBOX_GOALIE_INSET * 2,
  ) / 2;
  const goalieCenter = visualX(atCross.position.x);
  const goalieHalfWidth = goalieHalfWidthAt(atCross.width);
  const goalieMin = goalieCenter - goalieHalfWidth;
  const goalieMax = goalieCenter + goalieHalfWidth;
  const goalOffset = simulateGoal(goalie, goalieCrossTime, input.phaseOffsets.goal).offsetX;
  const goalCenter = (GOAL_OPENING.xMin + GOAL_OPENING.xMax) / 2 +
    goalOffset * PERSPECTIVE_COURT_GOAL_VISUAL_OFFSET_X_SCALE;
  const goalWidth = Math.max(0,
    (GOAL_OPENING.xMax - GOAL_HITBOX_MARGIN - (GOAL_OPENING.xMin + GOAL_HITBOX_MARGIN)) *
    PERSPECTIVE_COURT_HITBOX_GOAL_WIDTH_SCALE - PERSPECTIVE_COURT_HITBOX_GOAL_INSET * 2,
  );
  const goalMin = goalCenter - goalWidth / 2;
  const goalMax = goalCenter + goalWidth / 2;
  const goalAtCross = simulateGoal(goalie, goalCrossTime, input.phaseOffsets.goal).offsetX;
  const goalMinAtCross = (GOAL_OPENING.xMin + GOAL_OPENING.xMax) / 2 +
    goalAtCross * PERSPECTIVE_COURT_GOAL_VISUAL_OFFSET_X_SCALE - goalWidth / 2;
  const goalMaxAtCross = goalMinAtCross + goalWidth;
  const shooterTime = input.shotInput.shooterTapTime ?? tapTime;
  const shooterBefore = simulateShooter(shooterTime - 5 + input.phaseOffsets.shooter,
    input.shotInput.shooterFrequency).x;
  const shooterAfter = simulateShooter(shooterTime + 5 + input.phaseOffsets.shooter,
    input.shotInput.shooterFrequency).x;
  const goalBefore = simulateGoal(goalie, tapTime - 5, input.phaseOffsets.goal).offsetX;
  const goalAfter = simulateGoal(goalie, tapTime + 5, input.phaseOffsets.goal).offsetX;
  const goalieAtTapCenter = visualX(atTap.position.x);
  const goalieAtTapHalfWidth = goalieHalfWidthAt(atTap.width);
  return {
    goalieGap: Math.max(0, goalieMin - puckX, puckX - goalieMax),
    postGap: Math.min(Math.abs(puckX - goalMinAtCross), Math.abs(puckX - goalMaxAtCross)),
    goalieOverlapsGoal: goalieMax >= goalMin && goalieMin <= goalMax,
    shooterDirection: Math.sign(shooterAfter - shooterBefore),
    goalDirection: Math.sign(goalAfter - goalBefore),
    goalieTravel: Math.abs(atCross.position.x - atTap.position.x),
    goalieAtTapCoversPuck: puckX >= goalieAtTapCenter - goalieAtTapHalfWidth &&
      puckX <= goalieAtTapCenter + goalieAtTapHalfWidth,
    goalOffset,
    maxGoalOffset: goalie.goalAmplitude,
    goaliePosition: atCross.position.x,
  };
}

function movementDirection(before: number, after: number): -1 | 0 | 1 {
  const delta = after - before;
  if (Math.abs(delta) < 1e-7) return 0;
  return delta < 0 ? -1 : 1;
}

function measurementsForV5Shot(input: MarksmanshipShotInput, puckX: number): MarksmanshipV5Measurements {
  const shot = input.shotInput;
  const speed = shot.puckSpeedPerMs ?? PUCK_SPEED_PER_MS;
  const effectiveGoalie = {
    ...input.goalie,
    frequency: shot.goalieFrequency ?? input.goalie.frequency,
    goalFrequency: shot.goalFrequency ?? input.goalie.goalFrequency,
  };
  const goalieCrossTime = shot.tapTime + (PUCK_START.y - GOALIE_Y) / speed;
  const goalCrossTime = shot.tapTime + (PUCK_START.y - GOAL_OPENING.y) / speed;
  const goalie = getPerspectiveCourtGoalieHitbox(
    shot, effectiveGoalie, input.seed, input.shotIndex, STICK_NEUTRAL, input.phaseOffsets,
  );
  const goal = getPerspectiveCourtGoalOpening(shot, effectiveGoalie, input.phaseOffsets);
  const shooterTime = (shot.shooterTapTime ?? shot.tapTime) + input.phaseOffsets.shooter;
  const shooterAt = simulateShooter(shooterTime, shot.shooterFrequency).x;
  const shooterBefore = simulateShooter(shooterTime - 5, shot.shooterFrequency).x;
  const goalieX = (timeMs: number): number => simulateGoalie(
    effectiveGoalie, input.seed, input.shotIndex, timeMs, input.phaseOffsets.goalie,
  ).position.x;
  const goalX = (timeMs: number): number => simulateGoal(
    effectiveGoalie, timeMs, input.phaseOffsets.goal,
  ).offsetX;
  return {
    puckX,
    goalMin: goal.xMin,
    goalMax: goal.xMax,
    goalieMin: goalie.xMin,
    goalieMax: goalie.xMax,
    shooterDirection: movementDirection(shooterBefore, shooterAt),
    goalieDirection: movementDirection(goalieX(goalieCrossTime - 5), goalieX(goalieCrossTime + 5)),
    goalDirection: movementDirection(goalX(goalCrossTime - 5), goalX(goalCrossTime + 5)),
  };
}

function nearestGoalDelta(input: MarksmanshipShotInput): number | null {
  const stepMs = input.scoring.scanStepMs;
  const maxSteps = Math.floor((input.scoring.version === 4 || input.scoring.version === 5
    ? 600 : OPPORTUNITY_SCAN_MS) / stepMs);
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
  const v4Measurements = input.scoring.version === 4
    ? measurementsForV4Shot(input, resultX(input, result)) : undefined;
  const v5Measurements = input.scoring.version === 5
    ? measurementsForV5Shot(input, resultX(input, result)) : undefined;
  const v4CounterDirection = v4Measurements === undefined ? undefined
    : classifyMarksmanshipV4Score(v4Measurements).availableTechniques.includes('counter_direction');
  const v5CounterDirection = v5Measurements === undefined || result.type !== 'goal' ? undefined
    : classifyMarksmanshipV5Score(v5Measurements).availableTechniques.includes('counter_direction');
  const resolvedGeometry = v4CounterDirection === undefined && v5CounterDirection === undefined
    ? geometry : { ...geometry, counterDirection: v5CounterDirection ?? v4CounterDirection! };
  return {
    result,
    counterDirection: resolvedGeometry.counterDirection,
    geometry: resolvedGeometry,
    ...(v4Measurements === undefined ? {} : { v4Measurements }),
    ...(v5Measurements === undefined ? {} : { v5Measurements }),
  };
}

export function classifyMarksmanshipShot(
  input: MarksmanshipShotInput,
): MarksmanshipShotClassification {
  const { result, counterDirection, geometry, v4Measurements, v5Measurements } =
    resolveMarksmanshipShotContext(input);
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
    const opportunityInput = (input.scoring.version === 4 || input.scoring.version === 5) &&
      timingErrorMs !== null
      ? { ...input, shotInput: shiftedShotInput(input.shotInput, timingErrorMs) }
      : null;
    const opportunityContext = opportunityInput === null ? null
      : resolveMarksmanshipShotContext(opportunityInput);
    const availableV4Measurements = opportunityContext?.result.type === 'goal'
      ? opportunityContext.v4Measurements ?? null : null;
    const availableV4Score = availableV4Measurements === null ? null
      : classifyMarksmanshipV4Score(availableV4Measurements);
    const availableV5Measurements = opportunityContext?.result.type === 'goal'
      ? opportunityContext.v5Measurements ?? null : null;
    const availableV5Score = availableV5Measurements === null ? null
      : classifyMarksmanshipV5Score(availableV5Measurements);
    const availableWindowMs = (input.scoring.version === 4 || input.scoring.version === 5) &&
      timingErrorMs !== null
      ? goalWindowDurationV4(opportunityInput!)
      : null;
    return {
      result,
      windowDurationMs: availableWindowMs,
      opportunity: input.scoring.version === 4 || input.scoring.version === 5
        ? marksmanshipV4OpportunityForWindow(availableWindowMs)
        : timingErrorMs === null ? 'closed' : 'human_error',
      timingErrorMs,
      basePoints: 0,
      counterDirection: input.scoring.version === 4
        ? availableV4Score?.availableTechniques.includes('counter_direction') ?? false
        : input.scoring.version === 5
          ? availableV5Score?.availableTechniques.includes('counter_direction') ?? false
          : counterDirection,
      geometry: opportunityContext?.geometry ?? geometry,
      series: { ...series, type: 'single', index: 1, multiplier: 1 },
      situationBonus: 0,
      seriesBonus: 0,
      awardedPoints: 0,
      difficultyCode: null,
      ...(input.scoring.version === 3 ? { category: null, reason: null } : {}),
      ...(input.scoring.version !== 4 ? {} : {
        v4Measurements: availableV4Measurements, v4Score: availableV4Score,
      }),
      ...(input.scoring.version !== 5 ? {} : {
        v5Measurements: availableV5Measurements, v5Score: availableV5Score,
      }),
    };
  }

  const windowDurationMs = input.scoring.version === 4 || input.scoring.version === 5
    ? goalWindowDurationV4(input) : goalWindowDuration(input);
  if (input.scoring.version === 5) {
    if (v5Measurements === undefined) throw new Error('missing V5 measurements');
    const v5Score = classifyMarksmanshipV5Score(v5Measurements);
    return {
      result, windowDurationMs, opportunity: 'scored', timingErrorMs: 0,
      basePoints: v5Score.points, counterDirection, geometry,
      series: { ...series, multiplier: 1 }, situationBonus: 0, seriesBonus: 0,
      awardedPoints: v5Score.points, difficultyCode: null,
      v5Measurements, v5Score,
    };
  }
  if (input.scoring.version === 4) {
    if (v4Measurements === undefined) throw new Error('missing V4 measurements');
    const v4Score = classifyMarksmanshipV4Score(v4Measurements);
    return {
      result, windowDurationMs, opportunity: 'scored', timingErrorMs: 0,
      basePoints: v4Score.points, counterDirection, geometry,
      series: { ...series, multiplier: 1 }, situationBonus: 0, seriesBonus: 0,
      awardedPoints: v4Score.points, difficultyCode: null,
      v4Measurements, v4Score,
    };
  }
  const bracket = bracketForWindow(windowDurationMs, input.scoring);
  if (input.scoring.version === 3) {
    const score = classifyMarksmanshipV3Score(windowDurationMs, geometry);
    return {
      result, windowDurationMs, opportunity: 'scored', timingErrorMs: 0,
      basePoints: score.points, counterDirection, geometry,
      series: { ...series, type: 'single', index: 1, multiplier: 1 },
      situationBonus: 0, seriesBonus: 0, awardedPoints: score.points,
      difficultyCode: bracket.code, category: score.category, reason: score.reason,
    };
  }
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
