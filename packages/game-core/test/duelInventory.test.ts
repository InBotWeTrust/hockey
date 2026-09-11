import { describe, expect, it } from 'vitest';
import {
  createDuelStumbleRandomness,
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

function activeSkates(): NonNullable<DuelInventoryLoadoutSnapshot['skates']> {
  return {
    id: 'test-active-skates',
    title: 'Тестовые коньки',
    resourceUnit: 'distance',
    resourceAvailable: 1_000_000,
    effectPuckSpeedPoints: 0,
    timing: DEFAULT_DUEL_INVENTORY_TIMING,
  };
}

function activeNutrition(): NonNullable<DuelInventoryLoadoutSnapshot['nutrition']> {
  return {
    id: 'test-active-nutrition',
    title: 'Тестовая энергия',
    resourceUnit: 'energy_ms',
    resourceAvailable: 1_000_000,
    effectPuckSpeedPoints: 0,
    timing: DEFAULT_DUEL_INVENTORY_TIMING,
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
        skates: activeSkates(),
        nutrition: activeNutrition(),
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

  it('falls back to base duel puck speed when shot-stick resource is exhausted', () => {
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
        skates: activeSkates(),
        nutrition: activeNutrition(),
        stick: {
          id: 'spent-stick',
          title: 'Ультимейт Ван 1',
          resourceUnit: 'shot',
          resourceAvailable: 0,
          effectPuckSpeedPoints: 10,
          timing: DEFAULT_DUEL_INVENTORY_TIMING,
        },
      }),
    });

    expect(condition.puckSpeedDelta).toBe(0);
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

  it('can reuse a caller-owned condition object without changing the calculated result', () => {
    const input = {
      seed: 'match-seed',
      userId: 'user-a',
      periodNumber: 1,
      elapsedMs: 30_000,
      movementDistancePx: 500,
      baseLaneWidthPx: 572,
      baselineShooterSpeed: 0.8,
      currentShooterSpeed: 0.8,
      loadout: loadout(),
    };
    const expected = getDuelPlayerCondition(input);
    const reusable = { ...expected, status: 'normal' as const };

    const actual = getDuelPlayerCondition(input, reusable);

    expect(actual).toBe(reusable);
    expect(actual).toEqual(expected);
  });

  it('precomputed stumble randomness is exactly equivalent to per-call calculation', () => {
    const timing = {
      ...DEFAULT_DUEL_INVENTORY_TIMING,
      stumbleIntervalMinRolls: 7,
      stumbleIntervalMaxRolls: 19,
      stumbleDurationMinMs: 350,
      stumbleDurationMaxMs: 825,
      stumbleRecoveryMinMs: 125,
      stumbleRecoveryMaxMs: 375,
    };
    const elapsedTimes = [
      0, 1, 2_499, 2_500, 4_999, 5_000, 5_624, 5_625, 5_999, 15_000, 45_000, 90_000, 180_000,
    ];

    for (const seed of ['match-seed', 'another-seed', 'турнир-сид']) {
      for (const periodNumber of [1, 2, 3]) {
        for (const currentShooterSpeed of [0.45, 0.85, 1.25, 1.5]) {
          for (const skates of [
            null,
            {
              id: 'spent-skates',
              title: 'Старт',
              resourceUnit: 'distance' as const,
              resourceAvailable: 0,
              effectPuckSpeedPoints: 0,
              timing,
            },
          ]) {
            const common = {
              seed,
              userId: 'user-a',
              periodNumber,
              movementDistancePx: 1_144,
              baseLaneWidthPx: 572,
              baselineShooterSpeed: 0.85,
              currentShooterSpeed,
              loadout: loadout({ skates, fallbackSkatesTiming: timing }),
            };
            const randomness = createDuelStumbleRandomness(common, timing);

            for (const elapsedMs of elapsedTimes) {
              const input = { ...common, elapsedMs };
              expect(getDuelPlayerCondition({ ...input, stumbleRandomness: randomness })).toEqual(
                getDuelPlayerCondition(input),
              );
            }
          }
        }
      }
    }
  });

  it('shows multiple default-skate stumbles during the first express minute without skates', () => {
    const common = {
      seed: 'match-seed',
      userId: 'user-a',
      periodNumber: 1,
      movementDistancePx: 0,
      baseLaneWidthPx: 572,
      baselineShooterSpeed: 0.8,
      currentShooterSpeed: 0.8,
      loadout: loadout(),
    };
    let stumbleWindows = 0;
    let wasStumbling = false;

    for (let elapsedMs = 0; elapsedMs <= 90_000; elapsedMs += 100) {
      const condition = getDuelPlayerCondition({
        ...common,
        elapsedMs,
      });
      if (condition.stumbleActive && !wasStumbling) stumbleWindows += 1;
      wasStumbling = condition.stumbleActive;
    }

    expect(stumbleWindows).toBeGreaterThanOrEqual(2);
  });

  it('does not start global skate stumble before the first configured interval', () => {
    const timing = {
      ...DEFAULT_DUEL_INVENTORY_TIMING,
      stumbleIntervalMinRolls: 10,
      stumbleIntervalMaxRolls: 10,
      stumbleDurationMinMs: 500,
      stumbleDurationMaxMs: 500,
      stumbleRecoveryMinMs: 250,
      stumbleRecoveryMaxMs: 250,
    };
    const timedLoadout = loadout({
      fallbackSkatesTiming: timing,
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
      elapsedMs: 4_999,
      movementDistancePx: 9.998 * 572,
    });
    const atFirstInterval = getDuelPlayerCondition({
      ...baseInput,
      elapsedMs: 5_000,
      movementDistancePx: 10 * 572,
    });
    const duringRecovery = getDuelPlayerCondition({
      ...baseInput,
      elapsedMs: 5_625,
      movementDistancePx: 11.25 * 572,
    });
    const afterRecovery = getDuelPlayerCondition({
      ...baseInput,
      elapsedMs: 5_751,
      movementDistancePx: 11.502 * 572,
    });

    expect(atStart.stumbleActive).toBe(false);
    expect(atStart.canShoot).toBe(true);
    expect(beforeFirstInterval.stumbleActive).toBe(false);
    expect(beforeFirstInterval.canShoot).toBe(true);
    expect(atFirstInterval.stumbleActive).toBe(true);
    expect(atFirstInterval.canShoot).toBe(false);
    expect(atFirstInterval.shooterSpeedMultiplier).toBe(1);
    expect(atFirstInterval.shooterXOffsetPx).toBe(0);
    expect(duringRecovery.stumbleActive).toBe(true);
    expect(duringRecovery.canShoot).toBe(false);
    expect(duringRecovery.shooterSpeedMultiplier).toBe(1);
    expect(duringRecovery.shooterXOffsetPx).toBe(0);
    expect(afterRecovery.stumbleActive).toBe(false);
    expect(afterRecovery.canShoot).toBe(true);
    expect(afterRecovery.shooterXOffsetPx).toBe(0);
  });

  it('uses configured fallback timing when no skates are selected', () => {
    const configuredTiming = {
      ...DEFAULT_DUEL_INVENTORY_TIMING,
      stumbleIntervalMinRolls: 8,
      stumbleIntervalMaxRolls: 8,
      stumbleDurationMinMs: 500,
      stumbleDurationMaxMs: 500,
      stumbleRecoveryMinMs: 250,
      stumbleRecoveryMaxMs: 250,
    };
    const common = {
      seed: 'match-seed',
      userId: 'user-a',
      periodNumber: 1,
      movementDistancePx: 0,
      baseLaneWidthPx: 572,
      baselineShooterSpeed: 1,
      currentShooterSpeed: 1,
      loadout: loadout({
        fallbackSkatesTiming: configuredTiming,
      }),
    };

    const beforeConfiguredInterval = getDuelPlayerCondition({ ...common, elapsedMs: 3_999 });
    const atConfiguredInterval = getDuelPlayerCondition({ ...common, elapsedMs: 4_000 });

    expect(beforeConfiguredInterval.stumbleActive).toBe(false);
    expect(beforeConfiguredInterval.canShoot).toBe(true);
    expect(atConfiguredInterval.stumbleActive).toBe(true);
    expect(atConfiguredInterval.canShoot).toBe(false);
  });

  it('cycles the approved global fatigue stages after energy runs out', () => {
    const common = {
      seed: 'match-seed',
      userId: 'user-a',
      periodNumber: 1,
      movementDistancePx: 0,
      baseLaneWidthPx: 572,
      baselineShooterSpeed: 0.75,
      currentShooterSpeed: 1.5,
      loadout: loadout({ skates: activeSkates() }),
    };

    const grace = getDuelPlayerCondition({ ...common, elapsedMs: 2_999 });
    const tired = getDuelPlayerCondition({ ...common, elapsedMs: 3_000 });
    const heavy = getDuelPlayerCondition({ ...common, elapsedMs: 8_000 });
    const stopped = getDuelPlayerCondition({ ...common, elapsedMs: 13_000 });
    const recovery = getDuelPlayerCondition({ ...common, elapsedMs: 16_000 });
    const afterRecovery = getDuelPlayerCondition({ ...common, elapsedMs: 23_000 });

    expect(grace.status).toBe('normal');
    expect(grace.fatigueLevel).toBe('none');
    expect(grace.shooterSpeedMultiplier).toBe(1);
    expect(tired.status).toBe('tired');
    expect(tired.fatigueLevel).toBe('medium');
    expect(tired.shooterSpeedMultiplier).toBe(0.85);
    expect(heavy.status).toBe('nutrition_slowdown');
    expect(heavy.fatigueLevel).toBe('heavy');
    expect(heavy.shooterSpeedMultiplier).toBe(0.65);
    expect(stopped.status).toBe('exhausted_stop');
    expect(stopped.fatigueLevel).toBe('resting');
    expect(stopped.canShoot).toBe(false);
    expect(stopped.shooterSpeedMultiplier).toBe(0);
    expect(recovery.status).toBe('normal');
    expect(recovery.fatigueLevel).toBe('none');
    expect(recovery.canShoot).toBe(true);
    expect(recovery.shooterSpeedMultiplier).toBe(1);
    expect(afterRecovery.status).toBe('tired');
    expect(afterRecovery.fatigueLevel).toBe('medium');
    expect(afterRecovery.canShoot).toBe(true);
    expect(afterRecovery.shooterSpeedMultiplier).toBe(0.85);
  });

  it('uses configured fallback timing when no nutrition is selected', () => {
    const configuredTiming = {
      ...DEFAULT_DUEL_INVENTORY_TIMING,
      energyBaselineSpeed: 1,
      fatigueGraceMs: 5_000,
      fatigueSlowdownStartMs: 5_000,
      fatigueStopStartMs: 9_000,
      fatigueStopDurationMs: 2_000,
      fatigueAfterRestMs: 5_000,
      fatigueSlowMultiplier: 0.5,
    };
    const common = {
      seed: 'match-seed',
      userId: 'user-a',
      periodNumber: 1,
      movementDistancePx: 0,
      baseLaneWidthPx: 572,
      baselineShooterSpeed: 1,
      currentShooterSpeed: 1,
      loadout: loadout({
        skates: activeSkates(),
        fallbackNutritionTiming: configuredTiming,
      }),
    };

    const beforeFatigue = getDuelPlayerCondition({ ...common, elapsedMs: 4_999 });
    const tired = getDuelPlayerCondition({ ...common, elapsedMs: 5_000 });
    const resting = getDuelPlayerCondition({ ...common, elapsedMs: 9_500 });

    expect(beforeFatigue.status).toBe('normal');
    expect(tired.status).toBe('tired');
    expect(tired.shooterSpeedMultiplier).toBe(0.5);
    expect(resting.status).toBe('exhausted_stop');
    expect(resting.canShoot).toBe(false);
  });

  it('restarts the fatigue cycle at the beginning of every period', () => {
    const common = {
      seed: 'match-seed',
      userId: 'user-a',
      movementDistancePx: 0,
      baseLaneWidthPx: 572,
      baselineShooterSpeed: 0.75,
      currentShooterSpeed: 0.75,
      loadout: loadout({
        skates: activeSkates(),
        nutrition: {
          id: 'spent-nutrition',
          title: 'Изотоник',
          resourceUnit: 'energy_ms' as const,
          resourceAvailable: 0,
          effectPuckSpeedPoints: 0,
          timing: {
            ...DEFAULT_DUEL_INVENTORY_TIMING,
            fatigueGraceMs: 30_000,
            fatigueSlowdownStartMs: 30_000,
          },
        },
        fallbackNutritionTiming: DEFAULT_DUEL_INVENTORY_TIMING,
      }),
    };

    const grace = getDuelPlayerCondition({
      ...common,
      periodNumber: 2,
      elapsedMs: 2_999,
    });
    const tired = getDuelPlayerCondition({
      ...common,
      periodNumber: 2,
      elapsedMs: 3_000,
    });

    expect(grace.status).toBe('normal');
    expect(grace.shooterSpeedMultiplier).toBe(1);
    expect(tired.status).toBe('tired');
    expect(tired.fatigueLevel).toBe('medium');
    expect(tired.shooterSpeedMultiplier).toBe(0.85);
  });

  it('uses global skate penalties after any selected skates run out', () => {
    const fallbackTiming = {
      ...DEFAULT_DUEL_INVENTORY_TIMING,
      stumbleIntervalMinRolls: 8,
      stumbleIntervalMaxRolls: 8,
      stumbleDurationMinMs: 450,
      stumbleDurationMaxMs: 450,
      stumbleRecoveryMinMs: 150,
      stumbleRecoveryMaxMs: 150,
    };
    const condition = getDuelPlayerCondition({
      seed: 'match-seed',
      userId: 'user-a',
      periodNumber: 1,
      elapsedMs: 4_000,
      movementDistancePx: 8 * 572,
      baseLaneWidthPx: 572,
      baselineShooterSpeed: 1,
      currentShooterSpeed: 1,
      loadout: loadout({
        skates: {
          id: 'spent-premium-skates',
          title: 'Премиум',
          resourceUnit: 'distance',
          resourceAvailable: 0,
          effectPuckSpeedPoints: 0,
          timing: {
            ...DEFAULT_DUEL_INVENTORY_TIMING,
            stumbleIntervalMinRolls: 100,
            stumbleIntervalMaxRolls: 100,
          },
        },
        fallbackSkatesTiming: fallbackTiming,
      }),
    });

    expect(condition.stumbleActive).toBe(true);
    expect(condition.canShoot).toBe(false);
  });

  it('uses global energy timings and baseline for every nutrition item', () => {
    const itemTiming = {
      ...DEFAULT_DUEL_INVENTORY_TIMING,
      energyBaselineSpeed: 0.5,
      fatigueGraceMs: 30_000,
      fatigueSlowdownStartMs: 30_000,
    };
    const fallbackTiming = {
      ...DEFAULT_DUEL_INVENTORY_TIMING,
      energyBaselineSpeed: 1,
    };
    const common = {
      seed: 'match-seed',
      userId: 'user-a',
      periodNumber: 1,
      movementDistancePx: 0,
      baseLaneWidthPx: 572,
      baselineShooterSpeed: 1,
      currentShooterSpeed: 1,
      loadout: loadout({
        skates: activeSkates(),
        nutrition: {
          id: 'nutrition-premium',
          title: 'Премиум',
          resourceUnit: 'energy_ms' as const,
          resourceAvailable: 1_000,
          effectPuckSpeedPoints: 0,
          timing: itemTiming,
        },
        fallbackNutritionTiming: fallbackTiming,
      }),
    };

    const active = getDuelPlayerCondition({ ...common, elapsedMs: 750 });
    const tired = getDuelPlayerCondition({ ...common, elapsedMs: 4_000 });

    expect(active.nutritionConsumed).toBe(750);
    expect(active.status).toBe('normal');
    expect(tired.status).toBe('tired');
    expect(tired.shooterSpeedMultiplier).toBe(0.85);
  });

  it('accumulates fatigue only after selected nutrition resource is depleted', () => {
    const common = {
      seed: 'match-seed',
      userId: 'user-a',
      periodNumber: 1,
      movementDistancePx: 0,
      baseLaneWidthPx: 572,
      baselineShooterSpeed: 0.75,
      currentShooterSpeed: 1.5,
      loadout: loadout({
        skates: activeSkates(),
        nutrition: {
          id: 'nutrition-1',
          title: 'Изотоник',
          resourceUnit: 'energy_ms' as const,
          resourceAvailable: 60_000,
          effectPuckSpeedPoints: 0,
          timing: DEFAULT_DUEL_INVENTORY_TIMING,
        },
      }),
    };

    const beforeDepletion = getDuelPlayerCondition({ ...common, elapsedMs: 29_000 });
    const afterDepletionGrace = getDuelPlayerCondition({ ...common, elapsedMs: 32_999 });
    const tired = getDuelPlayerCondition({ ...common, elapsedMs: 33_000 });

    expect(beforeDepletion.status).toBe('normal');
    expect(beforeDepletion.nutritionConsumed).toBe(58_000);
    expect(afterDepletionGrace.status).toBe('normal');
    expect(afterDepletionGrace.nutritionConsumed).toBe(60_000);
    expect(tired.status).toBe('tired');
    expect(tired.fatigueMs).toBe(3_000);
  });

  it('uses the global legacy millisecond interval when roll intervals are disabled', () => {
    const timedLoadout = loadout({
      nutrition: activeNutrition(),
      fallbackSkatesTiming: {
        ...DEFAULT_DUEL_INVENTORY_TIMING,
        stumbleIntervalMinRolls: 0,
        stumbleIntervalMaxRolls: 0,
        stumbleIntervalMinMs: 25_000,
        stumbleIntervalMaxMs: 25_000,
        stumbleDurationMinMs: 300,
        stumbleDurationMaxMs: 300,
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
        skates: activeSkates(),
        nutrition: {
          id: 'nutrition-empty',
          title: 'Изотоник',
          resourceUnit: 'energy_ms' as const,
          resourceAvailable: 0,
          effectPuckSpeedPoints: 0,
          timing: DEFAULT_DUEL_INVENTORY_TIMING,
        },
        fallbackNutritionTiming: {
          ...DEFAULT_DUEL_INVENTORY_TIMING,
          energyBaselineSpeed: 1,
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
        skates: activeSkates(),
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

  it('nutrition depletion feeds accumulated fatigue instead of forcing an immediate stop', () => {
    const common = {
      seed: 'match-seed',
      userId: 'user-a',
      periodNumber: 1,
      movementDistancePx: 0,
      baseLaneWidthPx: 572,
      baselineShooterSpeed: 0.75,
      currentShooterSpeed: 0.75,
      loadout: loadout({
        skates: activeSkates(),
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
    const grace = getDuelPlayerCondition({ ...common, elapsedMs: 12_999 });
    const tired = getDuelPlayerCondition({ ...common, elapsedMs: 13_000 });

    expect(beforeDepletion.status).toBe('normal');
    expect(beforeDepletion.canShoot).toBe(true);
    expect(grace.status).toBe('normal');
    expect(grace.canShoot).toBe(true);
    expect(tired.status).toBe('tired');
    expect(tired.canShoot).toBe(true);
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
