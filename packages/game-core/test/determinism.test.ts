import { describe, it, expect } from 'vitest';
import { resolveShot, STICK_NEUTRAL, getGoalie } from '../src/index.js';

describe('end-to-end determinism', () => {
  it('fixed seed + fixed inputs → stable snapshot of results', () => {
    const goalie = getGoalie('octopus');
    const seed = 'e2e-seed-42';
    const results: Array<{ shot: number; type: string }> = [];
    for (let i = 0; i < 20; i++) {
      const tapTime = 1000 + i * 137;
      const res = resolveShot({ tapTime }, goalie, seed, i, STICK_NEUTRAL);
      results.push({ shot: i, type: res.type });
    }
    // Snapshot regenerates on first run — the value here is regression
    // coverage: any future change to simulate* or resolveShot that shifts
    // results will fail this test.
    expect(results).toMatchSnapshot();
  });
});
