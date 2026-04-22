import type { GoalieConfig } from '../goalie/types.js';
import { GOALIE_Y } from '../goalie/types.js';
import { PUCK_START, GOAL_OPENING } from '../rink.js';
import { simulateGoal } from '../goal/simulate.js';
import { simulateGoalie } from '../goalie/simulate.js';
import { simulateShooter } from '../shooter/simulate.js';
import { PUCK_SPEED_PER_MS, type ShotInput, type ShotResult, type StickEffects } from './types.js';

export function resolveShot(
  input: ShotInput,
  cfg: GoalieConfig,
  seed: string,
  shotIndex: number,
  stick: StickEffects,
): ShotResult {
  const shooterX = simulateShooter(input.tapTime).x;

  const tGoalCross =
    input.tapTime + (PUCK_START.y - GOAL_OPENING.y) / PUCK_SPEED_PER_MS;
  const goalOffsetAtGoal = simulateGoal(cfg, tGoalCross).offsetX;
  const openingXMin = GOAL_OPENING.xMin + goalOffsetAtGoal;
  const openingXMax = GOAL_OPENING.xMax + goalOffsetAtGoal;
  if (shooterX < openingXMin || shooterX > openingXMax) {
    return { type: 'miss', reason: 'wide' };
  }

  const tGoalieCross =
    input.tapTime + (PUCK_START.y - GOALIE_Y) / PUCK_SPEED_PER_MS;
  const goalieState = simulateGoalie(cfg, seed, shotIndex, tGoalieCross);
  const goalOffsetAtGoalie = simulateGoal(cfg, tGoalieCross).offsetX;

  const shrink = 1 / Math.max(stick.shotZoneMultiplier, 1);
  const effWidth = goalieState.width * shrink;
  const goalieXMin = goalieState.position.x + goalOffsetAtGoalie - effWidth / 2;
  const goalieXMax = goalieXMin + effWidth;

  if (shooterX >= goalieXMin && shooterX <= goalieXMax) {
    return {
      type: 'save',
      goalieContact: { x: shooterX, y: GOALIE_Y },
    };
  }

  return {
    type: 'goal',
    hitPoint: { x: shooterX, y: GOAL_OPENING.y },
  };
}
