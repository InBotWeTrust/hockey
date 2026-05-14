import {
  GOALIE_HITBOX_EXPAND,
  GOALIE_Y,
  GOAL_HITBOX_MARGIN,
  GOAL_OPENING,
  PUCK_SPEED_PER_MS,
  PUCK_START,
  simulateGoal,
  simulateGoalie,
  type GoalieConfig,
  type SessionPhaseOffsets,
  type ShotInput,
  type ShotResult,
  type StickEffects,
} from '@hockey/game-core';

export const TRAINING_NEW_COURT_BACKGROUND = '/sprites/test-court-bg.webp';
export const TRAINING_NEW_COURT_BG_CROP_BOTTOM = '7%';
export const TRAINING_NEW_COURT_VISUAL_Y_SCALE = 0.72;
export const TRAINING_NEW_COURT_VISUAL_Y_OFFSET = 205;
export const TRAINING_NEW_COURT_GOAL_VISUAL_Y_OFFSET = 88;
export const TRAINING_NEW_COURT_GOALIE_VISUAL_Y_OFFSET = 62;
export const TRAINING_NEW_COURT_GOAL_VISUAL_OFFSET_X_SCALE = 0.9;
export const TRAINING_NEW_COURT_GOALIE_VISUAL_X_SCALE = 0.9;
export const TRAINING_NEW_COURT_PUCK_BLADE_OFFSET_X = 41;
export const TRAINING_NEW_COURT_PUCK_BLADE_OFFSET_Y = 29;
export const TRAINING_NEW_COURT_PUCK_FLIGHT_VISUAL_Y_OFFSET = -127;
export const TRAINING_NEW_COURT_HITBOX_GOAL_WIDTH_SCALE = 1.28;
export const TRAINING_NEW_COURT_HITBOX_GOAL_HEIGHT_SCALE = 1.35;
export const TRAINING_NEW_COURT_HITBOX_GOAL_INSET = 3;
export const TRAINING_NEW_COURT_HITBOX_GOALIE_WIDTH_SCALE = 1.35;
export const TRAINING_NEW_COURT_HITBOX_GOALIE_HEIGHT_SCALE = 1.28;
export const TRAINING_NEW_COURT_HITBOX_GOALIE_INSET = 2;

export type NewTrainingCourtShotContext = {
  input: ShotInput;
  goalieConfig: GoalieConfig;
  seed: string;
  shotIndex: number;
  stickEffects: StickEffects;
  phaseOffsets: SessionPhaseOffsets;
  shooterX: number;
};

export function resolveNewTrainingCourtShot({
  input,
  goalieConfig,
  seed,
  shotIndex,
  stickEffects,
  phaseOffsets,
  shooterX,
}: NewTrainingCourtShotContext): ShotResult {
  const speed = input.puckSpeedPerMs ?? PUCK_SPEED_PER_MS;
  const effectiveCfg = {
    ...goalieConfig,
    frequency: input.goalieFrequency ?? goalieConfig.frequency,
    goalFrequency: input.goalFrequency ?? goalieConfig.goalFrequency,
  };
  const tGoalieCross = input.tapTime + (PUCK_START.y - GOALIE_Y) / speed;
  const goalieState = simulateGoalie(
    effectiveCfg,
    seed,
    shotIndex,
    tGoalieCross,
    phaseOffsets.goalie,
  );
  const shrink = 1 / Math.max(stickEffects.shotZoneMultiplier, 1);
  const visualGoalieX =
    286 + (goalieState.position.x - 286) * TRAINING_NEW_COURT_GOALIE_VISUAL_X_SCALE;
  const goalieWidth = Math.max(
    0,
    (goalieState.width * shrink + GOALIE_HITBOX_EXPAND) *
      TRAINING_NEW_COURT_HITBOX_GOALIE_WIDTH_SCALE -
      TRAINING_NEW_COURT_HITBOX_GOALIE_INSET * 2,
  );
  if (shooterX >= visualGoalieX - goalieWidth / 2 && shooterX <= visualGoalieX + goalieWidth / 2) {
    return { type: 'save', goalieContact: { x: shooterX, y: GOALIE_Y } };
  }

  const tGoalCross = input.tapTime + (PUCK_START.y - GOAL_OPENING.y) / speed;
  const goalOffsetAtCross =
    simulateGoal(effectiveCfg, tGoalCross, phaseOffsets.goal).offsetX *
    TRAINING_NEW_COURT_GOAL_VISUAL_OFFSET_X_SCALE;
  const openingCenterX = (GOAL_OPENING.xMin + GOAL_OPENING.xMax) / 2 + goalOffsetAtCross;
  const openingWidth = Math.max(
    0,
    (GOAL_OPENING.xMax - GOAL_HITBOX_MARGIN - (GOAL_OPENING.xMin + GOAL_HITBOX_MARGIN)) *
      TRAINING_NEW_COURT_HITBOX_GOAL_WIDTH_SCALE -
      TRAINING_NEW_COURT_HITBOX_GOAL_INSET * 2,
  );

  if (
    shooterX < openingCenterX - openingWidth / 2 ||
    shooterX > openingCenterX + openingWidth / 2
  ) {
    return { type: 'miss', reason: 'wide' };
  }

  return { type: 'goal', hitPoint: { x: shooterX, y: GOAL_OPENING.y } };
}
