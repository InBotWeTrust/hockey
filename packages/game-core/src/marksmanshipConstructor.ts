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
import { GOAL_OPENING, PUCK_START } from './rink.js';
import { simulateShooter } from './shooter/simulate.js';
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
