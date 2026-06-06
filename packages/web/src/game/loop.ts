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
  type DuelPlayerCondition,
} from '@hockey/game-core';
import type { Scale } from './coords.js';
import type { Goal } from './renderer/Goal.js';
import type { Goalie } from './renderer/Goalie.js';
import type { Hitboxes } from './renderer/Hitboxes.js';
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
  hitboxRenderer?: Hitboxes;
  getScale: () => Scale;
  getSeed: () => string;
  getShotIndex: () => number;
  getGoalieId: () => string | null;
  getSpeedOverrides?: () => SpeedOverrides;
  getInitialElapsedMs?: () => number;
  getDuelCondition?: (elapsedMs: number, speeds: SpeedOverrides) => DuelPlayerCondition | null;
}

export interface GameLoop {
  attach: (ticker: Ticker) => void;
  detach: () => void;
  // Resets accumulated simulation time so the scene picks up from the active
  // session's base elapsed time. For daily periods this is usually t=0; for
  // persisted training sessions it is derived from the server's started_at.
  resetTime: (elapsedMs?: number) => void;
  sessionStartMs: number;
  getShooterX: (tMs: number, shooterFreq?: number) => number;
  // Шутер и сцена паузятся независимо. Каждая пауза вычитает своё real-time
  // из эффективного t (= since sessionStart минус суммарная пауза). Когда
  // пауза заканчивается, t продолжается с того же значения, поэтому
  // треугольные волны / синусоиды возобновляются с той же точки в ту же
  // сторону, в которую двигались до остановки.
  beginShooterPause: () => void;
  endShooterPause: () => void;
  beginScenePause: () => void;
  endScenePause: () => void;
  getShooterT: () => number;
  getSceneT: () => number;
  getRenderNow: () => number;
}

function shooterX(t: number, freq: number): number {
  const period = 1000 / freq;
  const phase = (((t % period) + period) % period) / period;
  const tri = phase < 0.5 ? phase * 4 - 1 : 3 - phase * 4;
  return SHOOTER_CENTER_X + SHOOTER_AMPLITUDE * tri;
}

