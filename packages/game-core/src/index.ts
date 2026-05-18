export { GAME_CORE_VERSION } from './version.js';
export { createRng, type Rng } from './rng.js';
export { RINK, GOAL, GOAL_OPENING, PUCK_START, type Vec2 } from './rink.js';
export type { GoalieConfig, GoalieState, GoaliePatternId } from './goalie/types.js';
export { GOALIE_SIZE, GOALIE_Y } from './goalie/types.js';
export { simulateGoalie } from './goalie/simulate.js';
export type { GoalState } from './goal/types.js';
export { simulateGoal } from './goal/simulate.js';
export type { ShooterState } from './shooter/types.js';
export { SHOOTER_SIZE, SHOOTER_AMPLITUDE, SHOOTER_FREQUENCY, SHOOTER_CENTER_X } from './shooter/types.js';
export { simulateShooter } from './shooter/simulate.js';
export type { ShotInput, ShotResult, StickEffects } from './shot/types.js';
export { STICK_NEUTRAL, PUCK_SPEED_PER_MS } from './shot/types.js';
export { resolveShot, GOAL_HITBOX_MARGIN, GOALIE_HITBOX_EXPAND } from './shot/resolve.js';
export {
  PERSPECTIVE_COURT_GOALIE_VISUAL_X_SCALE,
  PERSPECTIVE_COURT_GOALIE_VISUAL_Y_OFFSET,
  PERSPECTIVE_COURT_GOAL_VISUAL_OFFSET_X_SCALE,
  PERSPECTIVE_COURT_GOAL_VISUAL_Y_OFFSET,
  PERSPECTIVE_COURT_HITBOX_GOALIE_HEIGHT_SCALE,
  PERSPECTIVE_COURT_HITBOX_GOALIE_INSET,
  PERSPECTIVE_COURT_HITBOX_GOALIE_WIDTH_SCALE,
  PERSPECTIVE_COURT_HITBOX_GOAL_HEIGHT_SCALE,
  PERSPECTIVE_COURT_HITBOX_GOAL_INSET,
  PERSPECTIVE_COURT_HITBOX_GOAL_WIDTH_SCALE,
  PERSPECTIVE_COURT_PUCK_BLADE_OFFSET_X,
  PERSPECTIVE_COURT_PUCK_BLADE_OFFSET_Y,
  PERSPECTIVE_COURT_PUCK_FLIGHT_VISUAL_Y_OFFSET,
  PERSPECTIVE_COURT_VISUAL_Y_OFFSET,
  PERSPECTIVE_COURT_VISUAL_Y_SCALE,
  resolvePerspectiveCourtShot,
} from './court/perspective.js';
export { GOALIES, getGoalie } from './balance/goalies.js';
export { STICKS, getStick, TRAINING_STICK_ID, type Stick, type StickRarity } from './balance/sticks.js';
export { calcShotReward } from './balance/rewards.js';
export {
  DAILY_PERIOD_SPEED_PRESETS,
  getDailyPeriodSpeedPreset,
  type DailyPeriodSpeedPreset,
} from './balance/periods.js';
export type { SessionPhaseOffsets } from './session.js';
export { getSessionPhaseOffsets, deriveShotSeed } from './session.js';
