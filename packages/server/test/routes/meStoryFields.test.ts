import { describe, expect, it } from 'vitest';
import { buildStoryProfileFields } from '../../src/routes/me.js';

describe('buildStoryProfileFields', () => {
  it.each([
    [1, 99, false, 'qualifying'],
    [1, 100, false, 'onboarding_pending'],
    [1, 100, true, 'complete'],
    [2, 40, true, 'complete'],
    [2, 40, false, 'onboarding_pending'],
    [1, 40, true, 'qualifying'],
  ] as const)('reports transition separately from qualification (%s, %s, %s)', (level, goals, completed, status) => {
    expect(buildStoryProfileFields({
      level, lifetime_goals_total: goals,
      beginner_onboarding_completed: true, amateur_onboarding_completed: completed,
    }, { amateur: { unlockGoalsRequired: 100 } })).toHaveProperty('amateurTransitionStatus', status);
  });
  it('exposes completed amateur onboarding for story replay', () => {
    expect(
      buildStoryProfileFields(
        { level: 1, lifetime_goals_total: 100, beginner_onboarding_completed: true, amateur_onboarding_completed: true },
        { amateur: { unlockGoalsRequired: 100 } },
      ),
    ).toHaveProperty('amateurOnboardingCompleted', true);
  });
  it('maps onboarding completion and the live amateur threshold into the profile contract', () => {
    expect(
      buildStoryProfileFields(
        { level: 1, lifetime_goals_total: 100, beginner_onboarding_completed: true, amateur_onboarding_completed: false },
        { amateur: { unlockGoalsRequired: 475 } },
      ),
    ).toEqual({
      beginnerOnboardingCompleted: true,
      amateurOnboardingCompleted: false,
      amateurUnlockGoalsRequired: 475,
      amateurTransitionStatus: 'qualifying',
    });
  });
});
