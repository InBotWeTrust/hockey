import type { DuelInventoryTiming, DuelPlayerConditionStatus, DuelPlayerFatigueLevel } from './duelInventory.js';

export function getPlayerFatigueState(
  rawFatigueMs: number,
  timing: Pick<DuelInventoryTiming, 'fatigueSlowdownStartMs' | 'fatigueGraceMs' | 'fatigueHeavySlowdownStartMs' | 'fatigueStopStartMs' | 'fatigueStopDurationMs' | 'fatigueAfterRestMs' | 'fatigueSlowMultiplier' | 'fatigueHeavyMultiplier'>,
): {
  status: DuelPlayerConditionStatus;
  level: DuelPlayerFatigueLevel;
  canShoot: boolean;
  speedMultiplier: number;
  normalizedFatigueMs: number;
} {
  const fatigueStartAt = Math.max(0, timing.fatigueSlowdownStartMs, timing.fatigueGraceMs);
  const heavyStartAt = Math.max(fatigueStartAt, timing.fatigueHeavySlowdownStartMs);
  const stopAt = Math.max(heavyStartAt, timing.fatigueStopStartMs);
  const stopDuration = Math.max(0, timing.fatigueStopDurationMs);
  const recoveryDuration = Math.max(0, timing.fatigueAfterRestMs);
  let fatigueMs = rawFatigueMs;
  let resting = false;
  let recovering = false;

  if (stopDuration > 0 && fatigueMs >= stopAt) {
    const tiredSpan = Math.max(0, stopAt - fatigueStartAt);
    const cycle = Math.max(1, stopDuration + recoveryDuration + tiredSpan);
    const phase = (fatigueMs - stopAt) % cycle;
    if (phase < stopDuration) {
      resting = true;
      fatigueMs = stopAt + phase;
    } else if (phase < stopDuration + recoveryDuration) {
      recovering = true;
      fatigueMs = phase - stopDuration;
    } else {
      fatigueMs = fatigueStartAt + (phase - stopDuration - recoveryDuration);
    }
  }

  if (resting) {
    return {
      status: 'exhausted_stop',
      level: 'resting',
      canShoot: false,
      speedMultiplier: 0,
      normalizedFatigueMs: Math.ceil(fatigueMs),
    };
  }
  if (recovering) {
    return {
      status: 'normal',
      level: 'none',
      canShoot: true,
      speedMultiplier: 1,
      normalizedFatigueMs: Math.ceil(fatigueMs),
    };
  }
  if (fatigueMs >= heavyStartAt) {
    return {
      status: 'nutrition_slowdown',
      level: 'heavy',
      canShoot: true,
      speedMultiplier: timing.fatigueHeavyMultiplier,
      normalizedFatigueMs: Math.ceil(fatigueMs),
    };
  }
  if (fatigueMs >= fatigueStartAt) {
    return {
      status: 'tired',
      level: 'medium',
      canShoot: true,
      speedMultiplier: timing.fatigueSlowMultiplier,
      normalizedFatigueMs: Math.ceil(fatigueMs),
    };
  }
  return {
    status: 'normal',
    level: 'none',
    canShoot: true,
    speedMultiplier: 1,
    normalizedFatigueMs: Math.ceil(fatigueMs),
  };
}
