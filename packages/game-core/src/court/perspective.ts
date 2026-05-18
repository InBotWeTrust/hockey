import { simulateGoal } from '../goal/simulate.js';
import { simulateGoalie } from '../goalie/simulate.js';
import type { GoalieConfig } from '../goalie/types.js';
import { GOALIE_Y } from '../goalie/types.js';
import { GOAL_OPENING, PUCK_START } from '../rink.js';
import type { SessionPhaseOffsets } from '../session.js';
import { simulateShooter } from '../shooter/simulate.js';
import { GOAL_HITBOX_MARGIN, GOALIE_HITBOX_EXPAND } from '../shot/resolve.js';
import { PUCK_SPEED_PER_MS, type ShotInput, type ShotResult, type StickEffects } from '../shot/types.js';

export const PERSPECTIVE_COURT_VISUAL_Y_SCALE = 0.72;
export const PERSPECTIVE_COURT_VISUAL_Y_OFFSET = 205;
export const PERSPECTIVE_COURT_GOAL_VISUAL_Y_OFFSET = 88;
export const PERSPECTIVE_COURT_GOALIE_VISUAL_Y_OFFSET = 62;
export const PERSPECTIVE_COURT_GOAL_VISUAL_OFFSET_X_SCALE = 0.9;
export const PERSPECTIVE_COURT_GOALIE_VISUAL_X_SCALE = 0.9;
export const PERSPECTIVE_COURT_VISUAL_X_CENTER = 286;
export const PERSPECTIVE_COURT_PUCK_BLADE_OFFSET_X = 41;
export const PERSPECTIVE_COURT_PUCK_BLADE_OFFSET_Y = 29;
export const PERSPECTIVE_COURT_PUCK_FLIGHT_VISUAL_Y_OFFSET = -127;
export const PERSPECTIVE_COURT_HITBOX_GOAL_WIDTH_SCALE = 1.152;
export const PERSPECTIVE_COURT_HITBOX_GOAL_HEIGHT_SCALE = 1.215;
export const PERSPECTIVE_COURT_HITBOX_GOAL_INSET = 3;
export const PERSPECTIVE_COURT_HITBOX_GOALIE_WIDTH_SCALE = 1.215;
export const PERSPECTIVE_COURT_HITBOX_GOALIE_HEIGHT_SCALE = 1.152;
export const PERSPECTIVE_COURT_HITBOX_GOALIE_INSET = 2;

export function resolvePerspectiveCourtShot(
  input: ShotInput,
  cfg: GoalieConfig,
  seed: string,
  shotIndex: number,
  stick: StickEffects,
  phaseOffsets?: SessionPhaseOffsets,
): ShotResult {
  const speed = input.puckSpeedPerMs ?? PUCK_SPEED_PER_MS;
  const shooterTime = input.shooterTapTime ?? input.tapTime;
  const shooterX = simulateShooter(
    shooterTime + (phaseOffsets?.shooter ?? 0),
    input.shooterFrequency,
  ).x;
  const effectiveCfg = {
    ...cfg,
    frequency: input.goalieFrequency ?? cfg.frequency,
    goalFrequency: input.goalFrequency ?? cfg.goalFrequency,
  };

  const tGoalieCross = input.tapTime + (PUCK_START.y - GOALIE_Y) / speed;
  const goalieState = simulateGoalie(
    effectiveCfg,
    seed,
    shotIndex,
    tGoalieCross,
    phaseOffsets?.goalie ?? 0,
  );
  const shrink = 1 / Math.max(stick.shotZoneMultiplier, 1);
  const visualGoalieX =
    PERSPECTIVE_COURT_VISUAL_X_CENTER +
    (goalieState.position.x - PERSPECTIVE_COURT_VISUAL_X_CENTER) *
      PERSPECTIVE_COURT_GOALIE_VISUAL_X_SCALE;
  const goalieWidth = Math.max(
    0,
    (goalieState.width * shrink + GOALIE_HITBOX_EXPAND) *
      PERSPECTIVE_COURT_HITBOX_GOALIE_WIDTH_SCALE -
      PERSPECTIVE_COURT_HITBOX_GOALIE_INSET * 2,
  );

  if (shooterX >= visualGoalieX - goalieWidth / 2 && shooterX <= visualGoalieX + goalieWidth / 2) {
    return { type: 'save', goalieContact: { x: shooterX, y: GOALIE_Y } };
  }

  const tGoalCross = input.tapTime + (PUCK_START.y - GOAL_OPENING.y) / speed;
  const goalOffsetAtCross =
    simulateGoal(effectiveCfg, tGoalCross, phaseOffsets?.goal ?? 0).offsetX *
    PERSPECTIVE_COURT_GOAL_VISUAL_OFFSET_X_SCALE;
  const openingCenterX = (GOAL_OPENING.xMin + GOAL_OPENING.xMax) / 2 + goalOffsetAtCross;
  const openingWidth = Math.max(
    0,
    (GOAL_OPENING.xMax - GOAL_HITBOX_MARGIN - (GOAL_OPENING.xMin + GOAL_HITBOX_MARGIN)) *
      PERSPECTIVE_COURT_HITBOX_GOAL_WIDTH_SCALE -
      PERSPECTIVE_COURT_HITBOX_GOAL_INSET * 2,
  );

  if (
    shooterX < openingCenterX - openingWidth / 2 ||
    shooterX > openingCenterX + openingWidth / 2
  ) {
    return { type: 'miss', reason: 'wide' };
  }

  return { type: 'goal', hitPoint: { x: shooterX, y: GOAL_OPENING.y } };
}
