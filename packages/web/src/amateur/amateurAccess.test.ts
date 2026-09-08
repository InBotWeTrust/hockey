import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/apiFetch.js';
import {
  amateurAccessDetailsFromError,
  deriveAmateurAccess,
  guardAmateurMutation,
  showAmateurLevelRequiredError,
  wasAmateurLevelRequiredErrorHandled,
} from './amateurAccess.js';
import { useAmateurAccessToastStore } from './amateurAccessStore.js';

describe('Amateur access helpers', () => {
  beforeEach(() => {
    useAmateurAccessToastStore.setState({ toast: null, sequence: 0 });
  });

  it('derives a safe beginner snapshot from current profile progress', () => {
    expect(
      deriveAmateurAccess({
        competitionLevel: 'beginner',
        qualifyingGoals: 116,
        unlockGoalsRequired: 300,
      }),
    ).toEqual({
      competitionLevel: 'beginner',
      qualifyingGoals: 116,
      unlockGoalsRequired: 300,
      goalsRemaining: 184,
      hasFullAccess: false,
    });
  });

  it('does not optimistically authorize while the competition level is unknown', () => {
    expect(
      deriveAmateurAccess({
        qualifyingGoals: 300,
        unlockGoalsRequired: 300,
      }),
    ).toMatchObject({ hasFullAccess: false, goalsRemaining: 0 });
  });

  it.each(['amateur', 'professional'] as const)(
    'does not authorize a %s level until the complete progress snapshot is available',
    (competitionLevel) => {
      expect(deriveAmateurAccess({ competitionLevel })).toMatchObject({
        hasFullAccess: false,
        qualifyingGoals: null,
        unlockGoalsRequired: null,
        goalsRemaining: null,
      });
      expect(deriveAmateurAccess({ competitionLevel, qualifyingGoals: 300 })).toMatchObject({
        hasFullAccess: false,
        unlockGoalsRequired: null,
        goalsRemaining: null,
      });
      expect(deriveAmateurAccess({ competitionLevel, unlockGoalsRequired: 300 })).toMatchObject({
        hasFullAccess: false,
        qualifyingGoals: null,
        goalsRemaining: null,
      });
    },
  );

  it.each(['amateur', 'professional'] as const)(
    'does not authorize a %s level with malformed progress values',
    (competitionLevel) => {
      expect(
        deriveAmateurAccess({
          competitionLevel,
          qualifyingGoals: 'not-a-count',
          unlockGoalsRequired: 300,
        }),
      ).toMatchObject({ hasFullAccess: false, qualifyingGoals: null, goalsRemaining: null });
      expect(
        deriveAmateurAccess({
          competitionLevel,
          qualifyingGoals: 300,
          unlockGoalsRequired: Number.NaN,
        }),
      ).toMatchObject({ hasFullAccess: false, unlockGoalsRequired: null, goalsRemaining: null });
    },
  );

  it('authorizes Amateur and professional levels with a complete valid progress snapshot', () => {
    expect(
      deriveAmateurAccess({
        competitionLevel: 'amateur',
        qualifyingGoals: 300,
        unlockGoalsRequired: 300,
      }).hasFullAccess,
    ).toBe(true);
    expect(
      deriveAmateurAccess({
        competitionLevel: 'professional',
        qualifyingGoals: 512,
        unlockGoalsRequired: 300,
      }).hasFullAccess,
    ).toBe(true);
  });

  it('sanitizes numeric server details without accepting ambiguous values', () => {
    const error = new ApiError(403, 'amateur_level_required', 'internal copy', {
      goalsRemaining: '184',
      unlockGoalsRequired: 300,
    });

    expect(amateurAccessDetailsFromError(error)).toEqual({
      goalsRemaining: 184,
      unlockGoalsRequired: 300,
    });

    expect(
      amateurAccessDetailsFromError(
        new ApiError(403, 'amateur_level_required', 'internal copy', {
          goalsRemaining: '',
          unlockGoalsRequired: 300,
        }),
      ),
    ).toBeNull();
    expect(
      amateurAccessDetailsFromError(
        new ApiError(403, 'amateur_level_required', 'internal copy', {
          goalsRemaining: Number.POSITIVE_INFINITY,
          unlockGoalsRequired: 300,
        }),
      ),
    ).toBeNull();
  });

  it.each(['3e2', '0x12c', '+300', ' 300', '300 ', '300.0', '0300', '-4'])(
    'rejects the ambiguous count string %j',
    (ambiguousCount) => {
      expect(
        amateurAccessDetailsFromError(
          new ApiError(403, 'amateur_level_required', 'internal copy', {
            goalsRemaining: ambiguousCount,
            unlockGoalsRequired: 300,
          }),
        ),
      ).toBeNull();
      expect(
        deriveAmateurAccess({
          competitionLevel: 'amateur',
          qualifyingGoals: 300,
          unlockGoalsRequired: ambiguousCount,
        }).hasFullAccess,
      ).toBe(false);
    },
  );

  it('clamps negative and inconsistent remaining goals before presenting them', () => {
    expect(
      amateurAccessDetailsFromError(
        new ApiError(403, 'amateur_level_required', 'internal copy', {
          goalsRemaining: -4,
          unlockGoalsRequired: 300,
        }),
      ),
    ).toEqual({ goalsRemaining: 0, unlockGoalsRequired: 300 });
    expect(
      amateurAccessDetailsFromError(
        new ApiError(403, 'amateur_level_required', 'internal copy', {
          goalsRemaining: 999,
          unlockGoalsRequired: 300,
        }),
      ),
    ).toEqual({ goalsRemaining: 300, unlockGoalsRequired: 300 });
  });

  it('runs a guarded mutation only with confirmed full Amateur access', () => {
    const beginnerAction = vi.fn();
    const amateurAction = vi.fn();

    guardAmateurMutation(
      deriveAmateurAccess({
        competitionLevel: 'beginner',
        qualifyingGoals: 116,
        unlockGoalsRequired: 300,
      }),
      beginnerAction,
    );
    guardAmateurMutation(
      deriveAmateurAccess({
        competitionLevel: 'amateur',
        qualifyingGoals: 300,
        unlockGoalsRequired: 300,
      }),
      amateurAction,
    );

    expect(beginnerAction).not.toHaveBeenCalled();
    expect(amateurAction).toHaveBeenCalledOnce();
    expect(useAmateurAccessToastStore.getState().toast).toMatchObject({ goalsRemaining: 184 });
  });

  it('maps a structured server restriction to the shared toast without raw copy', () => {
    const error = new ApiError(403, 'amateur_level_required', 'database policy denied', {
      goalsRemaining: 184,
      unlockGoalsRequired: 300,
    });
    const handled = showAmateurLevelRequiredError(error);

    expect(handled).toBe(true);
    expect(wasAmateurLevelRequiredErrorHandled(error)).toBe(true);
    expect(useAmateurAccessToastStore.getState().toast).toMatchObject({
      goalsRemaining: 184,
      unlockGoalsRequired: 300,
    });
  });

  it('leaves malformed or unrelated API failures to generic error handling', () => {
    const malformed = new ApiError(403, 'amateur_level_required', 'internal copy', {
      goalsRemaining: 'many',
      unlockGoalsRequired: 300,
    });
    expect(showAmateurLevelRequiredError(new Error('offline'))).toBe(false);
    expect(showAmateurLevelRequiredError(malformed)).toBe(false);
    expect(wasAmateurLevelRequiredErrorHandled(malformed)).toBe(false);
    expect(useAmateurAccessToastStore.getState().toast).toBeNull();
  });
});
