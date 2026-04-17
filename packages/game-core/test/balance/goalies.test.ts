import { describe, it, expect } from 'vitest';
import { GOALIES, getGoalie } from '../../src/balance/goalies.js';

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
      expect(GOALIES[i]!.hp).toBeGreaterThanOrEqual(GOALIES[i - 1]!.hp);
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
