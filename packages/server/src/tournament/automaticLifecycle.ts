import type { Pool } from 'pg';
import { enqueueTournamentPush } from '../push/tournament.js';
import { generateRegularSchedule, type TournamentRulesSnapshot } from './service.js';
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

export interface ReconcileTournamentLifecycleOptions {
  now: Date;
  tournamentId?: string;
  classicSeedSecret?: string;
  dryRun?: boolean;
}

export interface TournamentLifecycleReconcileItem {
  tournamentId: string;
  before: TournamentStatus;
  after: TournamentStatus;
  action: TournamentLifecycleAction;
  changed: boolean;
  reason: TournamentLifecycleDecision['reason'];
}

export interface TournamentLifecycleReconcileReport {
  scanned: number;
  changed: number;
  items: TournamentLifecycleReconcileItem[];
}

interface LifecycleRow {
  id: string;
  status: TournamentStatus;
  current_revision: number;
  created_by: string;
  title: string;
  registration_opens_at: Date | null;
  registration_closes_at: Date | null;
  rules_snapshot: TournamentRulesSnapshot;
  approved_participant_count: number;
  schedule_exists: boolean;
  regular_results_complete: boolean;
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

function tournamentLifecycleSnapshot(row: LifecycleRow): TournamentLifecycleSnapshot {
  return {
    tournamentId: row.id,
    status: row.status,
    revision: Number(row.current_revision),
    automaticLifecycleVersion: automaticLifecycleVersion(row.rules_snapshot),
    registrationOpensAt: row.registration_opens_at,
    registrationClosesAt: row.registration_closes_at,
    approvedParticipantCount: Number(row.approved_participant_count),
    playoffSize: row.rules_snapshot.config.playoffSize,
    scheduleExists: row.schedule_exists,
    regularResultsComplete: row.regular_results_complete,
    playoffStartsAt: null,
  };
}

async function loadLifecycleRows(
  pool: Pool,
  tournamentId: string | undefined,
): Promise<LifecycleRow[]> {
  const { rows } = await pool.query<LifecycleRow>(
    `select t.id, t.status, t.current_revision, t.created_by::text, t.title,
            t.registration_opens_at, t.registration_closes_at, revision.rules_snapshot,
            (
              select count(*)::int from tournament_participant participant
               where participant.tournament_id = t.id and participant.state = 'approved'
            ) as approved_participant_count,
            exists(
              select 1 from tournament_matchday matchday where matchday.tournament_id = t.id
            ) as schedule_exists,
            not exists(
              select 1
                from tournament_fixture fixture
                join tournament_round round on round.id = fixture.round_id
               where fixture.tournament_id = t.id
                 and round.stage in ('regular', 'tiebreak')
                 and fixture.status not in ('settled', 'forfeit', 'cancelled')
            ) as regular_results_complete
       from tournament t
       join tournament_revision revision on revision.id = t.published_revision_id
      where ($1::uuid is null or t.id = $1)
      order by t.created_at, t.id`,
    [tournamentId ?? null],
  );
  return rows;
}

function plannedAfterStatus(
  before: TournamentStatus,
  action: TournamentLifecycleAction,
): TournamentStatus {
  if (action === 'generate_schedule') return 'scheduling';
  if (action === 'block_registration') return 'registration_blocked';
  return before;
}

async function enqueueRegistrationBlockedPushes(
  pool: Pool,
  row: LifecycleRow,
  snapshot: TournamentLifecycleSnapshot,
): Promise<void> {
  const recipients = await pool.query<{ id: string }>(
    `select distinct id::text as id
       from users
      where id = $1 or role = 'admin'`,
    [row.created_by],
  );
  const eventKey = `${row.id}:registration-blocked:${snapshot.revision}`;
  for (const recipient of recipients.rows) {
    await enqueueTournamentPush(pool, {
      userId: recipient.id,
      tournamentId: row.id,
      eventType: 'tournament.registration_blocked',
      eventKey,
      variables: {
        tournamentTitle: row.title,
        approvedCount: snapshot.approvedParticipantCount,
        requiredCount: snapshot.playoffSize,
      },
      fallback: {
        title: 'Турнир требует внимания',
        body: `В турнире «${row.title}» подтверждено ${snapshot.approvedParticipantCount} из ${snapshot.playoffSize} участников.`,
        url: '/admin',
      },
    });
  }
}

export async function reconcileTournamentLifecycle(
  pool: Pool,
  options: ReconcileTournamentLifecycleOptions,
): Promise<TournamentLifecycleReconcileReport> {
  if (Number.isNaN(options.now.getTime())) throw new Error('now must be a valid date');
  const rows = await loadLifecycleRows(pool, options.tournamentId);
  const items: TournamentLifecycleReconcileItem[] = [];

  for (const row of rows) {
    const snapshot = tournamentLifecycleSnapshot(row);
    const lifecycleDecision = evaluateTournamentLifecycle(snapshot, options.now);
    let after = snapshot.status;
    let changed = false;

    if (options.dryRun === true) {
      after = plannedAfterStatus(snapshot.status, lifecycleDecision.action);
    } else if (
      lifecycleDecision.action === 'generate_schedule' ||
      lifecycleDecision.action === 'block_registration'
    ) {
      const result = await generateRegularSchedule(pool, snapshot.tournamentId, snapshot.revision);
      after = result.status;
      changed = after !== snapshot.status;
      if (lifecycleDecision.action === 'block_registration' && after === 'registration_blocked') {
        await enqueueRegistrationBlockedPushes(pool, row, snapshot);
      }
    } else if (
      snapshot.status === 'registration_blocked' &&
      snapshot.automaticLifecycleVersion === AUTOMATIC_TOURNAMENT_LIFECYCLE_VERSION
    ) {
      await enqueueRegistrationBlockedPushes(pool, row, snapshot);
    }

    items.push({
      tournamentId: snapshot.tournamentId,
      before: snapshot.status,
      after,
      action: lifecycleDecision.action,
      changed,
      reason: lifecycleDecision.reason,
    });
  }

  return {
    scanned: items.length,
    changed: items.filter((item) => item.changed).length,
    items,
  };
}
