import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ORDINARY_REWARD_SETTINGS,
  ordinaryDuelReward,
} from '../../../src/duel/amateur/ordinaryReward.js';

describe('ordinary duel stars and experience', () => {
  it.each([
    [20, 25, 'equal', 3],
    [100, 115, 'equal', 3],
    [100, 125, 'stronger', 5],
    [1000, 1100, 'equal', 3],
    [1000, 1105, 'stronger', 5],
    [0, 20, 'equal', 3],
    [0, 21, 'stronger', 5],
    [125, 100, 'weaker', 2],
  ] as const)('classifies %i vs %i as %s', (mine, theirs, category, amount) => {
    expect(ordinaryDuelReward(DEFAULT_ORDINARY_REWARD_SETTINGS, 'win', mine, theirs, true))
      .toEqual({ category, stars: amount, experience: amount });
  });

  it('gives experience only for a draw or completed loss, and nothing for a no-show', () => {
    expect(ordinaryDuelReward(DEFAULT_ORDINARY_REWARD_SETTINGS, 'draw', 100, 100, true))
      .toEqual({ category: 'draw', stars: 0, experience: 2 });
    expect(ordinaryDuelReward(DEFAULT_ORDINARY_REWARD_SETTINGS, 'loss', 100, 100, true))
      .toEqual({ category: 'loss', stars: 0, experience: 1 });
    expect(ordinaryDuelReward(DEFAULT_ORDINARY_REWARD_SETTINGS, 'loss', 100, 100, false))
      .toEqual({ category: 'noShow', stars: 0, experience: 0 });
  });
});
