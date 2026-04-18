import type { Ticker } from 'pixi.js';
import { simulateGoalie, getGoalie, type GoalieState } from '@hockey/game-core';
import type { Scale } from './coords.js';
import type { Goalie } from './renderer/Goalie.js';
import type { Puck } from './renderer/Puck.js';

export interface GameLoopOpts {
  goalieRenderer: Goalie;
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
}

export function createGameLoop(opts: GameLoopOpts): GameLoop {
  const sessionStartMs = performance.now();
  const onTick = (): void => {
    const id = opts.getGoalieId();
    if (!id) return;
    const cfg = getGoalie(id);
    const now = performance.now();
    const state: GoalieState = simulateGoalie(
      cfg,
      opts.getSeed(),
      opts.getShotIndex(),
      now - sessionStartMs,
    );
    const scale = opts.getScale();
    opts.goalieRenderer.update(state, scale);
    opts.puckRenderer.update(now, scale);
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
  };
}
