import type { GoalieConfig } from './types.js';
import { GOALIE_SIZE } from './types.js';
import type { Rng } from '../rng.js';
import type { Vec2 } from '../rink.js';
import { GOAL, RINK } from '../rink.js';

const goalCenterX = GOAL.x + GOAL.width / 2;
const rinkCenterX = RINK.width / 2;
const goalY = GOAL.y + GOAL.height / 2;
const halfOpening = (GOAL.width / 2) * 0.9; // leave post margin (for in-net patterns)
const halfRink = (RINK.width - GOALIE_SIZE.width) / 2 - 4;

function clampGoalFrame(x: number): number {
  const half = GOALIE_SIZE.width / 2;
  return Math.max(GOAL.x + half, Math.min(GOAL.x + GOAL.width - half, x));
}

function clampRink(x: number): number {
  const half = GOALIE_SIZE.width / 2;
  return Math.max(half + 4, Math.min(RINK.width - half - 4, x));
}

/** Linear — board-to-board at constant speed, full rink width. */
export function linearPattern(cfg: GoalieConfig, _rng: Rng, t: number): Vec2 {
  const period = 1000 / Math.max(cfg.frequency, 0.1);
  const phase = (((t % period) + period) % period) / period; // 0..1
  const tri = phase < 0.5 ? phase * 4 - 1 : 3 - phase * 4; // -1..1..-1
  return { x: clampRink(rinkCenterX + halfRink * cfg.amplitude * tri), y: goalY };
}

/** Sine around goal center — stays inside net. */
export function sinePattern(cfg: GoalieConfig, _rng: Rng, t: number): Vec2 {
  const omega = (2 * Math.PI * cfg.frequency) / 1000;
  const x = goalCenterX + halfOpening * cfg.amplitude * Math.sin(omega * t);
  return { x: clampGoalFrame(x), y: goalY };
}

/**
 * Dashes: every 1/frequency seconds goalie teleports to a new point.
 * Between dashes stands still. Expects a fresh rng per call (as created by
 * `simulateGoalie` from `${seed}:${shotIndex}:${cfg.id}`): advancing the rng
 * `step+1` times gives deterministic seed-dependent pick.
 */
export function dashPattern(cfg: GoalieConfig, rng: Rng, t: number): Vec2 {
  const period = 1000 / Math.max(cfg.frequency, 0.1);
  const step = Math.floor(t / period);
  let pick = 0;
  for (let i = 0; i <= step; i++) pick = rng.next();
  const offset = (pick * 2 - 1) * cfg.amplitude; // -amplitude..amplitude
  return { x: clampGoalFrame(goalCenterX + halfOpening * offset), y: goalY };
}
