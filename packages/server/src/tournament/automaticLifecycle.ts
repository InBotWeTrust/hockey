import type { Pool } from 'pg';
import { AppError } from '../plugins/errors.js';
import { finalizeClassicTournamentDay } from './classicGame.js';
import { finalizeTournamentDailyDay } from './dailyAggregate.js';
import { enqueueTournamentPush } from '../push/tournament.js';
import { zonedDateTimeToUtc } from './schedule.js';
import {
  generateRegularSchedule,
  startTournamentPlayoffs,
  type GenerateRegularScheduleOutcome,
  type TournamentRulesSnapshot,
} from './service.js';
import { lockTournament } from './locks.js';
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
  registration_opens_at: Date | null;
  registration_closes_at: Date | null;
  rules_snapshot: TournamentRulesSnapshot;
  approved_participant_count: number;
  schedule_exists: boolean;
  regular_results_complete: boolean;
}

function objectRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseLocalDateTime(localDate: string, localTime: string) {
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  const time = /^(\d{2}):(\d{2})$/.exec(localTime);
  if (!date || !time) return null;
  return {
    year: Number(date[1]),
    month: Number(date[2]),
    day: Number(date[3]),
    hour: Number(time[1]),
    minute: Number(time[2]),
    second: 0,
  };
}

/** The first scheduled playoff game is the lifecycle deadline, not tournament start. */
export function configuredPlayoffStartAt(rules: TournamentRulesSnapshot): Date | null {
  const configured = Array.isArray(rules.playoffRounds)
    ? rules.playoffRounds
        .map(objectRecord)
        .sort((left, right) => Number(left.roundNumber ?? 0) - Number(right.roundNumber ?? 0))[0]
    : undefined;
  if (configured === undefined) return null;
  const scheduleDays = Array.isArray(configured.scheduleDays)
    ? configured.scheduleDays.map(objectRecord)
    : [];
  const firstDay = scheduleDays[0];
  if (firstDay !== undefined) {
    const localDate = typeof firstDay.localDate === 'string' ? firstDay.localDate : '';
    const localTime =
      typeof firstDay.firstWaveLocalTime === 'string' ? firstDay.firstWaveLocalTime : '';
    const parts = parseLocalDateTime(localDate, localTime);
    if (parts === null) return null;
    try {
      return zonedDateTimeToUtc(parts, rules.config.timezone);
    } catch {
      return null;
    }
  }
  if (typeof configured.firstGameStartsAt !== 'string') return null;
  const scheduled = new Date(configured.firstGameStartsAt);
  return Number.isNaN(scheduled.getTime()) ? null : scheduled;
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
    playoffStartsAt: configuredPlayoffStartAt(row.rules_snapshot),
  };
}

async function finalizeExpiredRegularDays(
  pool: Pool,
  row: LifecycleRow,
  options: ReconcileTournamentLifecycleOptions,
): Promise<void> {
  const source = row.rules_snapshot.config.regularSource;
  if (row.status !== 'regular' || source === 'head_to_head') return;
  const matchdays = await pool.query<{ number: number }>(
    `select number from tournament_matchday
      where tournament_id = $1 and status <> 'cancelled' and ends_at <= $2
      order by number`,
    [row.id, options.now],
  );
  for (const matchday of matchdays.rows) {
    try {
      if (source === 'daily_aggregate') {
        await finalizeTournamentDailyDay(pool, {
          tournamentId: row.id,
          tournamentDay: Number(matchday.number),
          now: options.now,
        });
      } else if (options.classicSeedSecret !== undefined) {
        await finalizeClassicTournamentDay(pool, {
          tournamentId: row.id,
          tournamentDay: Number(matchday.number),
          now: options.now,
          seedSecret: options.classicSeedSecret,
        });
      }
    } catch (error) {
      if (!(error instanceof AppError) || error.code !== 'day_not_closed') throw error;
    }
  }
}

async function regularResultsComplete(pool: Pool, row: LifecycleRow): Promise<boolean> {
  const source = row.rules_snapshot.config.regularSource;
  if (source === 'head_to_head') {
    const { rows } = await pool.query<{ fixture_count: number; terminal_count: number }>(
      `select count(fixture.id)::int as fixture_count,
              count(fixture.id) filter (
                where fixture.status in ('settled', 'forfeit', 'cancelled')
              )::int as terminal_count
         from tournament_round round
         left join tournament_fixture fixture on fixture.round_id = round.id
        where round.tournament_id = $1 and round.stage = 'regular'`,
      [row.id],
    );
    const counts = rows[0];
    return (
      counts !== undefined &&
      Number(counts.fixture_count) > 0 &&
      Number(counts.fixture_count) === Number(counts.terminal_count)
    );
  }
  const { rows } = await pool.query<{ participant_count: number; result_count: number }>(
    `select count(distinct participant.id)::int as participant_count,
            count(result.id)::int as result_count
       from tournament_participant participant
       left join tournament_daily_result result
         on result.tournament_id = participant.tournament_id
        and result.participant_id = participant.id
        and result.tournament_day between 1 and $2
      where participant.tournament_id = $1
        and participant.state in ('approved', 'withdrawn', 'removed', 'disqualified')`,
    [row.id, row.rules_snapshot.config.dailyDays],
  );
  const counts = rows[0];
  return (
    counts !== undefined &&
    Number(counts.result_count) ===
      Number(counts.participant_count) * row.rules_snapshot.config.dailyDays
  );
}

