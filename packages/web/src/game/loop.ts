import type { Ticker } from 'pixi.js';
import {
  simulateGoalie,
  simulateGoal,
  getGoalie,
  getSessionPhaseOffsets,
  type GoalieState,
  type GoalieConfig,
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

const MIN_STUMBLE_PAUSE_MS = 650;

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
  getGoalieConfig?: () => GoalieConfig | null;
  getSpeedOverrides?: () => SpeedOverrides;
  getInitialElapsedMs?: () => number;
  getDuelCondition?: (elapsedMs: number, speeds: SpeedOverrides) => DuelPlayerCondition | null;
  onDuelConditionChange?: (condition: DuelPlayerCondition | null) => void;
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

function shooterDirection(t: number, freq: number): 1 | -1 {
  const period = 1000 / freq;
  const phase = (((t % period) + period) % period) / period;
  return phase < 0.5 ? 1 : -1;
}

function shooterTimeForXNear(x: number, freq: number, direction: 1 | -1, nearT: number): number {
  const period = 1000 / freq;
  const normalized = Math.max(-1, Math.min(1, (x - SHOOTER_CENTER_X) / SHOOTER_AMPLITUDE));
  const phase = direction === 1 ? (normalized + 1) / 4 : (3 - normalized) / 4;
  const base = phase * period;
  const cycle = Math.round((nearT - base) / period);
  return base + cycle * period;
}

export function createGameLoop(opts: GameLoopOpts): GameLoop {
  const initialElapsedMs = (): number => Math.max(0, opts.getInitialElapsedMs?.() ?? 0);
  let renderNowMs = performance.now();
  let sessionStartMs = renderNowMs - initialElapsedMs();
  let offsets: SessionPhaseOffsets | null = null;
  let offsetSeed: string | null = null;

  let shooterPausedTotal = 0;
  let shooterPauseStartedAt: number | null = null;
  let conditionPausedTotal = 0;
  let conditionPauseStartedAt: number | null = null;
  let scenePausedTotal = 0;
  let scenePauseStartedAt: number | null = null;
  let shooterTimeShift = 0;
  let lastShooterFreq: number | null = null;
  let lastShooterDirection: 1 | -1 = 1;
  let lastRenderedShooterX: number | null = null;
  let frozenConditionShooterX: number | null = null;
  let heldStumbleCondition: DuelPlayerCondition | null = null;
  let heldStumbleUntilMs = 0;

  function shooterT(now: number): number {
    const activeManual = shooterPauseStartedAt !== null ? now - shooterPauseStartedAt : 0;
    const activeCondition = conditionPauseStartedAt !== null ? now - conditionPauseStartedAt : 0;
    return (
      now -
      sessionStartMs -
      shooterPausedTotal -
      conditionPausedTotal -
      activeManual -
      activeCondition
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
    const custom = opts.getGoalieConfig?.() ?? null;
    const id = opts.getGoalieId();
    const cfg = custom ?? (id ? getGoalie(id) : null);
    if (!cfg) return;
    const now = advanceRenderClock();
    const overrides = opts.getSpeedOverrides?.();
    const activeCfg = overrides
      ? { ...cfg, goalFrequency: overrides.goalFreq, frequency: overrides.goalieFreq }
      : cfg;
    const sf = overrides?.shooterFreq ?? 0.45;
    const o = getOffsets();
    const tScene = sceneT(now);
    const rawCondition = overrides ? opts.getDuelCondition?.(tScene, overrides) : null;
    if (rawCondition?.stumbleActive === true) {
      heldStumbleCondition = rawCondition;
      heldStumbleUntilMs = Math.max(heldStumbleUntilMs, now + MIN_STUMBLE_PAUSE_MS);
    } else if (heldStumbleCondition !== null && now >= heldStumbleUntilMs) {
      heldStumbleCondition = null;
      heldStumbleUntilMs = 0;
    }
    const condition =
      rawCondition?.status === 'exhausted_stop'
        ? rawCondition
        : (heldStumbleCondition ?? rawCondition);
    opts.onDuelConditionChange?.(condition ?? null);
    const conditionPausesShooter =
      condition?.stumbleActive === true || condition?.status === 'exhausted_stop';
    let justEndedConditionPause = false;
    let conditionPauseReleaseX: number | null = null;
    if (conditionPausesShooter) {
      if (conditionPauseStartedAt === null) {
        conditionPauseStartedAt = now;
        const baseFreezeT = shooterT(now) + o.shooter + shooterTimeShift;
        frozenConditionShooterX =
          lastRenderedShooterX ??
          shooterX(baseFreezeT, Math.max(0.1, sf)) + (condition?.shooterXOffsetPx ?? 0);
      }
    } else if (conditionPauseStartedAt !== null) {
      conditionPausedTotal += now - conditionPauseStartedAt;
      conditionPauseStartedAt = null;
      justEndedConditionPause = true;
      conditionPauseReleaseX = frozenConditionShooterX;
    }
    const tShooter = shooterT(now);
    const effectiveShooterFreq = conditionPausesShooter
      ? sf
      : Math.max(0.1, sf * (condition?.shooterSpeedMultiplier ?? 1));
    const rawShooterTWithOffset = tShooter + o.shooter;
    if (!conditionPausesShooter) {
      const targetX = justEndedConditionPause ? conditionPauseReleaseX : lastRenderedShooterX;
      if (
        targetX !== null &&
        (justEndedConditionPause ||
          (lastShooterFreq !== null && Math.abs(lastShooterFreq - effectiveShooterFreq) > 0.0001))
      ) {
        const alignedT = shooterTimeForXNear(
          targetX,
          effectiveShooterFreq,
          lastShooterDirection,
          rawShooterTWithOffset + shooterTimeShift,
        );
        shooterTimeShift = alignedT - rawShooterTWithOffset;
      }
      frozenConditionShooterX = null;
    }
    const goalState: GoalState = simulateGoal(activeCfg, tScene, o.goal);
    const goalieState: GoalieState = simulateGoalie(
      activeCfg,
      opts.getSeed(),
      opts.getShotIndex(),
      tScene,
      o.goalie,
    );
    const shiftedShooterTWithOffset = rawShooterTWithOffset + shooterTimeShift;
    const sx = conditionPausesShooter
      ? (frozenConditionShooterX ??
        shooterX(shiftedShooterTWithOffset, effectiveShooterFreq) +
          (condition?.shooterXOffsetPx ?? 0))
      : shooterX(shiftedShooterTWithOffset, effectiveShooterFreq) +
        (condition?.shooterXOffsetPx ?? 0);
    lastRenderedShooterX = sx;
    if (!conditionPausesShooter) {
      lastShooterFreq = effectiveShooterFreq;
      lastShooterDirection = shooterDirection(shiftedShooterTWithOffset, effectiveShooterFreq);
    }
    const scale = opts.getScale();

    opts.goalRenderer.update(scale, goalState.offsetX);
    opts.goalieRenderer.update(goalieState, scale);
    opts.playerRenderer.update(scale, sx, undefined, {
      stumbling: condition?.stumbleActive === true,
      resting: condition?.status === 'exhausted_stop',
    });
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
      conditionPausedTotal = 0;
      scenePausedTotal = 0;
      shooterPauseStartedAt = null;
      conditionPauseStartedAt = null;
      scenePauseStartedAt = null;
      shooterTimeShift = 0;
      lastShooterFreq = null;
      lastShooterDirection = 1;
      lastRenderedShooterX = null;
      frozenConditionShooterX = null;
      heldStumbleCondition = null;
      heldStumbleUntilMs = 0;
      opts.onDuelConditionChange?.(null);
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
      return shooterT(renderNowMs) + shooterTimeShift;
    },
    getSceneT() {
      return sceneT(renderNowMs);
    },
    getRenderNow() {
      return renderNowMs;
    },
  };
}
