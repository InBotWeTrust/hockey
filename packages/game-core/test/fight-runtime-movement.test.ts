import { expect, it } from 'vitest';
import {
  advanceFight,
  createFightState,
  DEFAULT_FIGHT_RULES,
  fightPositionsAt,
} from '../src/index.js';
it.each([5, 6])('keeps simulation and extrapolation aligned for rules %s', (version) => {
  const state = createFightState({ ...DEFAULT_FIGHT_RULES, version, deliveryGraceMs: 0 }, 1000);
  const moved = advanceFight(
    state,
    [
      {
        kind: 'input',
        player: 0,
        seq: 1,
        phaseId: 0,
        effectiveAtMs: 1010,
        input: { direction: -1, crouch: false, guard: false },
      },
    ],
    1010,
  ).state;
  const expected = 0.32 - (version === 6 ? 0.04 : 0.03);
  expect(fightPositionsAt(moved, 1110)[0]).toBeCloseTo(expected);
  expect(fightPositionsAt(advanceFight(moved, [], 1110).state, 1110)[0]).toBeCloseTo(expected);
});
