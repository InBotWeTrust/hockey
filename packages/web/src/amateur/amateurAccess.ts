import { isAmateurLevelRequired } from '../api/apiFetch.js';
import { showAmateurAccessToast, type AmateurAccessDetails } from './amateurAccessStore.js';

export type AmateurCompetitionLevel = 'beginner' | 'amateur' | 'professional';

export interface AmateurAccessInput {
  competitionLevel?: AmateurCompetitionLevel | null;
  qualifyingGoals?: unknown;
  unlockGoalsRequired?: unknown;
}

export interface AmateurAccessSnapshot {
  competitionLevel: AmateurCompetitionLevel | null;
  qualifyingGoals: number | null;
  unlockGoalsRequired: number | null;
  goalsRemaining: number | null;
  hasFullAccess: boolean;
}

function parseNonNegativeInteger(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !/^(0|[1-9]\d*)$/.test(value)) return null;

  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || !Number.isFinite(parsed)) return null;
  return Math.max(0, parsed);
}

function parseCompetitionLevel(value: unknown): AmateurCompetitionLevel | null {
  if (value === 'beginner' || value === 'amateur' || value === 'professional') return value;
  return null;
}

export function deriveAmateurAccess(input: AmateurAccessInput): AmateurAccessSnapshot {
  const competitionLevel = parseCompetitionLevel(input.competitionLevel);
  const qualifyingGoals = parseNonNegativeInteger(input.qualifyingGoals);
  const unlockGoalsRequired = parseNonNegativeInteger(input.unlockGoalsRequired);
  const goalsRemaining =
    qualifyingGoals === null || unlockGoalsRequired === null
      ? null
      : Math.max(0, unlockGoalsRequired - qualifyingGoals);
  const hasCompleteProgress = qualifyingGoals !== null && unlockGoalsRequired !== null;

  return {
    competitionLevel,
    qualifyingGoals,
    unlockGoalsRequired,
    goalsRemaining,
    hasFullAccess:
      hasCompleteProgress &&
      (competitionLevel === 'amateur' || competitionLevel === 'professional'),
  };
}

export function amateurAccessDetailsFromError(error: unknown): AmateurAccessDetails | null {
  if (!isAmateurLevelRequired(error)) return null;

  const goalsRemaining = parseNonNegativeInteger(error.details?.goalsRemaining);
  const unlockGoalsRequired = parseNonNegativeInteger(error.details?.unlockGoalsRequired);
  if (goalsRemaining === null || unlockGoalsRequired === null) return null;

  return {
    goalsRemaining: Math.min(goalsRemaining, unlockGoalsRequired),
    unlockGoalsRequired,
  };
}

export function showAmateurLevelRequiredError(error: unknown): boolean {
  const details = amateurAccessDetailsFromError(error);
  if (details === null) return false;
  showAmateurAccessToast(details);
  return true;
}

export function guardAmateurMutation(access: AmateurAccessSnapshot, action: () => void): void {
  if (access.hasFullAccess) {
    action();
    return;
  }

  if (access.goalsRemaining === null || access.unlockGoalsRequired === null) return;
  showAmateurAccessToast({
    goalsRemaining: access.goalsRemaining,
    unlockGoalsRequired: access.unlockGoalsRequired,
  });
}
