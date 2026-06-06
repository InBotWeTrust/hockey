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
  stumbleIntervalMinRolls: 90,
  stumbleIntervalMaxRolls: 130,
  stumbleIntervalMinMs: 25_000,
  stumbleIntervalMaxMs: 45_000,
  stumbleDurationMinMs: 500,
  stumbleDurationMaxMs: 700,
  stumbleOffsetMinPx: 20,
  stumbleOffsetMaxPx: 45,
  stumbleRecoveryMinMs: 200,
  stumbleRecoveryMaxMs: 300,
  nutritionSlowdownMs: 2_000,
  nutritionStopMs: 5_000,
  energyBaselineSpeed: 0.75,
  fatigueDelayMs: 90_000,
  fatigueSpeedMultiplier: 1,
  fatigueGraceMs: 30_000,
  fatigueSlowdownStartMs: 30_000,
  fatigueHeavySlowdownStartMs: 75_000,
  fatigueStopStartMs: 90_000,
  fatigueStopDurationMs: 5_000,
  fatigueAfterRestMs: 45_000,
  fatigueSlowMultiplier: 0.9,
  fatigueHeavyMultiplier: 0.75,
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

function timingFor(item: DuelInventoryItemSnapshot | null): DuelInventoryTiming {
  return item?.timing ?? DEFAULT_DUEL_INVENTORY_TIMING;
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
  const rolls = input.movementDistancePx / Math.max(1, input.baseLaneWidthPx);
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
  if (interval <= 0 || duration <= 0) return { active: false, offsetPx: 0 };

  const intervalMs = usesRollInterval
    ? (interval / Math.max(0.001, input.currentShooterSpeed * 2)) * 1000
    : interval;
  if (input.elapsedMs < intervalMs) return { active: false, offsetPx: 0 };
  const windowMs = duration + Math.max(0, recovery);
  const phaseMs = (input.elapsedMs - intervalMs) % intervalMs;
  if (phaseMs >= windowMs) return { active: false, offsetPx: 0 };
  return { active: true, offsetPx: 0 };
}

export function getDuelPlayerCondition(input: DuelPlayerConditionInput): DuelPlayerCondition {
  const nutritionTiming = timingFor(input.loadout.nutrition);
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

  const nutrition = input.loadout.nutrition;

  const skatesActive =
    input.loadout.skates?.resourceUnit === 'distance' &&
    input.loadout.skates.resourceAvailable > rawSkatesCost;
  const movementTiming = timingFor(input.loadout.skates);
  const stumble = skatesActive
    ? { active: false, offsetPx: 0 }
    : defaultSkateStumbleWindow(input, movementTiming);
  if (stumble.active) {
    return condition({
      puckSpeedDelta,
      shooterSpeedMultiplier: 1,
      canShoot: false,
      status: 'stumble',
      fatigueLevel: 'none',
      stumbleActive: true,
      shooterXOffsetPx: stumble.offsetPx,
      fatigueMs: 0,
      nutritionConsumed,
      skatesConsumed,
    });
  }

  const fatigueTiming = timingFor(nutrition);
  const fatigueMs = accumulatedFatigueMs(input, rawNutritionCost, fatigueTiming);
  const fatigue = fatigueState(fatigueMs, fatigueTiming);

  return condition({
    puckSpeedDelta,
    shooterSpeedMultiplier: fatigue.speedMultiplier,
    canShoot: fatigue.canShoot,
    status: fatigue.status,
    fatigueLevel: fatigue.level,
    stumbleActive: false,
    shooterXOffsetPx: 0,
    fatigueMs: fatigue.normalizedFatigueMs,
    nutritionConsumed,
    skatesConsumed,
  });
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
  rawNutritionCost: number,
  timing: DuelInventoryTiming,
): number {
  const nutrition = input.loadout.nutrition;
  if (nutrition?.resourceUnit === 'energy_ms' && nutrition.resourceAvailable > 0) {
    return Math.max(0, rawNutritionCost - nutrition.resourceAvailable);
  }
  return Math.ceil(
    input.elapsedMs *
      duelSpeedPressureMultiplier(timing.energyBaselineSpeed, input.currentShooterSpeed),
  );
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
  const stopAt = Math.max(0, timing.fatigueStopStartMs);
  const stopDuration = Math.max(0, timing.fatigueStopDurationMs);
  const afterRest = Math.min(Math.max(0, timing.fatigueAfterRestMs), stopAt);
  let fatigueMs = rawFatigueMs;
  let resting = false;

  if (stopDuration > 0 && fatigueMs >= stopAt) {
    const activeSpan = Math.max(1, stopAt - afterRest);
    const cycle = stopDuration + activeSpan;
    const phase = (fatigueMs - stopAt) % cycle;
    if (phase < stopDuration) {
      resting = true;
      fatigueMs = stopAt + phase;
    } else {
      fatigueMs = afterRest + (phase - stopDuration);
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
  if (fatigueMs >= Math.max(0, timing.fatigueHeavySlowdownStartMs)) {
    return {
      status: 'tired',
      level: 'heavy',
      canShoot: true,
      speedMultiplier: timing.fatigueHeavyMultiplier,
      normalizedFatigueMs: Math.ceil(fatigueMs),
    };
  }
  if (fatigueMs >= Math.max(0, timing.fatigueSlowdownStartMs, timing.fatigueGraceMs)) {
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

function condition(value: DuelPlayerCondition): DuelPlayerCondition {
  return value;
}
