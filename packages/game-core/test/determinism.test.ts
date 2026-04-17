import { describe, it, expect } from 'vitest';
import { simulateGoalie, resolveShot, STICK_NEUTRAL, getGoalie } from '../src/index.js';

describe('end-to-end determinism', () => {
  it('fixed seed + fixed inputs → fixed result (snapshot)', () => {
    const goalie = getGoalie('octopus');
    const seed = 'e2e-seed-42';
    const results = [];
    for (let i = 0; i < 20; i++) {
      const state = simulateGoalie(goalie, seed, i, 1000 + i * 137);
      const res = resolveShot(
        { angle: (i - 10) * 0.05, power: 0.9, releaseTime: 1000 + i * 137 },
        state,
        STICK_NEUTRAL,
      );
      results.push({ shot: i, type: res.type });
    }
    expect(results).toMatchInlineSnapshot(`
      [
        {
          "shot": 0,
          "type": "miss",
        },
        {
          "shot": 1,
          "type": "miss",
        },
        {
          "shot": 2,
          "type": "miss",
        },
        {
          "shot": 3,
          "type": "miss",
        },
        {
          "shot": 4,
          "type": "miss",
        },
        {
          "shot": 5,
          "type": "miss",
        },
        {
          "shot": 6,
          "type": "goal",
        },
        {
          "shot": 7,
          "type": "goal",
        },
        {
          "shot": 8,
          "type": "save",
        },
        {
          "shot": 9,
          "type": "goal",
        },
        {
          "shot": 10,
          "type": "goal",
        },
        {
          "shot": 11,
          "type": "save",
        },
        {
          "shot": 12,
          "type": "save",
        },
        {
          "shot": 13,
          "type": "save",
        },
        {
          "shot": 14,
          "type": "goal",
        },
        {
          "shot": 15,
          "type": "miss",
        },
        {
          "shot": 16,
          "type": "miss",
        },
        {
          "shot": 17,
          "type": "miss",
        },
        {
          "shot": 18,
          "type": "miss",
        },
        {
          "shot": 19,
          "type": "miss",
        },
      ]
    `);
  });
});
