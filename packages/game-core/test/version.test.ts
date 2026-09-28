import { describe, it, expect } from 'vitest';
import { GAME_CORE_VERSION } from '../src/version.js';

describe('GAME_CORE_VERSION', () => {
  it('is a positive integer', () => {
    expect(Number.isInteger(GAME_CORE_VERSION)).toBe(true);
    expect(GAME_CORE_VERSION).toBeGreaterThan(0);
  });

  it('is bumped for continuous advanced training', () => {
    expect(GAME_CORE_VERSION).toBe(67);
  });
});
