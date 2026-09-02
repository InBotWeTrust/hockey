import type { Pool, PoolClient } from 'pg';
import {
  GAME_CORE_VERSION,
  STICK_NEUTRAL,
  getGoalie,
  getSessionPhaseOffsets,
  resolvePerspectiveCourtShot,
} from '@hockey/game-core';
import { grantStatAchievements } from '../achievements/service.js';
import { deriveClassicTournamentSeed, deriveShotSeed } from '../duel/seed.js';
import { AppError } from '../plugins/errors.js';
import { appendEvent } from '../duel/eventLog.js';
import { parseTournamentConfig } from './config.js';
import { resolveClassicResult } from './classic.js';
import {
  rebuildDailyAggregateStandings,
  refreshDailyDayPlacements,
} from './dailyAggregate.js';
import type {
  ClassicTournamentConfig,
  TournamentClassicRules,
} from './types.js';

type ClassicSessionState = 'idle' | 'period_active' | 'break_active' | 'closed' | 'expired';
type ShotResult = 'goal' | 'save' | 'miss';

interface TournamentRulesSnapshot {
  config: unknown;
  dailyPlacePoints?: number[];
}

interface ClassicContext {
  tournamentId: string;
  tournamentTitle: string;
  participantId: string;
  matchdayId: string;
  tournamentDay: number;
  localDate: string;
  startsAt: Date;
  endsAt: Date;
  rulesSnapshot: TournamentRulesSnapshot;
  config: ClassicTournamentConfig;
}

interface ClassicSessionRow {
  id: string;
  tournament_id: string;
  participant_id: string;
  matchday_id: string;
  tournament_day: number;
  state: ClassicSessionState;
  current_period: number;
  rules_snapshot: TournamentClassicRules;
  game_core_version: number;
  session_seed: string;
  period_started_at: Date | null;
  break_started_at: Date | null;
  closes_at: Date;
  closed_at: Date | null;
}

interface ClassicPeriodRow {
  period_number: number;
  shots_taken: number;
  goals: number;
  closed_reason: 'quota' | 'timeout' | 'day_end';
  started_at: Date;
  ended_at: Date;
}

export interface ClassicPeriodLogEntry {
  period_number: number;
  shots_taken: number;
  goals: number;
  closed_reason: 'quota' | 'timeout' | 'day_end';
  duration_ms: number;
  ended_at: string;
}

export interface ClassicGameState {
  tournament_id: string;
  tournament_title: string;
  tournament_day: number;
  session_id: string;
  state: 'idle' | 'period_active' | 'break_active' | 'closed';
  expired: boolean;
  current_period: number;
  current_period_shots: number;
  current_period_goals: number;
  daily_total_shots: number;
  daily_total_goals: number;
  lifetime_total_shots: number;
  lifetime_total_goals: number;
  period_started_at: string | null;
  period_ends_at: string | null;
  break_ends_at: string | null;
  day_date: string;
  closes_at: string;
  next_day_starts_at: string;
  server_now: string;
  daily_seed: string;
  goalie_id: string;
  shots_per_period: number;
  period_duration_ms: number;
  break_duration_ms: number;
  total_periods: 3;
  period_speed_presets: TournamentClassicRules['periodSpeedPresets'];
  recent_periods: ClassicPeriodLogEntry[];
  previous_game: null;
  training_cooldown_ends_at: null;
  result: {
    goals: number;
    shots: number;
    accuracy: number;
    counted: boolean;
    game_completed: boolean;
  } | null;
}

export interface ActiveClassicGame {
  tournament_id: string;
  tournament_title: string;
  tournament_day: number;
  starts_at: string;
  closes_at: string;
  state: 'available' | 'idle' | 'period_active' | 'break_active' | 'closed';
  current_period: number;
  total_shots: number;
  total_goals: number;
}

export interface ClassicShotInput {
  tapTime: number;
  shooterTapTime?: number;
  puckSpeedPerMs?: number;
  shooterFrequency?: number;
  goalieFrequency?: number;
  goalFrequency?: number;
}

export interface ClassicShotResponse {
  server_result: ShotResult;
  state: ClassicGameState;
}

