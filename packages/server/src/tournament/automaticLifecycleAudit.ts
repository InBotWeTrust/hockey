import type { Pool, PoolClient } from 'pg';
import { appendEvent } from '../duel/eventLog.js';
import {
  reconcileTournamentLifecycle,
  type TournamentLifecycleReconcileReport,
} from './automaticLifecycle.js';
import { lockTournament } from './locks.js';
import { buildHeadToHeadSchedulePlan } from './materialize.js';
import { addZonedCalendarDays } from './schedule.js';
import type { TournamentRulesSnapshot } from './service.js';
import type { TournamentConfig, TournamentStatus } from './types.js';

export interface AutomaticLifecycleAuditOptions {
  tournamentId?: string;
  now: Date;
  apply: boolean;
}

export type AutomaticLifecycleAuditStatus =
  | 'ready_to_enable'
  | 'enabled'
  | 'already_enabled'
  | 'blocked';

export interface AutomaticLifecycleAuditItem {
  id: string;
  slug: string;
  status: AutomaticLifecycleAuditStatus;
  source: TournamentConfig['regularSource'];
  revision: number;
  publishedRevisionId: string;
  approvedParticipantCount: number;
  playoffSize: number;
  matchdayCount: number;
  roundCount: number;
  fixtureCount: number;
  seriesCount: number;
  startedGameCount: number;
  completedGameCount: number;
  dailyResultCount: number;
  classicSessionCount: number;
  classicPeriodCount: number;
  classicShotCount: number;
  proposedAction: 'enable_and_reconcile' | 'none';
  reasons: string[];
  dryRunReconcile: TournamentLifecycleReconcileReport;
  reconcile?: TournamentLifecycleReconcileReport;
}

export interface AutomaticLifecycleAuditReport {
  tournaments: AutomaticLifecycleAuditItem[];
}

interface AuditTournamentRow {
  id: string;
  slug: string;
  status: TournamentStatus;
  current_revision: number;
  published_revision_id: string;
  created_by: string;
  starts_at: Date | null;
  regular_source: TournamentConfig['regularSource'];
  rules_snapshot: TournamentRulesSnapshot;
  approved_participant_count: number;
  matchday_count: number;
  round_count: number;
  fixture_count: number;
  series_count: number;
  started_game_count: number;
  completed_game_count: number;
  daily_result_count: number;
  classic_session_count: number;
  classic_period_count: number;
  classic_shot_count: number;
}

interface MatchdayRow {
  number: number;
  starts_at: Date;
  ends_at: Date;
}

interface RoundRow {
  id: string;
  matchday_number: number | null;
  stage: string;
  number: number;
  cycle_number: number | null;
  starts_at: Date | null;
  ends_at: Date | null;
  rules_snapshot: Record<string, unknown>;
}

