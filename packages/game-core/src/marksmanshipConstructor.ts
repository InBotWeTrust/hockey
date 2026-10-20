import {
  getPerspectiveCourtGoalieHitbox,
  getPerspectiveCourtGoalOpening,
} from './court/perspective.js';
import { GOALIE_Y } from './goalie/types.js';
import {
  classifyMarksmanshipShot,
  type MarksmanshipShotClassification,
  type MarksmanshipShotInput,
} from './marksmanship.js';
import { GOAL_OPENING, PUCK_START, RINK } from './rink.js';
import { simulateShooter } from './shooter/simulate.js';
import { SHOOTER_MAX_X, SHOOTER_MIN_X } from './shooter/types.js';
import { PUCK_SPEED_PER_MS, STICK_NEUTRAL } from './shot/types.js';

export interface ConstructorHitbox {
  minX: number;
  maxX: number;
}

export interface MarksmanshipReplaySnapshot {
  classification: MarksmanshipShotClassification;
  tap: { timeMs: number; playerX: number };
  goalieCross: { timeMs: number; goalieHitbox: ConstructorHitbox };
  goalCross: { timeMs: number; goalHitbox: ConstructorHitbox };
}

export function buildMarksmanshipReplaySnapshot(
  input: MarksmanshipShotInput,
): MarksmanshipReplaySnapshot {
  const speed = input.shotInput.puckSpeedPerMs ?? PUCK_SPEED_PER_MS;
  const shooterTime = input.shotInput.shooterTapTime ?? input.shotInput.tapTime;
  const playerX = simulateShooter(
    shooterTime + input.phaseOffsets.shooter,
    input.shotInput.shooterFrequency,
  ).x;
  const goalieHitbox = getPerspectiveCourtGoalieHitbox(
    input.shotInput,
    input.goalie,
    input.seed,
    input.shotIndex,
    STICK_NEUTRAL,
    input.phaseOffsets,
  );
  const goalHitbox = getPerspectiveCourtGoalOpening(
    input.shotInput,
    input.goalie,
    input.phaseOffsets,
  );

  return {
    classification: classifyMarksmanshipShot(input),
    tap: { timeMs: input.shotInput.tapTime, playerX },
    goalieCross: {
      timeMs: input.shotInput.tapTime + (PUCK_START.y - GOALIE_Y) / speed,
      goalieHitbox: { minX: goalieHitbox.xMin, maxX: goalieHitbox.xMax },
    },
    goalCross: {
      timeMs: input.shotInput.tapTime + (PUCK_START.y - GOAL_OPENING.y) / speed,
      goalHitbox: { minX: goalHitbox.xMin, maxX: goalHitbox.xMax },
    },
  };
}

export interface ManualMarksmanshipInput {
  playerX: number;
  goalCenterX: number;
  goalieCenterX: number;
  goalWidth: number;
  goalieWidth: number;
}

export interface ManualProjection {
  playerX: number;
  goalCenterX: number;
  goalieCenterX: number;
  goalHitbox: ConstructorHitbox;
  goalieHitbox: ConstructorHitbox;
  result: 'goal' | 'save' | 'miss';
  category: null;
  points: null;
  reason: 'manual_static_only';
}

export function projectManualMarksmanship(input: ManualMarksmanshipInput): ManualProjection {
  const values = [input.playerX, input.goalCenterX, input.goalieCenterX, input.goalWidth, input.goalieWidth];
  if (values.some((value) => !Number.isFinite(value)) ||
    input.goalWidth <= 0 || input.goalieWidth <= 0 ||
    input.goalWidth > RINK.width || input.goalieWidth > RINK.width) {
    throw new RangeError('Invalid manual marksmanship coordinates or hitbox widths');
  }
  const clamp = (value: number, min: number, max: number): number =>
    Math.min(max, Math.max(min, value));
  const playerX = clamp(input.playerX, SHOOTER_MIN_X, SHOOTER_MAX_X);
  const goalCenterX = clamp(input.goalCenterX, input.goalWidth / 2,
    RINK.width - input.goalWidth / 2);
  const goalieCenterX = clamp(input.goalieCenterX, input.goalieWidth / 2,
    RINK.width - input.goalieWidth / 2);
  const goalHitbox = { minX: goalCenterX - input.goalWidth / 2,
    maxX: goalCenterX + input.goalWidth / 2 };
  const goalieHitbox = { minX: goalieCenterX - input.goalieWidth / 2,
    maxX: goalieCenterX + input.goalieWidth / 2 };
  const result = playerX >= goalieHitbox.minX && playerX <= goalieHitbox.maxX ? 'save'
    : playerX >= goalHitbox.minX && playerX <= goalHitbox.maxX ? 'goal' : 'miss';
  return { playerX, goalCenterX, goalieCenterX, goalHitbox, goalieHitbox,
    result, category: null, points: null, reason: 'manual_static_only' };
}
