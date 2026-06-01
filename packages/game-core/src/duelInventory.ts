import { createRng } from './rng.js';

export type DuelInventoryResourceUnit = 'period' | 'shot' | 'distance' | 'energy_ms';
export type DuelPlayerConditionStatus =
  | 'normal'
  | 'stumble'
  | 'tired'
  | 'nutrition_slowdown'
  | 'exhausted_stop';

export interface DuelInventoryTiming {
  stumbleIntervalMinMs: number;
  stumbleIntervalMaxMs: number;
  stumbleDurationMinMs: number;
  stumbleDurationMaxMs: number;
  nutritionSlowdownMs: number;
  nutritionStopMs: number;
  fatigueDelayMs: number;
  fatigueSpeedMultiplier: number;
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
  stumbleActive: boolean;
  nutritionConsumed: number;
  skatesConsumed: number;
}

export const DEFAULT_DUEL_INVENTORY_TIMING: DuelInventoryTiming = {
  stumbleIntervalMinMs: 25_000,
  stumbleIntervalMaxMs: 45_000,
  stumbleDurationMinMs: 250,
  stumbleDurationMaxMs: 400,
  nutritionSlowdownMs: 2_000,
  nutritionStopMs: 5_000,
  fatigueDelayMs: 90_000,
  fatigueSpeedMultiplier: 0.88,
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
): boolean {
  const interval = deterministicRange(
    `${input.seed}:${input.userId}:${input.periodNumber}:stumble-interval`,
    timing.stumbleIntervalMinMs,
    timing.stumbleIntervalMaxMs,
  );
  const duration = deterministicRange(
    `${input.seed}:${input.userId}:${input.periodNumber}:stumble-duration`,
    timing.stumbleDurationMinMs,
    timing.stumbleDurationMaxMs,
  );
  if (interval <= 0 || duration <= 0) return false;
  if (input.elapsedMs < interval) return false;
  return (input.elapsedMs - interval) % interval < duration;
}

export function getDuelPlayerCondition(input: DuelPlayerConditionInput): DuelPlayerCondition {
  const speedPressureMultiplier = duelSpeedPressureMultiplier(
    input.baselineShooterSpeed,
    input.currentShooterSpeed,
  );
  const skatesConsumed = normalizeDuelInventoryResource({
    resourceUnit: 'distance',
    activePeriodMs: input.elapsedMs,
    movementDistancePx: input.movementDistancePx,
    baseLaneWidthPx: input.baseLaneWidthPx,
    speedPressureMultiplier,
  });
  const nutritionConsumed = nutritionResourceConsumed(input, speedPressureMultiplier);
  const puckSpeedDelta = activeStickPuckSpeedDelta(input.loadout.stick);

  const nutrition = input.loadout.nutrition;
  if (nutrition?.resourceUnit === 'energy_ms' && nutrition.resourceAvailable > 0) {
    const depletion = nutritionDepletionState(input, nutrition, speedPressureMultiplier);
    if (depletion === 'exhausted_stop') {
      return condition({
        puckSpeedDelta,
        shooterSpeedMultiplier: 0,
        canShoot: false,
        status: 'exhausted_stop',
        stumbleActive: false,
        nutritionConsumed,
        skatesConsumed,
      });
    }
    if (depletion === 'nutrition_slowdown') {
      return condition({
        puckSpeedDelta,
        shooterSpeedMultiplier: timingFor(nutrition).fatigueSpeedMultiplier,
        canShoot: true,
        status: 'nutrition_slowdown',
        stumbleActive: false,
        nutritionConsumed,
        skatesConsumed,
      });
    }
  }

  const skatesActive =
    input.loadout.skates?.resourceUnit === 'distance' &&
    input.loadout.skates.resourceAvailable > skatesConsumed;
  const movementTiming = timingFor(input.loadout.skates);
  const stumbleActive = skatesActive ? false : defaultSkateStumbleWindow(input, movementTiming);
  if (stumbleActive) {
    return condition({
      puckSpeedDelta,
      shooterSpeedMultiplier: movementTiming.fatigueSpeedMultiplier,
      canShoot: false,
      status: 'stumble',
      stumbleActive: true,
      nutritionConsumed,
      skatesConsumed,
    });
  }

  const nutritionRemaining =
    nutrition?.resourceUnit === 'energy_ms' && nutrition.resourceAvailable > nutritionConsumed;
  const fatigueTiming = timingFor(nutrition);
  const tired = !nutritionRemaining && input.elapsedMs >= Math.max(0, fatigueTiming.fatigueDelayMs);

  return condition({
    puckSpeedDelta,
    shooterSpeedMultiplier: tired ? fatigueTiming.fatigueSpeedMultiplier : 1,
    canShoot: true,
    status: tired ? 'tired' : 'normal',
    stumbleActive: false,
    nutritionConsumed,
    skatesConsumed,
  });
}

function activeStickPuckSpeedDelta(stick: DuelInventoryItemSnapshot | null): number {
  if (stick?.resourceUnit !== 'shot' || stick.resourceAvailable <= 0) return 0;
  return duelInventorySpeedPointsToPuckSpeedDelta(stick.effectPuckSpeedPoints);
}

function nutritionResourceConsumed(
  input: DuelPlayerConditionInput,
  speedPressureMultiplier: number,
): number {
  if (
    input.loadout.nutrition?.resourceUnit !== 'energy_ms' ||
    input.loadout.nutrition.resourceAvailable <= 0
  ) {
    return 0;
  }
  return normalizeDuelInventoryResource({
    resourceUnit: 'energy_ms',
    activePeriodMs: input.elapsedMs,
    movementDistancePx: input.movementDistancePx,
    baseLaneWidthPx: input.baseLaneWidthPx,
    speedPressureMultiplier,
  });
}

function nutritionDepletionState(
  input: DuelPlayerConditionInput,
  nutrition: DuelInventoryItemSnapshot,
  speedPressureMultiplier: number,
): 'nutrition_slowdown' | 'exhausted_stop' | 'not_depleted' {
  const timing = timingFor(nutrition);
  const depletionAtMs = Math.ceil(nutrition.resourceAvailable / speedPressureMultiplier);
  const sinceDepletionMs = input.elapsedMs - depletionAtMs;
  if (sinceDepletionMs < 0) return 'not_depleted';
  if (sinceDepletionMs < timing.nutritionSlowdownMs) return 'nutrition_slowdown';
  if (sinceDepletionMs < timing.nutritionSlowdownMs + timing.nutritionStopMs) {
    return 'exhausted_stop';
  }
  return 'not_depleted';
}

function condition(value: DuelPlayerCondition): DuelPlayerCondition {
  return value;
}
