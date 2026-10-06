import { describe, expect, it } from 'vitest';
import { fightEntranceX } from './fightEntrance.js';
describe('fight arrival', () => {
  it('arrives from opposite edges during the shared countdown and settles with a gap', () => {
    expect(fightEntranceX(320, 0, 0, 1000, 0, false)).toBeLessThan(0);
    expect(fightEntranceX(320, 1, 0, 1000, 0, false)).toBeGreaterThan(320);
    const left = fightEntranceX(320, 0, 0, 1000, 500, false);
    const right = fightEntranceX(320, 1, 0, 1000, 500, false);
    expect(left).toBeLessThan(320 * 0.25);
    expect(right).toBeGreaterThan(320 * 0.75);
    expect(fightEntranceX(320, 0, 0, 1000, 1000, false)).toBeCloseTo(320 * 0.25);
    expect(fightEntranceX(320, 1, 0, 1000, 1000, false)).toBeCloseTo(320 * 0.75);
  });
  it('approaches the bounded standing position without jumping at shared start', () => {
    const width = 430;
    const scale = (width - 16) / 520;
    for (const side of [0, 1] as const) {
      const expected = side === 0 ? 130 * scale + 12 : width - 130 * scale - 12;
      const before = fightEntranceX(width, side, 0, 1000, 999, false, scale);
      const after = fightEntranceX(width, side, 0, 1000, 1000, false, scale);
      expect(after).toBeCloseTo(expected);
      expect(Math.abs(after - before)).toBeLessThan(0.001);
    }
  });
  it('never replays entry in an ongoing fight, sudden death or reduced motion', () => {
    for (const [phase, now, reduced] of [
      [0, 5000, false],
      [1, 0, false],
      [0, 0, true],
    ] as const) {
      expect(fightEntranceX(320, 0, phase, 1000, now, reduced)).toBeCloseTo(320 * 0.25);
      expect(fightEntranceX(320, 1, phase, 1000, now, reduced)).toBeCloseTo(320 * 0.75);
    }
  });
});
