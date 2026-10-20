import { describe, expect, it } from 'vitest';
import {
  ADVANCED_TRAINING_RELEASED,
  INITIAL_TRAINING_RELEASED,
  REQUIRE_BEGINNER_TRAINING_FOR_ADVANCED,
  isBonusSkillReleased,
} from '../src/releaseGates.js';

describe('production release gates', () => {
  it('keeps both course sections visible but unavailable for starts', () => {
    expect(INITIAL_TRAINING_RELEASED).toBe(false);
    expect(ADVANCED_TRAINING_RELEASED).toBe(false);
  });

  it('keeps legacy bonus skills playable and closes the two new skills', () => {
    expect(isBonusSkillReleased('speed')).toBe(true);
    expect(isBonusSkillReleased('accuracy')).toBe(true);
    expect(isBonusSkillReleased('marksmanship')).toBe(false);
    expect(isBonusSkillReleased('endurance')).toBe(false);
  });

  it('temporarily removes beginner course completion from advanced access', () => {
    expect(REQUIRE_BEGINNER_TRAINING_FOR_ADVANCED).toBe(false);
  });
});
