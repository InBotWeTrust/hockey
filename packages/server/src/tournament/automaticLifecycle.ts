import type { TournamentPlayoffSize, TournamentStatus } from './types.js';

export const AUTOMATIC_TOURNAMENT_LIFECYCLE_VERSION = 1;

export type TournamentLifecycleAction =
  | 'legacy_requires_audit'
  | 'registration_waiting'
  | 'registration_open'
  | 'generate_schedule'
  | 'block_registration'
  | 'await_manual_regular_start'
  | 'regular_active'
  | 'await_regular_results'
  | 'await_playoff_time'
  | 'start_playoff'
  | 'playoff_active'
  | 'terminal'
  | 'unchanged';

export interface TournamentLifecycleSnapshot {
  tournamentId: string;
  status: TournamentStatus;
  revision: number;
  automaticLifecycleVersion: number | null;
  registrationOpensAt: Date | null;
  registrationClosesAt: Date | null;
  approvedParticipantCount: number;
  playoffSize: TournamentPlayoffSize;
  scheduleExists: boolean;
  regularResultsComplete: boolean;
  playoffStartsAt: Date | null;
}

export interface TournamentLifecycleDecision {
  action: TournamentLifecycleAction;
  dueAt: Date | null;
  approvedParticipantCount: number;
  requiredParticipantCount: number;
  reason: 'not_enough_participants' | 'regular_results_incomplete' | 'legacy_requires_audit' | null;
}

export function automaticLifecycleVersion(rules: Record<string, unknown>): number | null {
  return rules.automaticLifecycleVersion === AUTOMATIC_TOURNAMENT_LIFECYCLE_VERSION
    ? AUTOMATIC_TOURNAMENT_LIFECYCLE_VERSION
    : null;
}

function decision(
  snapshot: TournamentLifecycleSnapshot,
  action: TournamentLifecycleAction,
  dueAt: Date | null = null,
  reason: TournamentLifecycleDecision['reason'] = null,
): TournamentLifecycleDecision {
  return {
    action,
    dueAt: dueAt === null ? null : new Date(dueAt),
    approvedParticipantCount: snapshot.approvedParticipantCount,
    requiredParticipantCount: snapshot.playoffSize,
    reason,
  };
}

function isTerminalStatus(status: TournamentStatus): boolean {
  return status === 'completed' || status === 'cancelled' || status === 'archived';
}

export function evaluateTournamentLifecycle(
  snapshot: TournamentLifecycleSnapshot,
  now: Date,
): TournamentLifecycleDecision {
  if (snapshot.automaticLifecycleVersion !== AUTOMATIC_TOURNAMENT_LIFECYCLE_VERSION) {
    return decision(snapshot, 'legacy_requires_audit', null, 'legacy_requires_audit');
  }

  if (isTerminalStatus(snapshot.status)) return decision(snapshot, 'terminal');

  if (snapshot.status === 'registration') {
    const { registrationOpensAt, registrationClosesAt } = snapshot;
    if (registrationOpensAt === null || registrationClosesAt === null) {
      return decision(snapshot, 'unchanged');
    }
    if (now < registrationOpensAt) {
      return decision(snapshot, 'registration_waiting', registrationOpensAt);
    }
    if (now < registrationClosesAt) {
      return decision(snapshot, 'registration_open', registrationClosesAt);
    }
    if (snapshot.approvedParticipantCount < snapshot.playoffSize) {
      return decision(snapshot, 'block_registration', null, 'not_enough_participants');
    }
    return decision(snapshot, 'generate_schedule');
  }

  if (snapshot.status === 'scheduling') {
    return decision(snapshot, snapshot.scheduleExists ? 'await_manual_regular_start' : 'unchanged');
  }

  if (snapshot.status === 'regular') {
    if (!snapshot.regularResultsComplete) {
      if (snapshot.playoffStartsAt !== null && now >= snapshot.playoffStartsAt) {
        return decision(snapshot, 'await_regular_results', null, 'regular_results_incomplete');
      }
      return decision(snapshot, 'regular_active', snapshot.playoffStartsAt);
    }
    if (snapshot.playoffStartsAt === null || now < snapshot.playoffStartsAt) {
      return decision(snapshot, 'await_playoff_time', snapshot.playoffStartsAt);
    }
    return decision(snapshot, 'start_playoff');
  }

  if (snapshot.status === 'playoff') return decision(snapshot, 'playoff_active');

  return decision(snapshot, 'unchanged');
}
