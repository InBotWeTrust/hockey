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
  brackets: readonly MarksmanshipScoreBracket[];
}

export const DEFAULT_MARKSMANSHIP_SCORING_RULES = {
  scanStepMs: 10,
  counterDirectionBonus: 15,
  counterDirectionGoalDistance: 24,
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
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'scanStepMs',
      'counterDirectionBonus',
      'counterDirectionGoalDistance',
      'brackets',
    ]) ||
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
    value.brackets.length !== MARKSMANSHIP_DIFFICULTY_CODES.size
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
}

export interface MarksmanshipShotClassification {
  result: ShotResult;
  windowDurationMs: number | null;
  basePoints: number;
  counterDirection: boolean;
  awardedPoints: number;
  difficultyCode: MarksmanshipDifficultyCode | null;
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

function counterDirectionForGoal(
  input: MarksmanshipShotInput,
  result: Extract<ShotResult, { type: 'goal' }>,
): boolean {
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

  return isStrictCounterDirection({
    puckX: result.hitPoint.x,
    goalieCenterX: visualX(atCross.position.x),
    goalieHalfWidth: goalieWidth / 2,
    goalieDirection: Math.sign(visualX(after.position.x) - visualX(before.position.x)),
    goalXMin: goalCenter - goalWidth / 2,
    goalXMax: goalCenter + goalWidth / 2,
    maxGoalDistance: input.scoring.counterDirectionGoalDistance,
  });
}

export function classifyMarksmanshipShot(
  input: MarksmanshipShotInput,
): MarksmanshipShotClassification {
  const result = resolvePerspectiveCourtShot(
    input.shotInput,
    input.goalie,
    input.seed,
    input.shotIndex,
    STICK_NEUTRAL,
    input.phaseOffsets,
  );
  if (result.type !== 'goal') {
    return {
      result,
      windowDurationMs: null,
      basePoints: 0,
      counterDirection: false,
      awardedPoints: 0,
      difficultyCode: null,
    };
  }

  const windowDurationMs = goalWindowDuration(input);
  const bracket = bracketForWindow(windowDurationMs, input.scoring);
  const counterDirection = counterDirectionForGoal(input, result);
  return {
    result,
    windowDurationMs,
    basePoints: bracket.points,
    counterDirection,
    awardedPoints: bracket.points + (counterDirection ? input.scoring.counterDirectionBonus : 0),
    difficultyCode: bracket.code,
  };
}