interface FixtureRow {
  round_id: string | null;
  fixture_number: number;
  home_participant_id: string | null;
  away_participant_id: string | null;
  venue_mode: 'home_selected' | 'neutral_default';
  scheduled_starts_at: Date | null;
  window_ends_at: Date | null;
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function sameInstant(left: Date | null, right: string): boolean {
  return left?.getTime() === new Date(right).getTime();
}

function terminalStatus(status: TournamentStatus): boolean {
  return status === 'completed' || status === 'cancelled' || status === 'archived';
}

async function loadAuditTournament(
  conn: Pool | PoolClient,
  tournamentId: string,
  lock = false,
): Promise<AuditTournamentRow | null> {
  const result = await conn.query<AuditTournamentRow>(
    `select t.id, t.slug, t.status, t.current_revision, t.published_revision_id::text,
            t.created_by::text, t.starts_at, t.regular_source, revision.rules_snapshot,
            (select count(*)::int from tournament_participant participant
              where participant.tournament_id = t.id and participant.state = 'approved')
              as approved_participant_count,
            (select count(*)::int from tournament_matchday matchday
              where matchday.tournament_id = t.id) as matchday_count,
            (select count(*)::int from tournament_round round_row
              where round_row.tournament_id = t.id) as round_count,
            (select count(*)::int from tournament_fixture fixture
              where fixture.tournament_id = t.id) as fixture_count,
            (select count(*)::int from tournament_playoff_series series
              where series.tournament_id = t.id) as series_count,
            (select count(*)::int from tournament_fixture fixture
              join tournament_round round_row on round_row.id = fixture.round_id
              where fixture.tournament_id = t.id
                and round_row.stage in ('regular', 'playoff', 'third_place')
                and fixture.status in ('open', 'active', 'paused'))
              + (select count(*)::int from tournament_classic_session session
                  where session.tournament_id = t.id
                    and session.state in ('idle', 'period_active', 'break_active', 'expired'))
              as started_game_count,
            (select count(*)::int from tournament_fixture fixture
              join tournament_round round_row on round_row.id = fixture.round_id
              where fixture.tournament_id = t.id
                and round_row.stage in ('regular', 'playoff', 'third_place')
                and fixture.status in ('settled', 'forfeit'))
              + (select count(*)::int from tournament_daily_result result
                  where result.tournament_id = t.id)
              + (select count(*)::int from tournament_classic_session session
                  where session.tournament_id = t.id and session.state = 'closed')
              as completed_game_count,
            (select count(*)::int from tournament_daily_result result
              where result.tournament_id = t.id) as daily_result_count,
            (select count(*)::int from tournament_classic_session session
              where session.tournament_id = t.id) as classic_session_count,
            (select count(*)::int from tournament_classic_period period
              join tournament_classic_session session on session.id = period.session_id
              where session.tournament_id = t.id) as classic_period_count,
            (select count(*)::int from shot_session shot
              join tournament_classic_session session
                on session.id = shot.tournament_classic_session_id
              where session.tournament_id = t.id and shot.mode = 'tournament_classic')
              as classic_shot_count
       from tournament t
       join tournament_revision revision on revision.id = t.published_revision_id
      where t.id = $1
      ${lock ? 'for update of t, revision' : ''}`,
    [tournamentId],
  );
  return result.rows[0] ?? null;
}

async function approvedParticipantIds(
  conn: Pool | PoolClient,
  tournamentId: string,
): Promise<string[]> {
  const participants = await conn.query<{ id: string }>(
    `select id from tournament_participant
      where tournament_id = $1 and state = 'approved'
      order by seed nulls last, joined_at, id`,
    [tournamentId],
  );
  return participants.rows.map((participant) => participant.id);
}

async function existingScheduleMatches(
  conn: Pool | PoolClient,
  tournament: AuditTournamentRow,
): Promise<boolean> {
  if (
    tournament.matchday_count === 0 &&
    tournament.round_count === 0 &&
    tournament.fixture_count === 0 &&
    tournament.series_count === 0
  ) {
    return true;
  }
  if (tournament.starts_at === null || tournament.series_count > 0) return false;

  const matchdays = await conn.query<MatchdayRow>(
    `select number, starts_at, ends_at from tournament_matchday
      where tournament_id = $1 order by number`,
    [tournament.id],
  );
  const rounds = await conn.query<RoundRow>(
    `select round_row.id, matchday.number as matchday_number, round_row.stage,
            round_row.number, round_row.cycle_number, round_row.starts_at, round_row.ends_at,
            round_row.rules_snapshot
       from tournament_round round_row
       left join tournament_matchday matchday on matchday.id = round_row.matchday_id
      where round_row.tournament_id = $1
      order by round_row.stage, round_row.number`,
    [tournament.id],
  );
  const fixtures = await conn.query<FixtureRow>(
    `select round_id, fixture_number, home_participant_id, away_participant_id, venue_mode,
            scheduled_starts_at, window_ends_at
       from tournament_fixture
      where tournament_id = $1 order by fixture_number`,
    [tournament.id],
  );
  const config = tournament.rules_snapshot.config;
  if (config.regularSource !== tournament.regular_source) return false;

  if (config.regularSource !== 'head_to_head') {
    if (rounds.rows.length !== 0 || fixtures.rows.length !== 0 || matchdays.rows.length !== config.dailyDays) {
      return false;
    }
    return matchdays.rows.every((matchday, index) => {
      const startsAt = addZonedCalendarDays(tournament.starts_at!, config.timezone, index);
      const endsAt = addZonedCalendarDays(tournament.starts_at!, config.timezone, index + 1);
      return (
        Number(matchday.number) === index + 1 &&
        matchday.starts_at.getTime() === startsAt.getTime() &&
        matchday.ends_at.getTime() === endsAt.getTime()
      );
    });
  }

  const plan = buildHeadToHeadSchedulePlan({
    participantIds: await approvedParticipantIds(conn, tournament.id),
    cycles: config.roundRobinCycles,
    roundsPerDay: config.roundsPerDay,
    firstStart: tournament.starts_at,
    timezone: config.timezone,
    firstRoundLocalTime: config.firstRoundLocalTime,
    fixtureWindowMs: config.fixtureWindowMs,
    roundBreakMs: config.roundBreakMs,
  });
  if (
    rounds.rows.length !== plan.length ||
    fixtures.rows.length !== plan.reduce((count, round) => count + round.fixtures.length, 0)
  ) {
    return false;
  }
  const plannedMatchdays = new Map<number, { startsAt: string; endsAt: string }>();
  for (const plannedRound of plan) {
    const existing = plannedMatchdays.get(plannedRound.matchdayNumber);
    plannedMatchdays.set(plannedRound.matchdayNumber, {
      startsAt: existing?.startsAt ?? plannedRound.startsAt,
      endsAt: plannedRound.endsAt,
    });
  }
  if (
    matchdays.rows.length !== plannedMatchdays.size ||
    !matchdays.rows.every((matchday) => {
      const expected = plannedMatchdays.get(Number(matchday.number));
      return (
        expected !== undefined &&
        sameInstant(matchday.starts_at, expected.startsAt) &&
        sameInstant(matchday.ends_at, expected.endsAt)
      );
    })
  ) {
    return false;
  }
  const fixtureByRound = new Map<string, FixtureRow[]>();
  for (const fixture of fixtures.rows) {
    if (fixture.round_id === null) return false;
    const current = fixtureByRound.get(fixture.round_id) ?? [];
    current.push(fixture);
    fixtureByRound.set(fixture.round_id, current);
  }
  let expectedFixtureNumber = 0;
  return rounds.rows.every((round, index) => {
    const expected = plan[index];
    if (
      expected === undefined ||
      round.stage !== 'regular' ||
      Number(round.number) !== expected.roundNumber ||
      Number(round.cycle_number) !== expected.cycleNumber ||
      Number(round.matchday_number) !== expected.matchdayNumber ||
      !sameInstant(round.starts_at, expected.startsAt) ||
      !sameInstant(round.ends_at, expected.endsAt) ||
      round.rules_snapshot.byeParticipantId !== expected.byeParticipantId
    ) {
      return false;
    }
    const actualFixtures = (fixtureByRound.get(round.id) ?? []).sort(
      (left, right) => Number(left.fixture_number) - Number(right.fixture_number),
    );
    return (
      actualFixtures.length === expected.fixtures.length &&
      actualFixtures.every((fixture, fixtureIndex) => {
        const planned = expected.fixtures[fixtureIndex];
        const fixtureNumber = ++expectedFixtureNumber;
        return (
          planned !== undefined &&
          Number(fixture.fixture_number) === fixtureNumber &&
          planned.homeParticipantId === fixture.home_participant_id &&
          planned.awayParticipantId === fixture.away_participant_id &&
          planned.venueMode === fixture.venue_mode &&
          sameInstant(fixture.scheduled_starts_at, expected.startsAt) &&
          sameInstant(fixture.window_ends_at, expected.endsAt)
        );
      })
    );
  });
}

async function blockingReasons(
  conn: Pool | PoolClient,
  tournament: AuditTournamentRow,
): Promise<string[]> {
  const reasons: string[] = [];
  const rules = tournament.rules_snapshot as Record<string, unknown>;
  if (terminalStatus(tournament.status)) reasons.push('terminal_status');
  if (
    hasOwn(rules, 'automaticLifecycleVersion') &&
    rules.automaticLifecycleVersion !== 1
  ) {
    reasons.push('automatic_lifecycle_marker_is_not_legacy');
  }
  if (
    tournament.started_game_count + tournament.completed_game_count > 0 ||
    tournament.classic_period_count > 0 ||
    tournament.classic_shot_count > 0
  ) {
    reasons.push('games_already_started');
  }
  if (!(await existingScheduleMatches(conn, tournament))) {
    reasons.push('schedule_conflicts_with_published_configuration');
  }
  return reasons;
}

async function inspectTournament(
  conn: Pool | PoolClient,
  tournament: AuditTournamentRow,
  dryRunReconcile: TournamentLifecycleReconcileReport,
): Promise<AutomaticLifecycleAuditItem> {
  const reasons = await blockingReasons(conn, tournament);
  const rules = tournament.rules_snapshot as Record<string, unknown>;
  const alreadyEnabled = rules.automaticLifecycleVersion === 1;
  return {
    id: tournament.id,
    slug: tournament.slug,
    status: alreadyEnabled ? 'already_enabled' : reasons.length > 0 ? 'blocked' : 'ready_to_enable',
    source: tournament.rules_snapshot.config.regularSource,
    revision: Number(tournament.current_revision),
    publishedRevisionId: tournament.published_revision_id,
    approvedParticipantCount: Number(tournament.approved_participant_count),
    playoffSize: tournament.rules_snapshot.config.playoffSize,
    matchdayCount: Number(tournament.matchday_count),
    roundCount: Number(tournament.round_count),
    fixtureCount: Number(tournament.fixture_count),
    seriesCount: Number(tournament.series_count),
    startedGameCount: Number(tournament.started_game_count),
    completedGameCount: Number(tournament.completed_game_count),
    dailyResultCount: Number(tournament.daily_result_count),
    classicSessionCount: Number(tournament.classic_session_count),
    classicPeriodCount: Number(tournament.classic_period_count),
    classicShotCount: Number(tournament.classic_shot_count),
    proposedAction: alreadyEnabled || reasons.length > 0 ? 'none' : 'enable_and_reconcile',
    reasons,
    dryRunReconcile,
  };
}

async function legacyTournamentIds(pool: Pool, tournamentId?: string): Promise<string[]> {
  const result = await pool.query<{ id: string }>(
    `select id from tournament
      where published_revision_id is not null
        and ($1::uuid is null or id = $1)
      order by created_at, id`,
    [tournamentId ?? null],
  );
  return result.rows.map((row) => row.id);
}

async function applyAuditItem(
  pool: Pool,
  tournamentId: string,
  initial: AutomaticLifecycleAuditItem,
  now: Date,
): Promise<AutomaticLifecycleAuditItem> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await lockTournament(client, tournamentId);
    const locked = await loadAuditTournament(client, tournamentId, true);
    if (locked === null) {
      await client.query('rollback');
      return {
        ...initial,
        status: 'blocked',
        proposedAction: 'none',
        reasons: [...initial.reasons, 'published_revision_changed'],
      };
    }
    const lockedItem = await inspectTournament(client, locked, initial.dryRunReconcile);
    if (
      locked.published_revision_id !== initial.publishedRevisionId ||
      locked.current_revision !== initial.revision
    ) {
      await client.query('rollback');
      return {
        ...lockedItem,
        status: 'blocked',
        proposedAction: 'none',
        reasons: [...lockedItem.reasons, 'published_revision_changed'],
      };
    }
    if (lockedItem.status !== 'ready_to_enable') {
      await client.query('rollback');
      return lockedItem;
    }
    const updated = await client.query<{ id: string }>(
      `update tournament_revision
          set rules_snapshot = rules_snapshot || jsonb_build_object('automaticLifecycleVersion', 1)
        where id = $1
          and not (rules_snapshot ? 'automaticLifecycleVersion')
        returning id`,
      [locked.published_revision_id],
    );
    if (updated.rowCount !== 1) {
      await client.query('rollback');
      return {
        ...lockedItem,
        status: 'blocked',
        proposedAction: 'none',
        reasons: [...lockedItem.reasons, 'automatic_lifecycle_marker_changed'],
      };
    }
    await appendEvent(client, locked.created_by, 'admin_tournament_lifecycle_enabled', {
      tournamentId: locked.id,
      slug: locked.slug,
      publishedRevisionId: locked.published_revision_id,
      revision: Number(locked.current_revision),
      automaticLifecycleVersion: 1,
    });
    await client.query('commit');

