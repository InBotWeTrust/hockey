import { setImmediate } from 'node:timers/promises';
import { describe, expect, it } from 'vitest';
import { createRhythmMovementSampler } from '@hockey/game-core';
import { warmRhythmHistory } from '../../../src/duel/amateur/rhythmHistory.js';

describe('settled rhythm history rendering', () => {
  it('lets other requests run before completing a long history replay', async () => {
    const sampled: number[] = [];
    const pending = warmRhythmHistory({ motionAt: (time) => { sampled.push(time); return time; } }, 150_000, []);
    await setImmediate();
    expect(sampled.at(-1) ?? 0).toBeLessThan(150_000);
    await pending;
    expect(sampled.at(-1)).toBe(150_000);
    expect(sampled.every((time, index) => time - (sampled[index - 1] ?? 0) <= 5000)).toBe(true);
  });

  it('preserves travel, contacts and condition when warming the same accepted shot history', async () => {
    const input = { seed: 'settled-history', userId: 'player', periodNumber: 1, elapsedMs: 0,
      movementDistancePx: 0, baseLaneWidthPx: 600, baselineShooterSpeed: 0.75,
      currentShooterSpeed: 0.75, loadout: { stick: null, skates: null, nutrition: null } };
    const pauses = [{ tapTime: 1000, flightMs: 500 }, { tapTime: 7000, flightMs: 750 }];
    const direct = createRhythmMovementSampler(input);
    const warmed = createRhythmMovementSampler(input);
    await warmRhythmHistory(warmed, 12_345, pauses);
    expect(warmed.travelAt(12_345, pauses)).toBe(direct.travelAt(12_345, pauses));
    expect(warmed.boardContactsAt(12_345, pauses)).toBe(direct.boardContactsAt(12_345, pauses));
    expect(warmed.conditionAt(12_345, pauses)).toEqual(direct.conditionAt(12_345, pauses));
  });
});
