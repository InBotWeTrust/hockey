import { describe, expect, it } from 'vitest';
import { GAME_SETTING_DEFINITIONS, getGameSettings } from '../../src/duel/gameSettings.js';

describe('global duel inventory penalties', () => {
  it('exposes every approved fatigue stage as a global admin setting', () => {
    const definitions = new Map(
      GAME_SETTING_DEFINITIONS.map((definition) => [definition.key, definition.defaultValue]),
    );

    expect(definitions.get('amateur.no_inventory.nutrition.fatigue_grace_ms')).toBe(3_000);
    expect(definitions.get('amateur.no_inventory.nutrition.fatigue_slowdown_start_ms')).toBe(3_000);
    expect(definitions.get('amateur.no_inventory.nutrition.fatigue_heavy_slowdown_start_ms')).toBe(
      8_000,
    );
    expect(definitions.get('amateur.no_inventory.nutrition.fatigue_stop_start_ms')).toBe(13_000);
    expect(definitions.get('amateur.no_inventory.nutrition.fatigue_stop_duration_ms')).toBe(3_000);
    expect(definitions.get('amateur.no_inventory.nutrition.fatigue_after_rest_ms')).toBe(7_000);
    expect(definitions.get('amateur.no_inventory.nutrition.fatigue_slow_multiplier')).toBe(0.85);
    expect(definitions.get('amateur.no_inventory.nutrition.fatigue_heavy_multiplier')).toBe(0.65);
  });

  it('returns approved global skate and energy defaults when the database has no overrides', async () => {
    const settings = await getGameSettings({
      query: async () => ({ rows: [] }),
    } as never);

    expect(settings.amateur.noInventoryTiming.skates).toMatchObject({
      stumbleIntervalMinRolls: 8,
      stumbleIntervalMaxRolls: 20,
      stumbleDurationMinMs: 450,
      stumbleDurationMaxMs: 650,
      stumbleRecoveryMinMs: 150,
      stumbleRecoveryMaxMs: 250,
      stumbleOffsetMinPx: 0,
      stumbleOffsetMaxPx: 0,
    });
    expect(settings.amateur.noInventoryTiming.nutrition).toMatchObject({
      energyBaselineSpeed: 0.75,
      fatigueGraceMs: 3_000,
      fatigueSlowdownStartMs: 3_000,
      fatigueHeavySlowdownStartMs: 8_000,
      fatigueStopStartMs: 13_000,
      fatigueStopDurationMs: 3_000,
      fatigueAfterRestMs: 7_000,
      fatigueSlowMultiplier: 0.85,
      fatigueHeavyMultiplier: 0.65,
    });
  });
});
