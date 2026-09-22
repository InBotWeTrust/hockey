import { describe, expect, it } from 'vitest';
import { GAME_SETTING_DEFINITIONS, getGameSettings } from '../../src/duel/gameSettings.js';
import { limitWindows } from '../../src/duel/amateur/limitRules.js';

describe('amateur duel limits', () => {
  it('exposes the approved defaults to the admin and gameplay settings', async () => {
    const definitions = new Map(
      GAME_SETTING_DEFINITIONS.map((definition) => [definition.key, definition.defaultValue]),
    );
    expect(definitions.get('amateur.limits.daily')).toBe(8);
    expect(definitions.get('amateur.limits.weekly')).toBe(40);
    expect(definitions.get('amateur.limits.monthly')).toBe(129);
    expect(definitions.get('amateur.limits.per_format_monthly')).toBe(43);
    expect(definitions.get('amateur.limits.outgoing_invites')).toBe(2);

    const settings = await getGameSettings({ query: async () => ({ rows: [] }) } as never);
    expect(settings.amateur.limits).toEqual({
      daily: 8,
      weekly: 40,
      monthly: 129,
      perFormatMonthly: 43,
      outgoingInvites: 2,
    });
  });

  it('uses Moscow calendar boundaries across a month and week transition', () => {
    expect(limitWindows(new Date('2026-09-30T20:59:59.000Z'))).toMatchObject({
      dayStart: new Date('2026-09-29T21:00:00.000Z'),
      weekStart: new Date('2026-09-27T21:00:00.000Z'),
      monthStart: new Date('2026-08-31T21:00:00.000Z'),
      nextDay: new Date('2026-09-30T21:00:00.000Z'),
      nextWeek: new Date('2026-10-04T21:00:00.000Z'),
      nextMonth: new Date('2026-09-30T21:00:00.000Z'),
    });
    expect(limitWindows(new Date('2026-09-30T21:00:00.000Z')).monthStart).toEqual(
      new Date('2026-09-30T21:00:00.000Z'),
    );
  });
});

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
