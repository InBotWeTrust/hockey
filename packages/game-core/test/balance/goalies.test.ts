import { describe, it, expect } from 'vitest';
import { GOALIES, getGoalie } from '../../src/balance/goalies.js';
import { simulateGoalie } from '../../src/goalie/simulate.js';

describe('GOALIES catalog', () => {
  it('has exactly 10 entries', () => {
    expect(GOALIES).toHaveLength(10);
  });

  it('all ids are unique', () => {
    const ids = GOALIES.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('HP is strictly increasing', () => {
    for (let i = 1; i < GOALIES.length; i++) {
      expect(GOALIES[i]!.hp).toBeGreaterThan(GOALIES[i - 1]!.hp);
    }
  });

  it('every catalog entry is playable (no pattern throws)', () => {
    for (const g of GOALIES) {
      expect(() => simulateGoalie(g, 'test-seed', 0, 500)).not.toThrow();
    }
  });

  it('first-clear bonus is strictly increasing', () => {
    for (let i = 1; i < GOALIES.length; i++) {
      expect(GOALIES[i]!.firstClearBonus).toBeGreaterThan(GOALIES[i - 1]!.firstClearBonus);
    }
  });

  it('getGoalie returns config or throws', () => {
    expect(getGoalie('rookie').name).toBe('Новичок');
    expect(() => getGoalie('nonexistent')).toThrow();
  });
});