async function transaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await work(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function asClassicConfig(snapshot: TournamentRulesSnapshot): ClassicTournamentConfig {
  const config = parseTournamentConfig(snapshot.config);
  if (config.regularSource !== 'classic') {
    throw new AppError('not_found', 'classic tournament not found', 404);
  }
  return config;
}

async function fetchCurrentContext(
  client: PoolClient,
  userId: string,
  tournamentId: string,
  now: Date,
): Promise<ClassicContext | null> {
  const { rows } = await client.query<{
    tournament_id: string;
    tournament_title: string;
    participant_id: string;
    matchday_id: string;
    tournament_day: number;
    local_date: string;
    starts_at: Date;
    ends_at: Date;
    rules_snapshot: TournamentRulesSnapshot;
  }>(
    `select t.id as tournament_id, t.title as tournament_title,
            participant.id as participant_id, matchday.id as matchday_id,
            matchday.number as tournament_day, matchday.local_date::text,
            matchday.starts_at, matchday.ends_at, revision.rules_snapshot
       from tournament t
       join tournament_revision revision on revision.id = t.published_revision_id
       join tournament_participant participant
         on participant.tournament_id = t.id
        and participant.user_id = $2
        and participant.state in ('approved', 'withdrawn', 'removed', 'disqualified')
       join tournament_matchday matchday
         on matchday.tournament_id = t.id
        and matchday.starts_at <= $3
        and matchday.ends_at > $3
        and matchday.status <> 'cancelled'
      where t.id = $1
        and t.regular_source = 'classic'
        and t.status = 'regular'
      order by matchday.number
      limit 1`,
    [tournamentId, userId, now],
  );
  const row = rows[0];
  if (!row) return null;
  const config = asClassicConfig(row.rules_snapshot);
  return {
    tournamentId: row.tournament_id,
    tournamentTitle: row.tournament_title,
    participantId: row.participant_id,
    matchdayId: row.matchday_id,
    tournamentDay: Number(row.tournament_day),
    localDate: row.local_date,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    rulesSnapshot: row.rules_snapshot,
    config,
  };
}

async function fetchSessionContext(
  client: PoolClient,
  userId: string,
  tournamentId: string,
): Promise<ClassicContext | null> {
  const { rows } = await client.query<{
    tournament_id: string;
    tournament_title: string;
    participant_id: string;
    matchday_id: string;
    tournament_day: number;
    local_date: string;
    starts_at: Date;
    ends_at: Date;
    rules_snapshot: TournamentRulesSnapshot;
  }>(
    `select t.id as tournament_id, t.title as tournament_title,
            participant.id as participant_id, matchday.id as matchday_id,
            session.tournament_day, matchday.local_date::text,
            matchday.starts_at, matchday.ends_at, revision.rules_snapshot
       from tournament_classic_session session
       join tournament t on t.id = session.tournament_id
       join tournament_revision revision on revision.id = t.published_revision_id
       join tournament_participant participant on participant.id = session.participant_id
       join tournament_matchday matchday on matchday.id = session.matchday_id
      where t.id = $1 and participant.user_id = $2
      order by session.tournament_day desc
      limit 1`,
    [tournamentId, userId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    tournamentId: row.tournament_id,
    tournamentTitle: row.tournament_title,
    participantId: row.participant_id,
    matchdayId: row.matchday_id,
    tournamentDay: Number(row.tournament_day),
    localDate: row.local_date,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    rulesSnapshot: row.rules_snapshot,
    config: asClassicConfig(row.rules_snapshot),
  };
}

async function requireContext(
  client: PoolClient,
  userId: string,
  tournamentId: string,
  now: Date,
): Promise<ClassicContext> {
  const context =
    (await fetchCurrentContext(client, userId, tournamentId, now)) ??
    (await fetchSessionContext(client, userId, tournamentId));
  if (!context) throw new AppError('not_found', 'classic tournament game is not available', 404);
  return context;
}

async function getOrCreateSession(
  client: PoolClient,
  context: ClassicContext,
  userId: string,
  seedSecret: string,
): Promise<ClassicSessionRow> {
  const seed = deriveClassicTournamentSeed(
    context.tournamentId,
    userId,
    context.tournamentDay,
    seedSecret,
  );
  await client.query(
    `insert into tournament_classic_session
       (tournament_id, participant_id, matchday_id, tournament_day, rules_snapshot,
        game_core_version, session_seed, closes_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (tournament_id, participant_id, tournament_day) do nothing`,
    [
      context.tournamentId,
      context.participantId,
      context.matchdayId,
      context.tournamentDay,
      JSON.stringify(context.config.classicRules),
      GAME_CORE_VERSION,
      seed,
      context.endsAt,
    ],
  );
  const { rows } = await client.query<ClassicSessionRow>(
    `select * from tournament_classic_session
      where tournament_id = $1 and participant_id = $2 and tournament_day = $3
      for update`,
    [context.tournamentId, context.participantId, context.tournamentDay],
  );
  const session = rows[0];
  if (!session) throw new AppError('internal_error', 'classic session was not created', 500);
  return session;
}

async function aggregateCurrentPeriod(
  client: PoolClient,
  sessionId: string,
  periodNumber: number,
): Promise<{ shots: number; goals: number; lastTapTime: number | null }> {
  const { rows } = await client.query<{
    shots: number | string;
    goals: number | string;
    last_tap_time: number | string | null;
  }>(
    `select count(*)::int as shots,
            count(*) filter (where server_result = 'goal')::int as goals,
            (array_agg((input_payload->>'tapTime')::double precision order by shot_index desc))[1]
              as last_tap_time
       from shot_session
      where mode = 'tournament_classic'
        and tournament_classic_session_id = $1
        and period_number = $2`,
    [sessionId, periodNumber],
  );
  const row = rows[0]!;
  return {
    shots: Number(row.shots),
    goals: Number(row.goals),
    lastTapTime: row.last_tap_time === null ? null : Number(row.last_tap_time),
  };
}

async function fetchPeriods(client: PoolClient, sessionId: string): Promise<ClassicPeriodRow[]> {
  const { rows } = await client.query<ClassicPeriodRow>(
    `select period_number, shots_taken, goals, closed_reason, started_at, ended_at
       from tournament_classic_period
      where session_id = $1 order by period_number`,
    [sessionId],
  );
  return rows;
}

async function finalizeSessionResult(
  client: PoolClient,
  context: ClassicContext,
  session: ClassicSessionRow,
  finalizedAt: Date,
): Promise<void> {
  await client.query(`select pg_advisory_xact_lock(hashtext($1))`, [
    `tournament-daily:${context.tournamentId}:${context.tournamentDay}`,
  ]);
  const periods = await fetchPeriods(client, session.id);
  const completedPeriods = periods
    .filter((period) => period.closed_reason !== 'day_end')
    .map((period) => ({
      periodNumber: Number(period.period_number),
      shots: Number(period.shots_taken),
      goals: Number(period.goals),
    }));
  const dayEnd = periods.find((period) => period.closed_reason === 'day_end');
  const result = resolveClassicResult({
    policy: session.rules_snapshot.incompleteResultPolicy,
    completedPeriods,
    activePeriod:
      dayEnd === undefined
        ? null
        : { shots: Number(dayEnd.shots_taken), goals: Number(dayEnd.goals) },
  });
  const includedPeriods = result.gameCompleted
    ? periods
    : session.rules_snapshot.incompleteResultPolicy === 'all_shots'
      ? periods
      : periods.filter((period) => period.closed_reason !== 'day_end');
  const activeDurationMs = result.counted
    ? includedPeriods.reduce(
        (total, period) =>
          total + Math.max(0, period.ended_at.getTime() - period.started_at.getTime()),
        0,
      )
    : null;
  await client.query(
    `insert into tournament_daily_result
       (tournament_id, participant_id, tournament_day, player_local_date,
        goals, shots, accuracy, place, place_points, completed, source_snapshot, finalized_at)
     values ($1, $2, $3, $4, $5, $6, $7, null, 0, $8, $9, $10)
     on conflict (tournament_id, participant_id, tournament_day) do update
       set goals = excluded.goals, shots = excluded.shots, accuracy = excluded.accuracy,
           completed = excluded.completed, source_snapshot = excluded.source_snapshot,
           finalized_at = excluded.finalized_at`,
    [
      context.tournamentId,
      context.participantId,
      context.tournamentDay,
      context.localDate,
      result.goals,
      result.shots,
      result.shots === 0 ? 0 : result.goals / result.shots,
      result.counted,
      JSON.stringify({
        source: 'tournament_classic',
        sessionId: session.id,
        gameCompleted: result.gameCompleted,
        incompleteResultPolicy: session.rules_snapshot.incompleteResultPolicy,
        provisional: finalizedAt.getTime() < context.endsAt.getTime(),
        ...(activeDurationMs === null ? {} : { activeDurationMs }),
      }),
      finalizedAt,
    ],
  );
  await refreshDailyDayPlacements(client, context.tournamentId, context.tournamentDay, {
    config: {
      regularSource: context.config.regularSource,
      dailyDays: context.config.dailyDays,
      dailyMetric: context.config.dailyMetric,
      bestDays: context.config.bestDays,
    },
    ...(context.rulesSnapshot.dailyPlacePoints === undefined
      ? {}
      : { dailyPlacePoints: context.rulesSnapshot.dailyPlacePoints }),
  });
  await rebuildDailyAggregateStandings(client, context.tournamentId, {
    config: {
      regularSource: context.config.regularSource,
      dailyDays: context.config.dailyDays,
      dailyMetric: context.config.dailyMetric,
      bestDays: context.config.bestDays,
    },
    ...(context.rulesSnapshot.dailyPlacePoints === undefined
      ? {}
      : { dailyPlacePoints: context.rulesSnapshot.dailyPlacePoints }),
  });
}

async function closePeriod(
  client: PoolClient,
  context: ClassicContext,
  session: ClassicSessionRow,
  endedAt: Date,
  reason: 'quota' | 'timeout' | 'day_end',
): Promise<ClassicSessionRow> {
  if (session.period_started_at === null) {
    throw new AppError('internal_error', 'classic period start is missing', 500);
  }
  const aggregate = await aggregateCurrentPeriod(client, session.id, session.current_period);
  await client.query(
    `insert into tournament_classic_period
       (session_id, period_number, started_at, ended_at, shots_taken, goals, closed_reason)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (session_id, period_number) do nothing`,
    [
      session.id,
      session.current_period,
      session.period_started_at,
      endedAt,
      aggregate.shots,
      aggregate.goals,
      reason,
    ],
  );
  const finalPeriod = session.current_period >= 3;
  const nextState: ClassicSessionState = finalPeriod ? 'closed' : 'break_active';
  const { rows } = await client.query<ClassicSessionRow>(
    `update tournament_classic_session
        set state = $2,
            period_started_at = null,
            break_started_at = case when $2 = 'break_active' then $3::timestamptz else null end,
            closed_at = case when $2 = 'closed' then $3::timestamptz else closed_at end,
            updated_at = $3
      where id = $1 returning *`,
    [session.id, nextState, endedAt],
  );
  const updated = rows[0]!;
  if (finalPeriod) await finalizeSessionResult(client, context, updated, endedAt);
  return updated;
}

async function expireSession(
  client: PoolClient,
  context: ClassicContext,
  session: ClassicSessionRow,
): Promise<ClassicSessionRow> {
  let current = session;
  if (current.state === 'period_active') {
    current = await closePeriod(client, context, current, current.closes_at, 'day_end');
  }
  if (current.state !== 'closed') {
    const { rows } = await client.query<ClassicSessionRow>(
      `update tournament_classic_session
          set state = 'expired', closed_at = closes_at,
              period_started_at = null, break_started_at = null, updated_at = closes_at
        where id = $1 returning *`,
      [current.id],
    );
    current = rows[0]!;
    await finalizeSessionResult(client, context, current, current.closes_at);
  }
  return current;
}

async function reconcileSession(
  client: PoolClient,
  context: ClassicContext,
  session: ClassicSessionRow,
  now: Date,
): Promise<ClassicSessionRow> {
  let current = session;
  for (let pass = 0; pass < 6; pass += 1) {
    if (current.state === 'closed' || current.state === 'expired') return current;
    if (now.getTime() >= current.closes_at.getTime()) {
      return expireSession(client, context, current);
    }
    if (current.state === 'period_active' && current.period_started_at !== null) {
      const aggregate = await aggregateCurrentPeriod(client, current.id, current.current_period);
      if (aggregate.shots >= current.rules_snapshot.shotsPerPeriod) {
        current = await closePeriod(client, context, current, now, 'quota');
        continue;
      }
      const periodEndsAt = new Date(
        current.period_started_at.getTime() + current.rules_snapshot.periodDurationMs,
      );
      if (now.getTime() >= periodEndsAt.getTime()) {
        current = await closePeriod(client, context, current, periodEndsAt, 'timeout');
        continue;
      }
      return current;
    }
    if (current.state === 'break_active' && current.break_started_at !== null) {
      const breakEndsAt = new Date(
        current.break_started_at.getTime() + current.rules_snapshot.breakDurationMs,
      );
      if (now.getTime() >= breakEndsAt.getTime()) {
        const { rows } = await client.query<ClassicSessionRow>(
          `update tournament_classic_session
              set state = 'idle', break_started_at = null, updated_at = $2
            where id = $1 returning *`,
          [current.id, breakEndsAt],
        );
        current = rows[0]!;
        continue;
      }
    }
    return current;
  }
  throw new AppError('internal_error', 'classic session reconciliation did not converge', 500);
}

async function buildState(
  client: PoolClient,
  context: ClassicContext,
  session: ClassicSessionRow,
  userId: string,
  now: Date,
): Promise<ClassicGameState> {
  const periods = await fetchPeriods(client, session.id);
  const allShots = await client.query<{ shots: number | string; goals: number | string }>(
    `select count(*)::int as shots,
            count(*) filter (where server_result = 'goal')::int as goals
       from shot_session
      where mode = 'tournament_classic' and tournament_classic_session_id = $1`,
    [session.id],
  );
  const lifetime = await client.query<{ shots: number; goals: number }>(
    `select lifetime_shots_total as shots, lifetime_goals_total as goals
       from users where id = $1`,
    [userId],
  );
  const current =
    session.state === 'period_active'
      ? await aggregateCurrentPeriod(client, session.id, session.current_period)
      : { shots: 0, goals: 0, lastTapTime: null };
  const storedResult = await client.query<{
    goals: number;
    shots: number;
    accuracy: string | number;
    completed: boolean;
    source_snapshot: { gameCompleted?: boolean };
  }>(
    `select goals, shots, accuracy, completed, source_snapshot
       from tournament_daily_result
      where tournament_id = $1 and participant_id = $2 and tournament_day = $3`,
    [context.tournamentId, context.participantId, context.tournamentDay],
  );
  const result = storedResult.rows[0];
  const periodEndsAt =
    session.state === 'period_active' && session.period_started_at !== null
      ? new Date(
          Math.min(
            session.period_started_at.getTime() + session.rules_snapshot.periodDurationMs,
            session.closes_at.getTime(),
          ),
        ).toISOString()
      : null;
  const breakEndsAt =
    session.state === 'break_active' && session.break_started_at !== null
      ? new Date(
          Math.min(
            session.break_started_at.getTime() + session.rules_snapshot.breakDurationMs,
            session.closes_at.getTime(),
          ),
        ).toISOString()
      : null;
  return {
    tournament_id: context.tournamentId,
    tournament_title: context.tournamentTitle,
    tournament_day: context.tournamentDay,
    session_id: session.id,
    state: session.state === 'expired' ? 'closed' : session.state,
    expired: session.state === 'expired',
    current_period: session.current_period,
    current_period_shots: current.shots,
    current_period_goals: current.goals,
    daily_total_shots: Number(allShots.rows[0]?.shots ?? 0),
    daily_total_goals: Number(allShots.rows[0]?.goals ?? 0),
    lifetime_total_shots: Number(lifetime.rows[0]?.shots ?? 0),
    lifetime_total_goals: Number(lifetime.rows[0]?.goals ?? 0),
    period_started_at: session.period_started_at?.toISOString() ?? null,
    period_ends_at: periodEndsAt,
    break_ends_at: breakEndsAt,
    day_date: context.localDate,
    closes_at: session.closes_at.toISOString(),
    next_day_starts_at: session.closes_at.toISOString(),
    server_now: now.toISOString(),
    daily_seed: session.session_seed,
    goalie_id: session.rules_snapshot.goalieId,
    shots_per_period: session.rules_snapshot.shotsPerPeriod,
    period_duration_ms: session.rules_snapshot.periodDurationMs,
    break_duration_ms: session.rules_snapshot.breakDurationMs,
    total_periods: 3,
    period_speed_presets: session.rules_snapshot.periodSpeedPresets,
    recent_periods: periods.map((period) => ({
      period_number: Number(period.period_number),
      shots_taken: Number(period.shots_taken),
      goals: Number(period.goals),
      closed_reason: period.closed_reason,
      duration_ms: Math.max(0, period.ended_at.getTime() - period.started_at.getTime()),
      ended_at: period.ended_at.toISOString(),
    })),
    previous_game: null,
    training_cooldown_ends_at: null,
    result:
      result === undefined
        ? null
        : {
            goals: Number(result.goals),
            shots: Number(result.shots),
            accuracy: Number(result.accuracy),
            counted: result.completed,
            game_completed: result.source_snapshot.gameCompleted === true,
          },
  };
}

export async function listActiveClassicGames(
  pool: Pool,
  input: { userId: string; now: Date },
): Promise<ActiveClassicGame[]> {
  const { rows } = await pool.query<{
    tournament_id: string;
    tournament_title: string;
    tournament_day: number;
    starts_at: Date;
    ends_at: Date;
    state: ClassicSessionState | null;
    current_period: number | null;
    total_shots: number | string;
    total_goals: number | string;
  }>(
    `select t.id as tournament_id, t.title as tournament_title,
            matchday.number as tournament_day, matchday.starts_at, matchday.ends_at,
            session.state, session.current_period,
            count(shot.id)::int as total_shots,
            count(shot.id) filter (where shot.server_result = 'goal')::int as total_goals
       from tournament t
       join tournament_participant participant
         on participant.tournament_id = t.id
        and participant.user_id = $1
        and participant.state in ('approved', 'withdrawn', 'removed', 'disqualified')
       join tournament_matchday matchday
         on matchday.tournament_id = t.id
        and matchday.starts_at <= $2
        and matchday.ends_at > $2
        and matchday.status <> 'cancelled'
       left join tournament_classic_session session
         on session.tournament_id = t.id
        and session.participant_id = participant.id
        and session.tournament_day = matchday.number
       left join shot_session shot
         on shot.mode = 'tournament_classic'
        and shot.tournament_classic_session_id = session.id
      where t.regular_source = 'classic' and t.status = 'regular'
      group by t.id, t.title, matchday.number, matchday.starts_at, matchday.ends_at,
               session.state, session.current_period
      order by
        case session.state
          when 'period_active' then 0 when 'break_active' then 1 when 'idle' then 2
          when 'closed' then 4 when 'expired' then 4 else 3
        end,
        matchday.ends_at, t.title`,
    [input.userId, input.now],
  );
  return rows.map((row) => ({
    tournament_id: row.tournament_id,
    tournament_title: row.tournament_title,
    tournament_day: Number(row.tournament_day),
    starts_at: row.starts_at.toISOString(),
    closes_at: row.ends_at.toISOString(),
    state: row.state === null ? 'available' : row.state === 'expired' ? 'closed' : row.state,
    current_period: Number(row.current_period ?? 0),
    total_shots: Number(row.total_shots),
    total_goals: Number(row.total_goals),
  }));
}

export async function getClassicGameState(
  pool: Pool,
  input: { userId: string; tournamentId: string; now: Date; seedSecret: string },
): Promise<ClassicGameState> {
  return transaction(pool, async (client) => {
    const context = await requireContext(client, input.userId, input.tournamentId, input.now);
    let session = await getOrCreateSession(client, context, input.userId, input.seedSecret);
    session = await reconcileSession(client, context, session, input.now);
    return buildState(client, context, session, input.userId, input.now);
  });
}

export async function startClassicGamePeriod(
  pool: Pool,
  input: { userId: string; tournamentId: string; now: Date; seedSecret: string },
): Promise<ClassicGameState> {
  return transaction(pool, async (client) => {
    const context = await requireContext(client, input.userId, input.tournamentId, input.now);
    let session = await getOrCreateSession(client, context, input.userId, input.seedSecret);
    session = await reconcileSession(client, context, session, input.now);
    if (session.state !== 'idle') {
      throw new AppError(
        'conflict',
        `cannot start classic period in state '${session.state}'`,
        409,
      );
    }
    if (session.current_period >= 3) {
      throw new AppError('conflict', 'all classic periods are completed', 409);
    }
    const { rows } = await client.query<ClassicSessionRow>(
      `update tournament_classic_session
          set state = 'period_active', current_period = current_period + 1,
              period_started_at = $2, break_started_at = null, updated_at = $2
        where id = $1 returning *`,
      [session.id, input.now],
    );
    session = rows[0]!;
    await appendEvent(client, input.userId, 'tournament_classic_period_started', {
      tournament_id: context.tournamentId,
      tournament_day: context.tournamentDay,
      session_id: session.id,
      period_number: session.current_period,
    });
    return buildState(client, context, session, input.userId, input.now);
  });
}

export async function submitClassicGameShot(
  pool: Pool,
  input: {
    userId: string;
    tournamentId: string;
    now: Date;
    seedSecret: string;
    shotIndex: number;
    input: ClassicShotInput;
    claimedResult: ShotResult;
  },
): Promise<ClassicShotResponse> {
  return transaction(pool, async (client) => {
    const context = await requireContext(client, input.userId, input.tournamentId, input.now);
    let session = await getOrCreateSession(client, context, input.userId, input.seedSecret);
    session = await reconcileSession(client, context, session, input.now);
    if (session.state !== 'period_active' || session.period_started_at === null) {
      throw new AppError('conflict', `cannot submit classic shot in state '${session.state}'`, 409);
    }
    const current = await aggregateCurrentPeriod(client, session.id, session.current_period);
    const expectedShotIndex = current.shots + 1;
    if (input.shotIndex !== expectedShotIndex) {
      throw new AppError(
        'conflict',
        `classic shot index mismatch: expected ${expectedShotIndex}, got ${input.shotIndex}`,
        409,
      );
    }
    if (!Number.isFinite(input.input.tapTime) || input.input.tapTime < 0) {
      throw new AppError('bad_request', 'invalid classic shot time', 400);
    }
    const elapsed = Math.max(0, input.now.getTime() - session.period_started_at.getTime());
    if (
      input.input.tapTime > elapsed + 2_500 ||
      (current.lastTapTime !== null && input.input.tapTime < current.lastTapTime)
    ) {
      throw new AppError('conflict', 'classic shot time is stale', 409);
    }
    const preset = session.rules_snapshot.periodSpeedPresets.find(
      (candidate) => candidate.periodNumber === session.current_period,
    );
    if (!preset) throw new AppError('internal_error', 'classic period speed is missing', 500);
    const shotSeed = deriveShotSeed(session.session_seed, session.current_period, input.shotIndex);
    const shotInput = {
      tapTime: input.input.tapTime,
      ...(input.input.shooterTapTime === undefined
        ? {}
        : { shooterTapTime: input.input.shooterTapTime }),
      puckSpeedPerMs: preset.puckSpeedPerMs,
      shooterFrequency: preset.shooterFrequency,
      goalieFrequency: preset.goalieFrequency,
      goalFrequency: preset.goalFrequency,
    };
    const result = resolvePerspectiveCourtShot(
      shotInput,
      getGoalie(session.rules_snapshot.goalieId),
      shotSeed,
      input.shotIndex,
      STICK_NEUTRAL,
      getSessionPhaseOffsets(session.session_seed),
    );
    const serverResult: ShotResult = result.type;
    await client.query(
      `insert into shot_session
         (user_id, mode, tournament_classic_session_id, period_number, shot_index,
          seed, input_payload, server_result, game_core_version)
       values ($1, 'tournament_classic', $2, $3, $4, $5, $6, $7, $8)`,
      [
        input.userId,
        session.id,
        session.current_period,
        input.shotIndex,
        shotSeed,
        JSON.stringify(shotInput),
        serverResult,
        session.game_core_version,
      ],
    );
    const updatedUser = await client.query<{
      lifetime_shots_total: number;
      lifetime_goals_total: number;
      level: number;
    }>(
      `update users
          set lifetime_shots_total = lifetime_shots_total + 1,
              lifetime_goals_total = lifetime_goals_total + $2
        where id = $1
      returning lifetime_shots_total, lifetime_goals_total, level`,
      [input.userId, serverResult === 'goal' ? 1 : 0],
    );
    const user = updatedUser.rows[0]!;
    await grantStatAchievements(client, input.userId, {
      lifetimeShots: Number(user.lifetime_shots_total),
      lifetimeGoals: Number(user.lifetime_goals_total),
      level: Number(user.level),
    });
    if (input.claimedResult !== serverResult) {
      await appendEvent(client, input.userId, 'shot_mismatch', {
        mode: 'tournament_classic',
        tournament_id: context.tournamentId,
        session_id: session.id,
        period_number: session.current_period,
        shot_index: input.shotIndex,
        claimed: input.claimedResult,
        server: serverResult,
      });
    }
    if (input.shotIndex >= session.rules_snapshot.shotsPerPeriod) {
      session = await closePeriod(client, context, session, input.now, 'quota');
      session = await reconcileSession(client, context, session, input.now);
    }
    return {
      server_result: serverResult,
      state: await buildState(client, context, session, input.userId, input.now),
    };
  });
}

export async function finalizeClassicTournamentDay(
  pool: Pool,
  input: {
    tournamentId: string;
    tournamentDay: number;
    now: Date;
    seedSecret: string;
  },
): Promise<{ tournamentId: string; tournamentDay: number; finalized: number }> {
  return transaction(pool, async (client) => {
    const { rows } = await client.query<{
      tournament_id: string;
      tournament_title: string;
      participant_id: string;
      user_id: string;
      matchday_id: string;
      tournament_day: number;
      local_date: string;
      starts_at: Date;
      ends_at: Date;
      rules_snapshot: TournamentRulesSnapshot;
    }>(
      `select t.id as tournament_id, t.title as tournament_title,
              participant.id as participant_id, participant.user_id,
              matchday.id as matchday_id, matchday.number as tournament_day,
              matchday.local_date::text, matchday.starts_at, matchday.ends_at,
              revision.rules_snapshot
         from tournament t
         join tournament_revision revision on revision.id = t.published_revision_id
         join tournament_matchday matchday
           on matchday.tournament_id = t.id and matchday.number = $2
         join tournament_participant participant on participant.tournament_id = t.id
        where t.id = $1
          and t.regular_source = 'classic'
          and t.status = 'regular'
          and matchday.status <> 'cancelled'
          and matchday.ends_at <= $3
          and participant.state in ('approved', 'withdrawn', 'removed', 'disqualified')
        order by participant.id`,
      [input.tournamentId, input.tournamentDay, input.now],
    );
    let finalized = 0;
    for (const row of rows) {
      const config = asClassicConfig(row.rules_snapshot);
      const context: ClassicContext = {
        tournamentId: row.tournament_id,
        tournamentTitle: row.tournament_title,
        participantId: row.participant_id,
        matchdayId: row.matchday_id,
        tournamentDay: Number(row.tournament_day),
        localDate: row.local_date,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        rulesSnapshot: row.rules_snapshot,
        config,
      };
      let session = await getOrCreateSession(client, context, row.user_id, input.seedSecret);
      if (session.state === 'closed' || session.state === 'expired') continue;
      session = await expireSession(client, context, session);
      if (session.state === 'expired' || session.state === 'closed') finalized += 1;
    }
    return {
      tournamentId: input.tournamentId,
      tournamentDay: input.tournamentDay,
      finalized,
    };
  });
}

export async function finalizeDueClassicTournamentDays(
  pool: Pool,
  input: { now: Date; seedSecret: string },
): Promise<{ finalizedDays: number; finalizedParticipants: number }> {
  const { rows } = await pool.query<{ tournament_id: string; tournament_day: number }>(
    `select matchday.tournament_id, matchday.number as tournament_day
       from tournament_matchday matchday
       join tournament t on t.id = matchday.tournament_id
      where t.status = 'regular'
        and t.regular_source = 'classic'
        and matchday.status <> 'cancelled'
        and matchday.ends_at <= $1
        and exists (
          select 1
            from tournament_participant participant
           where participant.tournament_id = t.id
             and participant.state in ('approved', 'withdrawn', 'removed', 'disqualified')
             and not exists (
               select 1
                 from tournament_daily_result result
                where result.tournament_id = t.id
                  and result.participant_id = participant.id
                  and result.tournament_day = matchday.number
             )
        )
      order by matchday.ends_at, matchday.tournament_id, matchday.number`,
    [input.now],
  );
  let finalizedDays = 0;
  let finalizedParticipants = 0;
  for (const row of rows) {
    const result = await finalizeClassicTournamentDay(pool, {
      tournamentId: row.tournament_id,
      tournamentDay: Number(row.tournament_day),
      now: input.now,
      seedSecret: input.seedSecret,
    });
    if (result.finalized > 0) finalizedDays += 1;
    finalizedParticipants += result.finalized;
  }
  return { finalizedDays, finalizedParticipants };
}