    const reconcile = await reconcileTournamentLifecycle(pool, { now, tournamentId });
    return { ...lockedItem, status: 'enabled', proposedAction: 'none', reconcile };
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Audits legacy published tournaments and can explicitly opt one safe revision into
 * automatic lifecycle. It never repairs historical schedule or game data itself.
 */
export async function auditAutomaticTournamentLifecycle(
  pool: Pool,
  options: AutomaticLifecycleAuditOptions,
): Promise<AutomaticLifecycleAuditReport> {
  if (Number.isNaN(options.now.getTime())) throw new Error('now must be a valid date');
  const ids = await legacyTournamentIds(pool, options.tournamentId);
  const tournaments: AutomaticLifecycleAuditItem[] = [];
  for (const tournamentId of ids) {
    const dryRunReconcile = await reconcileTournamentLifecycle(pool, {
      now: options.now,
      tournamentId,
      dryRun: true,
    });
    const row = await loadAuditTournament(pool, tournamentId);
    if (row === null) continue;
    const initial = await inspectTournament(pool, row, dryRunReconcile);
    if (options.apply && initial.status === 'ready_to_enable') {
      tournaments.push(await applyAuditItem(pool, tournamentId, initial, options.now));
    } else {
      tournaments.push(initial);
    }
  }
  return { tournaments };
}
