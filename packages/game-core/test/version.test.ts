import { describe, it, expect } from 'vitest';
import { GAME_CORE_VERSION, isShotCoreVersionCompatible } from '../src/version.js';

describe('GAME_CORE_VERSION', () => {
  it('is a positive integer', () => {
    expect(Number.isInteger(GAME_CORE_VERSION)).toBe(true);
    expect(GAME_CORE_VERSION).toBeGreaterThan(0);
  });

  it('is bumped for the slightly more accurate billiards opponent', () => {
    expect(GAME_CORE_VERSION).toBe(131);
  });
});

describe('shot core compatibility', () => {
  it('preserves sessions from the bar-only releases', () => {
    for (const version of [88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130])
      expect(isShotCoreVersionCompatible(version)).toBe(true);
  });
  it('rejects other physics versions', () => {
    for (const version of [77, 87, 132, NaN])
      expect(isShotCoreVersionCompatible(version)).toBe(false);
  });
});