async function enqueuePlayoffBlockedPushes(pool: Pool, tournamentId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await lockTournament(client, tournamentId);
    const tournament = await client.query<{
      status: TournamentStatus;
      title: string;
      current_revision: number;
      created_by: string;
    }>(
      `select status, title, current_revision, created_by from tournament where id = $1 for update`,
      [tournamentId],
    );
    const row = tournament.rows[0];
    if (row?.status === 'regular') {
      const recipients = await client.query<{ id: string }>(
        `select distinct id::text as id from users where id = $1 or role = 'admin'`,
        [row.created_by],
      );
      const eventKey = `${tournamentId}:playoff-blocked:${Number(row.current_revision)}`;
      for (const recipient of recipients.rows) {
        const previous = await client.query<{ exists: boolean }>(
          `select exists(
             select 1 from push_delivery_log
              where user_id = $1 and event_type = 'tournament.playoff_blocked'
                and event_key like $2 || '%'
           ) as exists`,
          [recipient.id, `${tournamentId}:playoff-blocked:`],
        );
        if (previous.rows[0]!.exists) continue;
        await enqueueTournamentPush(client, {
          userId: recipient.id,
          tournamentId,
          eventType: 'tournament.playoff_blocked',
          eventKey,
          variables: { tournamentTitle: row.title },
          fallback: {
            title: 'Плей-офф ожидает результатов',
            body: `В турнире «${row.title}» ещё не завершены все игры регулярного сезона.`,
            url: '/admin',
          },
        });
      }
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function loadLifecycleRows(
  pool: Pool,
  tournamentId: string | undefined,
): Promise<LifecycleRow[]> {
  const { rows } = await pool.query<LifecycleRow>(
    `select t.id, t.status, t.current_revision, t.registration_opens_at,
            t.registration_closes_at, revision.rules_snapshot,
            (
              select count(*)::int from tournament_participant participant
               where participant.tournament_id = t.id and participant.state = 'approved'
            ) as approved_participant_count,
            exists(
              select 1 from tournament_matchday matchday where matchday.tournament_id = t.id
            ) as schedule_exists,
            false as regular_results_complete
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

function reconcileGeneratedSchedule(outcome: GenerateRegularScheduleOutcome) {
  if (outcome.status === 'registration_blocked') {
    return {
      before: outcome.beforeStatus,
      after: outcome.status,
      action: outcome.changed ? ('block_registration' as const) : ('unchanged' as const),
      changed: outcome.changed,
      reason: 'not_enough_participants' as const,
    };
  }
  return {
    before: outcome.beforeStatus,
    after: outcome.status,
    action: outcome.changed
      ? ('generate_schedule' as const)
      : ('await_manual_regular_start' as const),
    changed: outcome.changed,
    reason: null,
  };
}

export async function reconcileTournamentLifecycle(
  pool: Pool,
  options: ReconcileTournamentLifecycleOptions,
): Promise<TournamentLifecycleReconcileReport> {
  if (Number.isNaN(options.now.getTime())) throw new Error('now must be a valid date');
  const rows = await loadLifecycleRows(pool, options.tournamentId);
  const items: TournamentLifecycleReconcileItem[] = [];

  for (const row of rows) {
    await finalizeExpiredRegularDays(pool, row, options);
    const snapshot = tournamentLifecycleSnapshot({
      ...row,
      regular_results_complete: await regularResultsComplete(pool, row),
    });
    const lifecycleDecision = evaluateTournamentLifecycle(snapshot, options.now);
    let after = snapshot.status;
    let changed = false;
    let before = snapshot.status;
    let action = lifecycleDecision.action;
    let reason = lifecycleDecision.reason;

    if (options.dryRun === true) {
      after = plannedAfterStatus(snapshot.status, lifecycleDecision.action);
    } else if (
      lifecycleDecision.action === 'generate_schedule' ||
      lifecycleDecision.action === 'block_registration' ||
      (snapshot.status === 'registration_blocked' &&
        snapshot.automaticLifecycleVersion === AUTOMATIC_TOURNAMENT_LIFECYCLE_VERSION)
    ) {
      const result = await generateRegularSchedule(pool, snapshot.tournamentId, snapshot.revision);
      const reconciled = reconcileGeneratedSchedule(result);
      before = reconciled.before;
      after = reconciled.after;
      action = reconciled.action;
      changed = reconciled.changed;
      reason = reconciled.reason;
    } else if (lifecycleDecision.action === 'await_regular_results') {
      await enqueuePlayoffBlockedPushes(pool, snapshot.tournamentId);
    } else if (lifecycleDecision.action === 'start_playoff') {
      const started = await startTournamentPlayoffs(pool, snapshot.tournamentId, options.now);
      after = started.status === 'playoff' ? 'playoff' : snapshot.status;
      changed = true;
    }

    items.push({
      tournamentId: snapshot.tournamentId,
      before,
      after,
      action,
      changed,
      reason,
    });
  }

  return {
    scanned: items.length,
    changed: items.filter((item) => item.changed).length,
    items,
  };
}
