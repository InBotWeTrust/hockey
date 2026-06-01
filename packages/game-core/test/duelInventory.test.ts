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

  it('nutrition depletion slows then fully stops the player', () => {
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

    expect(getDuelPlayerCondition({ ...common, elapsedMs: 10_500 }).status).toBe(
      'nutrition_slowdown',
    );
    const stopped = getDuelPlayerCondition({ ...common, elapsedMs: 12_500 });
    expect(stopped.status).toBe('exhausted_stop');
    expect(stopped.canShoot).toBe(false);
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