export function createGameLoop(opts: GameLoopOpts): GameLoop {
  const initialElapsedMs = (): number => Math.max(0, opts.getInitialElapsedMs?.() ?? 0);
  let renderNowMs = performance.now();
  let sessionStartMs = renderNowMs - initialElapsedMs();
  let offsets: SessionPhaseOffsets | null = null;
  let offsetSeed: string | null = null;

  let shooterPausedTotal = 0;
  let shooterPauseStartedAt: number | null = null;
  let stumblePausedTotal = 0;
  let stumblePauseStartedAt: number | null = null;
  let scenePausedTotal = 0;
  let scenePauseStartedAt: number | null = null;

  function shooterT(now: number): number {
    const activeManual = shooterPauseStartedAt !== null ? now - shooterPauseStartedAt : 0;
    const activeStumble = stumblePauseStartedAt !== null ? now - stumblePauseStartedAt : 0;
    return (
      now - sessionStartMs - shooterPausedTotal - stumblePausedTotal - activeManual - activeStumble
    );
  }

  function sceneT(now: number): number {
    const active = scenePauseStartedAt !== null ? now - scenePauseStartedAt : 0;
    return now - sessionStartMs - scenePausedTotal - active;
  }

  function getOffsets(): SessionPhaseOffsets {
    const seed = opts.getSeed();
    if (seed !== offsetSeed) {
      offsetSeed = seed;
      offsets = getSessionPhaseOffsets(seed);
    }
    return offsets!;
  }

  function advanceRenderClock(): number {
    const now = performance.now();
    renderNowMs = now;
    return renderNowMs;
  }

  const onTick = (): void => {
    const id = opts.getGoalieId();
    if (!id) return;
    const cfg = getGoalie(id);
    const now = advanceRenderClock();
    const overrides = opts.getSpeedOverrides?.();
    const activeCfg = overrides
      ? { ...cfg, goalFrequency: overrides.goalFreq, frequency: overrides.goalieFreq }
      : cfg;
    const sf = overrides?.shooterFreq ?? 0.45;
    const o = getOffsets();
    const tScene = sceneT(now);
    const condition = overrides ? opts.getDuelCondition?.(tScene, overrides) : null;
    if (condition?.stumbleActive) {
      if (stumblePauseStartedAt === null) stumblePauseStartedAt = now;
    } else if (stumblePauseStartedAt !== null) {
      stumblePausedTotal += now - stumblePauseStartedAt;
      stumblePauseStartedAt = null;
    }
    const tShooter = shooterT(now);
    const effectiveShooterFreq = Math.max(0.1, sf * (condition?.shooterSpeedMultiplier ?? 1));
    const goalState: GoalState = simulateGoal(activeCfg, tScene, o.goal);
    const goalieState: GoalieState = simulateGoalie(
      activeCfg,
      opts.getSeed(),
      opts.getShotIndex(),
      tScene,
      o.goalie,
    );
    const sx =
      shooterX(tShooter + o.shooter, effectiveShooterFreq) + (condition?.shooterXOffsetPx ?? 0);
    const scale = opts.getScale();

    opts.goalRenderer.update(scale, goalState.offsetX);
    opts.goalieRenderer.update(goalieState, scale);
    opts.playerRenderer.update(scale, sx);
    opts.hitboxRenderer?.update(scale, goalState.offsetX, goalieState);

    if (opts.puckRenderer.isHeld()) {
      opts.puckRenderer.update(now, scale);
    } else if (!opts.puckRenderer.isFlying()) {
      opts.puckRenderer.resetAtStart(scale, sx);
    } else {
      opts.puckRenderer.update(now, scale);
    }
  };

  let attachedTo: Ticker | null = null;
  let isAttached = false;

  const detachFromTicker = (): void => {
    const ticker = attachedTo;
    attachedTo = null;
    if (!ticker || !isAttached) {
      isAttached = false;
      return;
    }
    isAttached = false;
    try {
      ticker.remove(onTick);
    } catch {
      // Pixi may already have dropped the listener during React/HMR cleanup.
    }
  };

  return {
    attach(ticker) {
      if (isAttached && attachedTo === ticker) return;
      detachFromTicker();
      ticker.add(onTick);
      attachedTo = ticker;
      isAttached = true;
    },
    detach() {
      detachFromTicker();
    },
    resetTime(elapsedMs = initialElapsedMs()) {
      renderNowMs = performance.now();
      sessionStartMs = renderNowMs - Math.max(0, elapsedMs);
      shooterPausedTotal = 0;
      stumblePausedTotal = 0;
      scenePausedTotal = 0;
      shooterPauseStartedAt = null;
      stumblePauseStartedAt = null;
      scenePauseStartedAt = null;
    },
    get sessionStartMs() {
      return sessionStartMs;
    },
    getShooterX(tMs, freq = 0.45) {
      return shooterX(tMs, freq);
    },
    beginShooterPause() {
      if (shooterPauseStartedAt === null) shooterPauseStartedAt = renderNowMs;
    },
    endShooterPause() {
      if (shooterPauseStartedAt !== null) {
        shooterPausedTotal += renderNowMs - shooterPauseStartedAt;
        shooterPauseStartedAt = null;
      }
    },
    beginScenePause() {
      if (scenePauseStartedAt === null) scenePauseStartedAt = renderNowMs;
    },
    endScenePause() {
      if (scenePauseStartedAt !== null) {
        scenePausedTotal += renderNowMs - scenePauseStartedAt;
        scenePauseStartedAt = null;
      }
    },
    getShooterT() {
      return shooterT(renderNowMs);
    },
    getSceneT() {
      return sceneT(renderNowMs);
    },
    getRenderNow() {
      return renderNowMs;
    },
  };
}
