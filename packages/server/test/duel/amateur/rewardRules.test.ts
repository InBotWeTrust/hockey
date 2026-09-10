import { describe, expect, it } from 'vitest';
import {
  classifyExperienceOpponent,
  selectDuelReward,
  type DuelRewardRules,
} from '../../../src/duel/amateur/rewardRules.js';

const rules: DuelRewardRules = {
  equalExperienceTolerancePercent: 10,
  strongerWin: { coins: 30, stars: 3, tokens: 2 },
  equalWin: { coins: 20, stars: 2, tokens: 1 },
  weakerWin: { coins: 10, stars: 1, tokens: 0 },
  draw: { coins: 5, stars: 0, tokens: 0 },
  loss: { coins: 0, stars: 0, tokens: 0 },
};

describe('duel reward rules', () => {
  it('classifies opponent experience at inclusive equal-range boundaries', () => {
    expect(classifyExperienceOpponent(1_000, 899, 10)).toBe('weaker');
    expect(classifyExperienceOpponent(1_000, 900, 10)).toBe('equal');
    expect(classifyExperienceOpponent(1_000, 1_100, 10)).toBe('equal');
    expect(classifyExperienceOpponent(1_000, 1_101, 10)).toBe('stronger');
  });

  it('keeps non-decimal percentage boundaries inclusive', () => {
    expect(classifyExperienceOpponent(100, 43, 57)).toBe('equal');
    expect(classifyExperienceOpponent(100, 157, 57)).toBe('equal');
  });

  it('treats two zero-experience players as equal and a positive opponent as stronger', () => {
    expect(classifyExperienceOpponent(0, 0, 10)).toBe('equal');
    expect(classifyExperienceOpponent(0, 1, 10)).toBe('stronger');
  });

  it('selects the matching configured reward', () => {
    expect(selectDuelReward(rules, 'win', 1_000, 1_101)).toEqual(rules.strongerWin);
    expect(selectDuelReward(rules, 'win', 1_000, 1_000)).toEqual(rules.equalWin);
    expect(selectDuelReward(rules, 'win', 1_000, 899)).toEqual(rules.weakerWin);
    expect(selectDuelReward(rules, 'draw', 1_000, 1_000)).toEqual(rules.draw);
    expect(selectDuelReward(rules, 'loss', 1_000, 1_000)).toEqual(rules.loss);
  });
});
