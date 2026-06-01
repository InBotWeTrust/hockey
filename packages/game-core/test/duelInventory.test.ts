import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DUEL_INVENTORY_TIMING,
  duelInventorySpeedPointsToPuckSpeedDelta,
  getDuelPlayerCondition,
  normalizeDuelInventoryResource,
  type DuelInventoryLoadoutSnapshot,
} from '../src/duelInventory.js';

function loadout(
  overrides: Partial<DuelInventoryLoadoutSnapshot> = {},
): DuelInventoryLoadoutSnapshot {
  return {
    stick: null,
    skates: null,
    nutrition: null,
    ...overrides,
  };
}

describe('duel inventory condition', () => {
  it('converts +10 speed points to +0.10 puck speed units', () => {
    expect(duelInventorySpeedPointsToPuckSpeedDelta(10)).toBe(0.1);
    expect(duelInventorySpeedPointsToPuckSpeedDelta(0)).toBe(0);
  });

  it('applies active stick puck speed and allows shooting while shot resource remains', () => {
    const condition = getDuelPlayerCondition({
      seed: 'match-seed',
      userId: 'user-a',
      periodNumber: 1,
      elapsedMs: 10_000,
      movementDistancePx: 0,
      baseLaneWidthPx: 572,
      baselineShooterSpeed: 1,
      currentShooterSpeed: 1,
      loadout: loadout({
        stick: {
          id: 'stick-1',
          title: 'Ультимейт Ван 1',
          resourceUnit: 'shot',
          resourceAvailable: 2,
          effectPuckSpeedPoints: 10,
          timing: DEFAULT_DUEL_INVENTORY_TIMING,
        },
      }),
    });

    expect(condition.puckSpeedDelta).toBe(0.1);
    expect(condition.canShoot).toBe(true);
    expect(condition.status).toBe('normal');
  });

  it('creates deterministic default-skate stumble windows for same seed and input', () => {
    const input = {
      seed: 'same-seed',
      userId: 'user-a',
      periodNumber: 1,
      elapsedMs: 30_000,
      movementDistancePx: 300,
      baseLaneWidthPx: 572,
      baselineShooterSpeed: 1,
      currentShooterSpeed: 1,
      loadout: loadout(),
    };

    expect(getDuelPlayerCondition(input)).toEqual(getDuelPlayerCondition(input));
  });

  it('does not start default-skate stumble before the first deterministic interval', () => {
    const timedLoadout = loadout({
      skates: {
        id: 'spent-skates',
        title: 'Старт',
        resourceUnit: 'distance',
        resourceAvailable: 0,
        effectPuckSpeedPoints: 0,
        timing: {
          ...DEFAULT_DUEL_INVENTORY_TIMING,
          stumbleIntervalMinMs: 25_000,
          stumbleIntervalMaxMs: 25_000,
          stumbleDurationMinMs: 300,
          stumbleDurationMaxMs: 300,
        },
      },
    });
    const baseInput = {
      seed: 'match-seed',
      userId: 'user-a',
      periodNumber: 1,
      movementDistancePx: 0,
      baseLaneWidthPx: 572,
      baselineShooterSpeed: 1,
      currentShooterSpeed: 1,
      loadout: timedLoadout,
    };

    const atStart = getDuelPlayerCondition({ ...baseInput, elapsedMs: 0 });
    const beforeFirstInterval = getDuelPlayerCondition({
      ...baseInput,
      elapsedMs: 24_999,
    });
    const atFirstInterval = getDuelPlayerCondition({ ...baseInput, elapsedMs: 25_000 });

    expect(atStart.stumbleActive).toBe(false);
    expect(atStart.canShoot).toBe(true);
    expect(beforeFirstInterval.stumbleActive).toBe(false);
    expect(beforeFirstInterval.canShoot).toBe(true);
    expect(atFirstInterval.stumbleActive).toBe(true);
    expect(atFirstInterval.canShoot).toBe(false);
  });

  it('Start skates disable stumble while distance resource remains', () => {
    const condition = getDuelPlayerCondition({
      seed: 'match-seed',
      userId: 'user-a',
      periodNumber: 1,
      elapsedMs: 31_000,
      movementDistancePx: 572,
      baseLaneWidthPx: 572,
      baselineShooterSpeed: 1,
      currentShooterSpeed: 1,
      loadout: loadout({
        skates: {
          id: 'skates-1',
          title: 'Старт',
          resourceUnit: 'distance',
          resourceAvailable: 1000,
          effectPuckSpeedPoints: 0,
          timing: DEFAULT_DUEL_INVENTORY_TIMING,
        },
      }),
    });

    expect(condition.stumbleActive).toBe(false);
    expect(condition.canShoot).toBe(true);
  });

  it('returns zero skates consumption when no active skates exist', () => {
    const condition = getDuelPlayerCondition({
      seed: 'match-seed',
      userId: 'user-a',
      periodNumber: 1,
      elapsedMs: 10_000,
      movementDistancePx: 1144,
      baseLaneWidthPx: 572,
      baselineShooterSpeed: 1,
      currentShooterSpeed: 1,
      loadout: loadout(),
    });

    expect(condition.skatesConsumed).toBe(0);
  });

  it('returns zero skates consumption for wrong-unit or empty distance skates', () => {
    const baseInput = {
      seed: 'match-seed',
      userId: 'user-a',
      periodNumber: 1,
      elapsedMs: 10_000,
      movementDistancePx: 1144,
      baseLaneWidthPx: 572,
      baselineShooterSpeed: 1,
      currentShooterSpeed: 1,
    };
    const wrongUnit = getDuelPlayerCondition({
      ...baseInput,
      loadout: loadout({
        skates: {
          id: 'shot-skates',
          title: 'Старт',
          resourceUnit: 'shot',
          resourceAvailable: 10,
          effectPuckSpeedPoints: 0,
          timing: DEFAULT_DUEL_INVENTORY_TIMING,
        },
      }),
    });
    const emptyDistance = getDuelPlayerCondition({
      ...baseInput,
      loadout: loadout({
        skates: {
          id: 'empty-skates',
          title: 'Старт',
          resourceUnit: 'distance',
          resourceAvailable: 0,
          effectPuckSpeedPoints: 0,
          timing: DEFAULT_DUEL_INVENTORY_TIMING,
        },
      }),
    });

    expect(wrongUnit.skatesConsumed).toBe(0);
    expect(emptyDistance.skatesConsumed).toBe(0);
  });

  it('caps skates consumption at available distance resource', () => {
    const condition = getDuelPlayerCondition({
      seed: 'match-seed',
      userId: 'user-a',
      periodNumber: 1,
      elapsedMs: 10_000,
      movementDistancePx: 1716,
      baseLaneWidthPx: 572,
      baselineShooterSpeed: 1,
      currentShooterSpeed: 1,
      loadout: loadout({
        skates: {
          id: 'skates-low',
          title: 'Старт',
          resourceUnit: 'distance',
          resourceAvailable: 1.25,
          effectPuckSpeedPoints: 0,
          timing: DEFAULT_DUEL_INVENTORY_TIMING,
        },
      }),
    });

    expect(condition.skatesConsumed).toBe(1.25);
  });

  it('empty nutrition behaves like no active nutrition instead of depletion', () => {
    const common = {
      seed: 'match-seed',
      userId: 'user-a',
      periodNumber: 1,
      movementDistancePx: 0,
      baseLaneWidthPx: 572,
      baselineShooterSpeed: 1,
      currentShooterSpeed: 1,
      loadout: loadout({
        nutrition: {
          id: 'nutrition-empty',
          title: 'Изотоник',
          resourceUnit: 'energy_ms' as const,
          resourceAvailable: 0,
          effectPuckSpeedPoints: 0,
          timing: DEFAULT_DUEL_INVENTORY_TIMING,
        },
      }),
    };

    const early = getDuelPlayerCondition({ ...common, elapsedMs: 500 });
    const duringWouldBeStop = getDuelPlayerCondition({ ...common, elapsedMs: 2_500 });

    expect(early.status).toBe('normal');
    expect(early.canShoot).toBe(true);
    expect(early.nutritionConsumed).toBe(0);
    expect(duringWouldBeStop.status).toBe('normal');
    expect(duringWouldBeStop.canShoot).toBe(true);
    expect(duringWouldBeStop.nutritionConsumed).toBe(0);
  });

  it('returns zero nutrition consumption when no nutrition is selected', () => {
    const condition = getDuelPlayerCondition({
      seed: 'match-seed',
      userId: 'user-a',
      periodNumber: 1,
      elapsedMs: 10_000,
      movementDistancePx: 0,
      baseLaneWidthPx: 572,
      baselineShooterSpeed: 1,
      currentShooterSpeed: 1,
      loadout: loadout(),
    });

    expect(condition.nutritionConsumed).toBe(0);
  });

  it('caps nutrition consumption at available energy resource after stop window', () => {
    const condition = getDuelPlayerCondition({
      seed: 'match-seed',
      userId: 'user-a',
      periodNumber: 1,
      elapsedMs: 17_000,
      movementDistancePx: 0,
      baseLaneWidthPx: 572,
      baselineShooterSpeed: 1,
      currentShooterSpeed: 1,
      loadout: loadout({
        nutrition: {
          id: 'nutrition-1',
          title: 'Изотоник',
          resourceUnit: 'energy_ms',
          resourceAvailable: 10_000,
          effectPuckSpeedPoints: 0,
          timing: DEFAULT_DUEL_INVENTORY_TIMING,
        },
      }),
    });

    expect(condition.nutritionConsumed).toBe(10_000);
    expect(condition.canShoot).toBe(true);
  });

  it('nutrition depletion follows before, slowdown, stop, and recovery boundaries', () => {
    const common = {
      seed: 'match-seed',
      userId: 'user-a',
      periodNumber: 1,
      movementDistancePx: 0,
      baseLaneWidthPx: 572,
      baselineShooterSpeed: 1,
      currentShooterSpeed: 1,
      loadout: loadout({
        nutrition: {
          id: 'nutrition-1',
          title: 'Изотоник',
          resourceUnit: 'energy_ms' as const,
          resourceAvailable: 10_000,
          effectPuckSpeedPoints: 0,
          timing: DEFAULT_DUEL_INVENTORY_TIMING,
        },
      }),
    };

    const beforeDepletion = getDuelPlayerCondition({ ...common, elapsedMs: 9_999 });
    const slowed = getDuelPlayerCondition({ ...common, elapsedMs: 10_500 });
    const stopped = getDuelPlayerCondition({ ...common, elapsedMs: 12_500 });
    const recovered = getDuelPlayerCondition({ ...common, elapsedMs: 17_000 });

    expect(beforeDepletion.status).toBe('normal');
    expect(beforeDepletion.canShoot).toBe(true);
    expect(slowed.status).toBe('nutrition_slowdown');
    expect(slowed.canShoot).toBe(true);
    expect(stopped.status).toBe('exhausted_stop');
    expect(stopped.canShoot).toBe(false);
    expect(['normal', 'tired']).toContain(recovered.status);
    expect(recovered.canShoot).toBe(true);
  });

  it('normalizes distance and energy resource consumption', () => {
    expect(
      normalizeDuelInventoryResource({
        resourceUnit: 'distance',
        activePeriodMs: 60_000,
        movementDistancePx: 1144,
        baseLaneWidthPx: 572,
        speedPressureMultiplier: 1,
      }),
    ).toBe(2);
    expect(
      normalizeDuelInventoryResource({
        resourceUnit: 'energy_ms',
        activePeriodMs: 60_000,
        movementDistancePx: 0,
        baseLaneWidthPx: 572,
        speedPressureMultiplier: 1.25,
      }),
    ).toBe(75_000);
  });
});
