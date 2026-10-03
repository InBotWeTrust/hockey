import { describe, expect, it } from 'vitest';
import { buildStoryProfileFields } from '../../src/routes/me.js';

describe('buildStoryProfileFields', () => {
  it('maps onboarding completion and the live amateur threshold into the profile contract', () => {
    expect(
      buildStoryProfileFields(
        { beginner_onboarding_completed: true },
        { amateur: { unlockGoalsRequired: 475 } },
      ),
    ).toEqual({
      beginnerOnboardingCompleted: true,
      amateurUnlockGoalsRequired: 475,
    });
  });
});
