import type { Ticker } from 'pixi.js';
import {
  simulateGoalie,
  simulateGoal,
  simulateShooter,
  getGoalie,
  type GoalieState,
  type GoalState,
  type ShooterState,
} from '@hockey/game-core';
import type { Scale } from './coords.js';
import type { Goal } from './renderer/Goal.js';
import type { Goalie } from './renderer/Goalie.js';
import type { Player } from './renderer/Player.js';
import type { Puck } from './renderer/Puck.js';

export interface GameLoopOpts {
  goalRenderer: Goal;
  goalieRenderer: Goalie;
  playerRenderer: Player;
  puckRenderer: Puck;
  getScale: () => Scale;
  getSeed: () => string;
  getShotIndex: () => number;
  getGoalieId: () => string | null;
}

export interface GameLoop {
  attach: (ticker: Ticker) => void;
  detach: () => void;
  sessionStartMs: number;
  getShooterX: (tMs: number) => number;
}

export function createGameLoop(opts: GameLoopOpts): GameLoop {
  const sessionStartMs = performance.now();
  const onTick = (): void => {
    const id = opts.getGoalieId();
    if (!id) return;
    const cfg = getGoalie(id);
    const now = performance.now();
    const t = now - sessionStartMs;
    const goalState: GoalState = simulateGoal(cfg, t);
    const goalieState: GoalieState = simulateGoalie(
      cfg,
      opts.getSeed(),
      opts.getShotIndex(),
      t,
    );
    const shooterState: ShooterState = simulateShooter(t);
    const scale = opts.getScale();
    opts.goalRenderer.update(scale, goalState.offsetX);
    opts.goalieRenderer.update(goalieState, scale, goalState.offsetX);
    opts.playerRenderer.update(scale, shooterState.x);
    if (!opts.puckRenderer.isFlying()) {
      opts.puckRenderer.resetAtStart(scale, shooterState.x);
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
    getShooterX(tMs) {
      return simulateShooter(tMs).x;
    },
  };
}
