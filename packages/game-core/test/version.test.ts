import { describe, it, expect } from 'vitest';
import { GAME_CORE_VERSION, isShotCoreVersionCompatible } from '../src/version.js';

describe('GAME_CORE_VERSION', () => {
  it('is a positive integer', () => {
    expect(Number.isInteger(GAME_CORE_VERSION)).toBe(true);
    expect(GAME_CORE_VERSION).toBeGreaterThan(0);
  });

  it('is bumped for strict duel Rhythm series', () => {
    expect(GAME_CORE_VERSION).toBe(115);
  });
});

describe('shot core compatibility', () => {
  it('preserves sessions from the bar-only releases', () => {
    for (const version of [88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115])
      expect(isShotCoreVersionCompatible(version)).toBe(true);
  });
  it('rejects other physics versions', () => {
    for (const version of [77, 87, 116, NaN])
      expect(isShotCoreVersionCompatible(version)).toBe(false);
  });
});
