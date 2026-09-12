import { createRng } from './rng.js';

export type DuelInventoryResourceUnit = 'period' | 'shot' | 'distance' | 'energy_ms';
export type DuelPlayerConditionStatus =
  | 'normal'
  | 'stumble'
  | 'tired'
  | 'nutrition_slowdown'
  | 'exhausted_stop';
export type DuelPlayerFatigueLevel = 'none' | 'medium' | 'heavy' | 'resting';

export interface DuelInventoryTiming {
  stumbleIntervalMinRolls: number;
  stumbleIntervalMaxRolls: number;
  stumbleIntervalMinMs: number;
  stumbleIntervalMaxMs: number;
  stumbleDurationMinMs: number;
  stumbleDurationMaxMs: number;
  stumbleOffsetMinPx: number;
  stumbleOffsetMaxPx: number;
  stumbleRecoveryMinMs: number;
  stumbleRecoveryMaxMs: number;
  nutritionSlowdownMs: number;
  nutritionStopMs: number;
  energyBaselineSpeed: number;
  fatigueDelayMs: number;
  fatigueSpeedMultiplier: number;
  fatigueGraceMs: number;
  fatigueSlowdownStartMs: number;
  fatigueHeavySlowdownStartMs: number;
  fatigueStopStartMs: number;
  fatigueStopDurationMs: number;
  fatigueAfterRestMs: number;
  fatigueSlowMultiplier: number;
  fatigueHeavyMultiplier: number;
}

export interface DuelInventoryItemSnapshot {
  id: string;
  title: string;
  resourceUnit: DuelInventoryResourceUnit;
  resourceAvailable: number;
  effectPuckSpeedPoints: number;
  timing: DuelInventoryTiming;
}

export interface DuelInventoryLoadoutSnapshot {
  stick: DuelInventoryItemSnapshot | null;
  skates: DuelInventoryItemSnapshot | null;
  nutrition: DuelInventoryItemSnapshot | null;
  fallbackSkatesTiming?: DuelInventoryTiming;
  fallbackNutritionTiming?: DuelInventoryTiming;
}

export interface DuelPlayerConditionInput {
  seed: string;
  userId: string;
  periodNumber: number;
  elapsedMs: number;
  movementDistancePx: number;
  baseLaneWidthPx: number;
  baselineShooterSpeed: number;
  currentShooterSpeed: number;
  loadout: DuelInventoryLoadoutSnapshot;
  stumbleRandomness?: DuelStumbleRandomness;
}

export interface DuelStumbleRandomness {
  interval: number;
  duration: number;
  recovery: number;
  usesRollInterval: boolean;
}

export interface DuelPlayerCondition {
  puckSpeedDelta: number;
  shooterSpeedMultiplier: number;
  canShoot: boolean;
  status: DuelPlayerConditionStatus;
  fatigueLevel: DuelPlayerFatigueLevel;
  stumbleActive: boolean;
  shooterXOffsetPx: number;
  fatigueMs: number;
  nutritionConsumed: number;
  skatesConsumed: number;
}

export const DEFAULT_DUEL_INVENTORY_TIMING: DuelInventoryTiming = {
  stumbleIntervalMinRolls: 8,
  stumbleIntervalMaxRolls: 12,
  stumbleIntervalMinMs: 25_000,
  stumbleIntervalMaxMs: 45_000,
  stumbleDurationMinMs: 450,
  stumbleDurationMaxMs: 650,
  stumbleOffsetMinPx: 0,
  stumbleOffsetMaxPx: 0,
  stumbleRecoveryMinMs: 150,
  stumbleRecoveryMaxMs: 250,
  nutritionSlowdownMs: 2_000,
  nutritionStopMs: 5_000,
  energyBaselineSpeed: 0.75,
  fatigueDelayMs: 90_000,
  fatigueSpeedMultiplier: 1,
  fatigueGraceMs: 3_000,
  fatigueSlowdownStartMs: 3_000,
  fatigueHeavySlowdownStartMs: 8_000,
  fatigueStopStartMs: 13_000,
  fatigueStopDurationMs: 3_000,
  fatigueAfterRestMs: 7_000,
  fatigueSlowMultiplier: 0.85,
  fatigueHeavyMultiplier: 0.65,
};

export function duelInventorySpeedPointsToPuckSpeedDelta(points: number): number {
  return round4(points / 100);
}

export function duelSpeedPressureMultiplier(
  baselineShooterSpeed: number,
  currentShooterSpeed: number,
): number {
  if (baselineShooterSpeed <= 0) return 1;
  return round4(Math.max(1, currentShooterSpeed / baselineShooterSpeed));
}

export function normalizeDuelInventoryResource(input: {
  resourceUnit: DuelInventoryResourceUnit;
  activePeriodMs: number;
  movementDistancePx: number;
  baseLaneWidthPx: number;
  speedPressureMultiplier: number;
}): number {
  if (input.resourceUnit === 'shot') return 1;
  if (input.resourceUnit === 'distance') {
    return round4(input.movementDistancePx / Math.max(1, input.baseLaneWidthPx));
  }
  if (input.resourceUnit === 'energy_ms') {
    return Math.ceil(input.activePeriodMs * Math.max(1, input.speedPressureMultiplier));
  }
  return 0;
}

