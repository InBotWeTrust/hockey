import type { GoalieConfig } from '../goalie/types.js';
import { GOALIE_Y } from '../goalie/types.js';
import { PUCK_START, GOAL_OPENING } from '../rink.js';
import { simulateGoal } from '../goal/simulate.js';
import { simulateGoalie } from '../goalie/simulate.js';
import { simulateShooter } from '../shooter/simulate.js';
import { PUCK_SPEED_PER_MS, type ShotInput, type ShotResult, type StickEffects } from './types.js';
import type { SessionPhaseOffsets } from '../session.js';

export function resolveShot(
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

  // Puck travels bottom-up, so it meets the goalie before the goal line.
  // Hitting the goalie is always a save — even if the puck's X would have
  // missed the net entirely. Only after the goalie is cleared do we decide
  // goal vs wide-miss.
  const tGoalieCross =
    input.tapTime + (PUCK_START.y - GOALIE_Y) / speed;
  const goalieState = simulateGoalie(cfg, seed, shotIndex, tGoalieCross, phaseOffsets?.goalie ?? 0);

  const shrink = 1 / Math.max(stick.shotZoneMultiplier, 1);
  const effWidth = goalieState.width * shrink;
  const goalieXMin = goalieState.position.x - effWidth / 2;
  const goalieXMax = goalieXMin + effWidth;

  if (shooterX >= goalieXMin && shooterX <= goalieXMax) {
    return {
      type: 'save',
      goalieContact: { x: shooterX, y: GOALIE_Y },
    };
  }

  const tGoalCross =
    input.tapTime + (PUCK_START.y - GOAL_OPENING.y) / speed;
  const goalOffsetAtGoal = simulateGoal(cfg, tGoalCross, phaseOffsets?.goal ?? 0).offsetX;
  const openingXMin = GOAL_OPENING.xMin + goalOffsetAtGoal;
  const openingXMax = GOAL_OPENING.xMax + goalOffsetAtGoal;
  if (shooterX < openingXMin || shooterX > openingXMax) {
    return { type: 'miss', reason: 'wide' };
  }

  return {
    type: 'goal',
    hitPoint: { x: shooterX, y: GOAL_OPENING.y },
  };
}
