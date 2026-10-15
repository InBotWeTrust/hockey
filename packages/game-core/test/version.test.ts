import { describe, it, expect } from 'vitest';
import { GAME_CORE_VERSION, isShotCoreVersionCompatible } from '../src/version.js';

describe('GAME_CORE_VERSION', () => {
  it('is a positive integer', () => {
    expect(Number.isInteger(GAME_CORE_VERSION)).toBe(true);
    expect(GAME_CORE_VERSION).toBeGreaterThan(0);
  });

  it('is bumped for character pacing', () => {
    expect(GAME_CORE_VERSION).toBe(93);
  });
});

describe('shot core compatibility', () => {
  it('preserves sessions from the bar-only releases', () => {
    for (const version of [88, 89, 90, 91, 92, 93])
      expect(isShotCoreVersionCompatible(version)).toBe(true);
  });
  it('rejects other physics versions', () => {
    for (const version of [77, 87, 94, NaN])
      expect(isShotCoreVersionCompatible(version)).toBe(false);
  });
});
