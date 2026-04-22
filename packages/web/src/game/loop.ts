import type { Ticker } from 'pixi.js';
import {
  simulateGoalie,
  simulateGoal,
  getGoalie,
  getSessionPhaseOffsets,
  type GoalieState,
  type GoalState,
  type SessionPhaseOffsets,
  SHOOTER_CENTER_X,
  SHOOTER_AMPLITUDE,
} from '@hockey/game-core';
import type { Scale } from './coords.js';
import type { Goal } from './renderer/Goal.js';
import type { Goalie } from './renderer/Goalie.js';
import type { Player } from './renderer/Player.js';
import type { Puck } from './renderer/Puck.js';

export interface SpeedOverrides {
  goalFreq: number;
  goalieFreq: number;
  shooterFreq: number;
  puckSpeed: number;
}

export interface GameLoopOpts {
  goalRenderer: Goal;
  goalieRenderer: Goalie;
  playerRenderer: Player;
  puckRenderer: Puck;
  getScale: () => Scale;
  getSeed: () => string;
  getShotIndex: () => number;
  getGoalieId: () => string | null;
  getSpeedOverrides?: () => SpeedOverrides;
}

export interface GameLoop {
  attach: (ticker: Ticker) => void;
  detach: () => void;
  sessionStartMs: number;
  getShooterX: (tMs: number, shooterFreq?: number) => number;
}

function shooterX(t: number, freq: number): number {
  const period = 1000 / freq;
  const phase = ((t % period) + period) % period / period;
  const tri = phase < 0.5 ? phase * 4 - 1 : 3 - phase * 4;
  return SHOOTER_CENTER_X + SHOOTER_AMPLITUDE * tri;
}

export function createGameLoop(opts: GameLoopOpts): GameLoop {
  const sessionStartMs = performance.now();
  let offsets: SessionPhaseOffsets | null = null;
  let offsetSeed: string | null = null;

  function getOffsets(): SessionPhaseOffsets {
    const seed = opts.getSeed();
    if (seed !== offsetSeed) {
      offsetSeed = seed;
      offsets = getSessionPhaseOffsets(seed);
    }
    return offsets!;
  }

  const onTick = (): void => {
    const id = opts.getGoalieId();
    if (!id) return;
    const cfg = getGoalie(id);
    const now = performance.now();
    const t = now - sessionStartMs;
    const overrides = opts.getSpeedOverrides?.();
    const activeCfg = overrides
      ? { ...cfg, goalFrequency: overrides.goalFreq, frequency: overrides.goalieFreq }
      : cfg;
    const sf = overrides?.shooterFreq ?? 0.45;
    const o = getOffsets();
    const goalState: GoalState = simulateGoal(activeCfg, t, o.goal);
    const goalieState: GoalieState = simulateGoalie(
      activeCfg,
      opts.getSeed(),
      opts.getShotIndex(),
      t,
      o.goalie,
    );
    const sx = shooterX(t + o.shooter, sf);
    const scale = opts.getScale();
    opts.goalRenderer.update(scale, goalState.offsetX);
    opts.goalieRenderer.update(goalieState, scale);
    opts.playerRenderer.update(scale, sx);
    if (!opts.puckRenderer.isFlying()) {
      opts.puckRenderer.resetAtStart(scale, sx);
    } else {
      opts.puckRenderer.update(now, scale);
    }
  };

  let attachedTo: Ticker | null = null;
  return {
    attach(ticker) {
      attachedTo = ticker;
      ticker.add(onTick);
    },
    detach() {
      attachedTo?.remove(onTick);
      attachedTo = null;
    },
    sessionStartMs,
    getShooterX(tMs, freq = 0.45) {
      return shooterX(tMs, freq);
    },
  };
}