function round4(value: number): number {
  return Number(value.toFixed(4));
}

function globalTimingFor(fallback?: DuelInventoryTiming): DuelInventoryTiming {
  return fallback ?? DEFAULT_DUEL_INVENTORY_TIMING;
}

function deterministicRange(seed: string, min: number, max: number): number {
  if (max <= min) return min;
  const rng = createRng(seed);
  return Math.round(min + rng.next() * (max - min));
}

function defaultSkateStumbleWindow(
  input: DuelPlayerConditionInput,
  timing: DuelInventoryTiming,
): { active: boolean; offsetPx: number } {
  const randomness = input.stumbleRandomness ?? createDuelStumbleRandomness(input, timing);
  if (randomness.interval <= 0 || randomness.duration <= 0) {
    return { active: false, offsetPx: 0 };
  }

  let eventStartMs = stumbleIntervalMs(
    randomness.interval,
    randomness.usesRollInterval,
    input.currentShooterSpeed,
  );
  let eventIndex = 0;
  while (eventStartMs <= input.elapsedMs) {
    const duration =
      eventIndex === 0
        ? randomness.duration
        : deterministicRange(
            `${input.seed}:${input.userId}:${input.periodNumber}:stumble-duration:${eventIndex}`,
            timing.stumbleDurationMinMs,
            timing.stumbleDurationMaxMs,
          );
    const recovery =
      eventIndex === 0
        ? randomness.recovery
        : deterministicRange(
            `${input.seed}:${input.userId}:${input.periodNumber}:stumble-recovery:${eventIndex}`,
            timing.stumbleRecoveryMinMs,
            timing.stumbleRecoveryMaxMs,
          );
    if (input.elapsedMs < eventStartMs + duration + Math.max(0, recovery)) {
      return { active: true, offsetPx: 0 };
    }

    eventIndex += 1;
    const interval = deterministicRange(
      `${input.seed}:${input.userId}:${input.periodNumber}:stumble-interval:${eventIndex}`,
      randomness.usesRollInterval ? timing.stumbleIntervalMinRolls : timing.stumbleIntervalMinMs,
      randomness.usesRollInterval ? timing.stumbleIntervalMaxRolls : timing.stumbleIntervalMaxMs,
    );
    eventStartMs += stumbleIntervalMs(
      interval,
      randomness.usesRollInterval,
      input.currentShooterSpeed,
    );
  }
  return { active: false, offsetPx: 0 };
}

function stumbleIntervalMs(
  interval: number,
  usesRollInterval: boolean,
  currentShooterSpeed: number,
): number {
  if (usesRollInterval) {
    return Math.max(1, (interval / Math.max(0.001, currentShooterSpeed * 2)) * 1000);
  }
  return Math.max(1, interval);
}

export function createDuelStumbleRandomness(
  input: Pick<DuelPlayerConditionInput, 'seed' | 'userId' | 'periodNumber'>,
  timing: DuelInventoryTiming,
): DuelStumbleRandomness {
  const usesRollInterval = timing.stumbleIntervalMinRolls > 0 || timing.stumbleIntervalMaxRolls > 0;
  const interval = usesRollInterval
    ? deterministicRange(
        `${input.seed}:${input.userId}:${input.periodNumber}:stumble-roll-interval`,
        timing.stumbleIntervalMinRolls,
        timing.stumbleIntervalMaxRolls,
      )
    : deterministicRange(
        `${input.seed}:${input.userId}:${input.periodNumber}:stumble-interval`,
        timing.stumbleIntervalMinMs,
        timing.stumbleIntervalMaxMs,
      );
  const duration = deterministicRange(
    `${input.seed}:${input.userId}:${input.periodNumber}:stumble-duration`,
    timing.stumbleDurationMinMs,
    timing.stumbleDurationMaxMs,
  );
  const recovery = deterministicRange(
    `${input.seed}:${input.userId}:${input.periodNumber}:stumble-recovery`,
    timing.stumbleRecoveryMinMs,
    timing.stumbleRecoveryMaxMs,
  );
  return { interval, duration, recovery, usesRollInterval };
}

