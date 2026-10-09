import { describe, expect, it } from 'vitest';
import { buildStoryProfileFields } from '../../src/routes/me.js';

describe('buildStoryProfileFields', () => {
  it('exposes completed amateur onboarding for story replay', () => {
    expect(
      buildStoryProfileFields(
        { beginner_onboarding_completed: true, amateur_onboarding_completed: true },
        { amateur: { unlockGoalsRequired: 100 } },
      ),
    ).toHaveProperty('amateurOnboardingCompleted', true);
  });
  it('maps onboarding completion and the live amateur threshold into the profile contract', () => {
    expect(
      buildStoryProfileFields(
        { beginner_onboarding_completed: true, amateur_onboarding_completed: false },
        { amateur: { unlockGoalsRequired: 475 } },
      ),
    ).toEqual({
      beginnerOnboardingCompleted: true,
      amateurOnboardingCompleted: false,
      amateurUnlockGoalsRequired: 475,
    });
  });
});
