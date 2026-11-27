import { describe, it, expect } from 'vitest';
import { advance, advanceWithTransitions, createMatch } from '../../src/barGames/runtime.js';
describe('pure bar runtime transition trace', () => {
  it.each(['darts', 'checkers', 'billiards', 'ochko', 'armwrestling'] as const)(
    'keeps %s results identical and leaves the input intact',
    (kind) => {
      const initial = createMatch(kind, 1, 1000, true, 2);
      const copy = structuredClone(initial);
      const traced = advanceWithTransitions(initial, 100000);
      expect(traced.runtime).toEqual(advance(initial, 100000));
      expect(initial).toEqual(copy);
      if (traced.runtime !== initial) expect(traced.transitions.length).toBeGreaterThan(0);
    },
  );
});