export function getDuelPlayerCondition(
  input: DuelPlayerConditionInput,
  reusable?: DuelPlayerCondition,
): DuelPlayerCondition {
  const nutritionTiming = globalTimingFor(input.loadout.fallbackNutritionTiming);
  const speedPressureMultiplier = duelSpeedPressureMultiplier(
    nutritionTiming.energyBaselineSpeed,
    input.currentShooterSpeed,
  );
  const rawSkatesCost = normalizeDuelInventoryResource({
    resourceUnit: 'distance',
    activePeriodMs: input.elapsedMs,
    movementDistancePx: input.movementDistancePx,
    baseLaneWidthPx: input.baseLaneWidthPx,
    speedPressureMultiplier,
  });
  const skatesConsumed = cappedSkatesConsumed(input, rawSkatesCost);
  const rawNutritionCost = rawNutritionResourceCost(input, speedPressureMultiplier);
  const nutritionConsumed = cappedNutritionConsumed(input, rawNutritionCost);
  const puckSpeedDelta = activeStickPuckSpeedDelta(input.loadout.stick);

  const skatesActive =
    input.loadout.skates?.resourceUnit === 'distance' &&
    input.loadout.skates.resourceAvailable > rawSkatesCost;
  const movementTiming = globalTimingFor(input.loadout.fallbackSkatesTiming);
  const stumble = skatesActive
    ? { active: false, offsetPx: 0 }
    : defaultSkateStumbleWindow(input, movementTiming);
  if (stumble.active) {
    return condition(
      reusable,
      puckSpeedDelta,
      1,
      false,
      'stumble',
      'none',
      true,
      stumble.offsetPx,
      0,
      nutritionConsumed,
      skatesConsumed,
    );
  }

  const fatigueMs = accumulatedFatigueMs(input, nutritionTiming);
  const fatigue = fatigueState(fatigueMs, nutritionTiming);

  return condition(
    reusable,
    puckSpeedDelta,
    fatigue.speedMultiplier,
    fatigue.canShoot,
    fatigue.status,
    fatigue.level,
    false,
    0,
    fatigue.normalizedFatigueMs,
    nutritionConsumed,
    skatesConsumed,
  );
}

function activeStickPuckSpeedDelta(stick: DuelInventoryItemSnapshot | null): number {
  if (stick?.resourceUnit !== 'shot' || stick.resourceAvailable <= 0) return 0;
  return duelInventorySpeedPointsToPuckSpeedDelta(stick.effectPuckSpeedPoints);
}

function cappedSkatesConsumed(input: DuelPlayerConditionInput, rawSkatesCost: number): number {
  const skates = input.loadout.skates;
  if (skates?.resourceUnit !== 'distance' || skates.resourceAvailable <= 0) return 0;
  return Math.min(rawSkatesCost, skates.resourceAvailable);
}

function rawNutritionResourceCost(
  input: DuelPlayerConditionInput,
  speedPressureMultiplier: number,
): number {
  if (input.loadout.nutrition?.resourceUnit !== 'energy_ms') return 0;
  return normalizeDuelInventoryResource({
    resourceUnit: 'energy_ms',
    activePeriodMs: input.elapsedMs,
    movementDistancePx: input.movementDistancePx,
    baseLaneWidthPx: input.baseLaneWidthPx,
    speedPressureMultiplier,
  });
}

function cappedNutritionConsumed(
  input: DuelPlayerConditionInput,
  rawNutritionCost: number,
): number {
  const nutrition = input.loadout.nutrition;
  if (nutrition?.resourceUnit !== 'energy_ms' || nutrition.resourceAvailable <= 0) return 0;
  return Math.min(rawNutritionCost, nutrition.resourceAvailable);
}

function accumulatedFatigueMs(
  input: DuelPlayerConditionInput,
  timing: DuelInventoryTiming,
): number {
  const nutrition = input.loadout.nutrition;
  if (nutrition?.resourceUnit === 'energy_ms' && nutrition.resourceAvailable > 0) {
    const speedPressureMultiplier = duelSpeedPressureMultiplier(
      timing.energyBaselineSpeed,
      input.currentShooterSpeed,
    );
    const depletionElapsedMs = nutrition.resourceAvailable / speedPressureMultiplier;
    return Math.ceil(Math.max(0, input.elapsedMs - depletionElapsedMs));
  }
  return Math.ceil(input.elapsedMs);
}

function fatigueState(
  rawFatigueMs: number,
  timing: DuelInventoryTiming,
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

function condition(
  reusable: DuelPlayerCondition | undefined,
  puckSpeedDelta: number,
  shooterSpeedMultiplier: number,
  canShoot: boolean,
  status: DuelPlayerConditionStatus,
  fatigueLevel: DuelPlayerFatigueLevel,
  stumbleActive: boolean,
  shooterXOffsetPx: number,
  fatigueMs: number,
  nutritionConsumed: number,
  skatesConsumed: number,
): DuelPlayerCondition {
  if (reusable === undefined) {
    return {
      puckSpeedDelta,
      shooterSpeedMultiplier,
      canShoot,
      status,
      fatigueLevel,
      stumbleActive,
      shooterXOffsetPx,
      fatigueMs,
      nutritionConsumed,
      skatesConsumed,
    };
  }
  reusable.puckSpeedDelta = puckSpeedDelta;
  reusable.shooterSpeedMultiplier = shooterSpeedMultiplier;
  reusable.canShoot = canShoot;
  reusable.status = status;
  reusable.fatigueLevel = fatigueLevel;
  reusable.stumbleActive = stumbleActive;
  reusable.shooterXOffsetPx = shooterXOffsetPx;
  reusable.fatigueMs = fatigueMs;
  reusable.nutritionConsumed = nutritionConsumed;
  reusable.skatesConsumed = skatesConsumed;
  return reusable;
}
