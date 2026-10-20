import type { BonusSkillCode } from './bonusGames/types.js';

// Temporary production rollout gates. Keep catalog data visible while starts are disabled.
export const INITIAL_TRAINING_RELEASED = false;
export const ADVANCED_TRAINING_RELEASED = false;
export const REQUIRE_BEGINNER_TRAINING_FOR_ADVANCED = false;

const RELEASED_BONUS_SKILLS = new Set<BonusSkillCode>(['speed', 'accuracy']);

export function isBonusSkillReleased(skillCode: BonusSkillCode): boolean {
  return RELEASED_BONUS_SKILLS.has(skillCode);
}
