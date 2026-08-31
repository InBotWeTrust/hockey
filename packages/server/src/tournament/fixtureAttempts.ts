import type { PoolClient } from 'pg';
import { AppError } from '../plugins/errors.js';
import {
  calculateHardGameDeadline,
  resolveTournamentDuelResult,
  type RoundGameDay,
  type SnapshottedDuelTemplateTiming,
  type TournamentDuelFormat,
} from './playoffScheduling.js';
import { zonedDateTimeToUtc } from './schedule.js';
import { cancelTournamentDuel } from '../duel/amateur/lifecycle.js';
import {
  tournamentDuelTemplateSnapshotSchema,
  type TournamentDuelTemplateSnapshot,
} from '../duel/amateur/tournamentTemplateSnapshot.js';
import { advanceTournamentPlayoffSeries } from './playoffSeriesLifecycle.js';
import { rebuildHeadToHeadStandings } from './standingsPersistence.js';
import { enqueueTournamentFixtureResultPush } from './fixtureNotifications.js';

export interface DuelTemplateLifecycleSnapshot extends SnapshottedDuelTemplateTiming {
  duelTemplateId: string;
  duelKind: TournamentDuelFormat;
  templateSnapshot: TournamentDuelTemplateSnapshot;
}

export interface ResolvedRoundGameDay extends RoundGameDay {
  dayNumber: number;
  firstGameStartsAt: Date;
  id?: string;
}

interface DuelTemplateTimingRow {
  id: string;
  title: string;
  description: string;
  difficulty: TournamentDuelTemplateSnapshot['difficulty'];
  duel_kind: TournamentDuelTemplateSnapshot['duelKind'];
  duel_variant: TournamentDuelTemplateSnapshot['duelVariant'];
  ranked_enabled: boolean;
  matchmaking_enabled: boolean;
  matchmaking_venue_policy: TournamentDuelTemplateSnapshot['matchmakingVenuePolicy'];
  total_periods: number;
  shots_per_period: number;
  period_duration_ms: number;
  break_duration_ms: number;
  challenge_ttl_ms: number;
  ready_duration_ms: number;
  ready_no_show_cooldown_ms: number;
  matchmaking_timeout_ms: number;
  ranked_daily_limit: number;
  ranked_same_opponent_limit: number;
  power_cap: number;
  period_speed_presets: unknown;
  period_rules: unknown | null;
  goalie_id: string;
  required_inventory_item_id: string | null;
  inventory_charges_per_period: number;
  win_points: number;
  draw_points: number;
  win_currency_reward: number;
  draw_currency_reward: number;
  win_star_reward: number;
}

function dateTimeParts(localDate: string, localTime: string) {
  const [year, month, day] = localDate.split('-').map(Number);
  const [hour, minute] = localTime.split(':').map(Number);
  return { year: year!, month: month!, day: day!, hour: hour!, minute: minute!, second: 0 };
}

export function resolveRoundGameDays(
  timezone: string,
  days: RoundGameDay[],
): ResolvedRoundGameDay[] {
  return days.map((day, index) => ({
    ...day,
    dayNumber: index + 1,
    firstGameStartsAt: zonedDateTimeToUtc(
      dateTimeParts(day.localDate, day.firstWaveLocalTime),
      timezone,
    ),
  }));
}

export function scheduledStartForSeriesGame(
  days: ResolvedRoundGameDay[],
  gameNumber: number,
  plannedStartIntervalMinutes: number,
): { day: ResolvedRoundGameDay; startsAt: Date; slotIndex: number } {
  let priorCapacity = 0;
  for (const day of days) {
    if (gameNumber <= priorCapacity + day.maxResultGames) {
      const slotIndex = gameNumber - priorCapacity - 1;
      return {
        day,
        slotIndex,
        startsAt: new Date(
          day.firstGameStartsAt.getTime() + slotIndex * plannedStartIntervalMinutes * 60_000,
        ),
      };
    }
    priorCapacity += day.maxResultGames;
  }
  throw new AppError('configuration_error', 'series game exceeds configured day capacity', 409);
}

export async function loadDuelTemplateLifecycleSnapshot(
  client: PoolClient,
  templateId: string,
): Promise<DuelTemplateLifecycleSnapshot> {
  const template = await client.query<DuelTemplateTimingRow>(
    `select id, title, description, difficulty, duel_kind, duel_variant,
            ranked_enabled, matchmaking_enabled, matchmaking_venue_policy,
            total_periods, shots_per_period, period_duration_ms, break_duration_ms,
            challenge_ttl_ms, ready_duration_ms, ready_no_show_cooldown_ms,
            matchmaking_timeout_ms, ranked_daily_limit, ranked_same_opponent_limit,
            power_cap, goalie_id, period_speed_presets, period_rules,
            required_inventory_item_id, inventory_charges_per_period,
            win_points, draw_points, win_currency_reward, draw_currency_reward, win_star_reward
       from amateur_duel_template
      where id = $1 and deleted_at is null`,
    [templateId],
  );
  const row = template.rows[0];
  if (row === undefined) {
    throw new AppError('configuration_error', 'duel template is not configured for fixture', 409);
  }
  const totalPeriods = Number(row.total_periods);
  const rules = Array.isArray(row.period_rules)
    ? row.period_rules
        .filter(
          (value): value is Record<string, unknown> =>
            typeof value === 'object' && value !== null && !Array.isArray(value),
        )
        .sort((left, right) => Number(left.periodNumber ?? 0) - Number(right.periodNumber ?? 0))
    : [];
  const periodDurationsMs = Array.from({ length: totalPeriods }, (_, index) => {
    const duration = rules[index]?.durationMs;
    return typeof duration === 'number' && Number.isSafeInteger(duration) && duration > 0
      ? duration
      : Number(row.period_duration_ms);
  });
  const breakDurationsMs = Array.from({ length: Math.max(0, totalPeriods - 1) }, () =>
    Number(row.break_duration_ms),
  );
  const templateSnapshot = tournamentDuelTemplateSnapshotSchema.safeParse({
    title: row.title,
    description: row.description,
    difficulty: row.difficulty,
    duelKind: row.duel_kind,
    duelVariant: row.duel_variant,
    rankedEnabled: row.ranked_enabled,
    matchmakingEnabled: row.matchmaking_enabled,
    matchmakingVenuePolicy: row.matchmaking_venue_policy,
    totalPeriods,
    shotsPerPeriod: Number(row.shots_per_period),
    periodDurationMs: Number(row.period_duration_ms),
    breakDurationMs: Number(row.break_duration_ms),
    challengeTtlMs: Number(row.challenge_ttl_ms),
    readyDurationMs: Number(row.ready_duration_ms),
    readyNoShowCooldownMs: Number(row.ready_no_show_cooldown_ms),
    matchmakingTimeoutMs: Number(row.matchmaking_timeout_ms),
    rankedDailyLimit: Number(row.ranked_daily_limit),
    rankedSameOpponentLimit: Number(row.ranked_same_opponent_limit),
    powerCap: Number(row.power_cap),
    periodSpeedPresets: row.period_speed_presets,
    periodRules: row.period_rules,
    goalieId: row.goalie_id,
    requiredInventoryItemId: row.required_inventory_item_id,
    inventoryChargesPerPeriod: Number(row.inventory_charges_per_period),
    winPoints: Number(row.win_points),
    drawPoints: Number(row.draw_points),
    winCurrencyReward: Number(row.win_currency_reward),
    drawCurrencyReward: Number(row.draw_currency_reward),
    winStarReward: Number(row.win_star_reward),
  });
  if (!templateSnapshot.success) {
    throw new AppError('configuration_error', 'duel template snapshot is invalid', 409);
  }
  return {
    duelTemplateId: row.id,
    duelKind: row.duel_kind,
    periodDurationsMs,
    breakDurationsMs,
    templateSnapshot: templateSnapshot.data,
  };
}

export function attemptDeadline(
  scheduledStartsAt: Date,
  readinessMinutes: number,
  template: DuelTemplateLifecycleSnapshot,
): Date {
  return calculateHardGameDeadline({
    plannedStartAt: scheduledStartsAt,
    readyCheckDurationMs: readinessMinutes * 60_000,
    templateTiming: template,
  });
}

export async function insertRoundGameDays(
  client: PoolClient,
  input: {
    roundId: string;
    days: ResolvedRoundGameDay[];
    readinessMinutes: number;
    plannedStartIntervalMinutes: number;
  },
): Promise<ResolvedRoundGameDay[]> {
  const persisted: ResolvedRoundGameDay[] = [];
  for (const day of input.days) {
    const inserted = await client.query<{ id: string }>(
      `insert into tournament_round_game_day
         (round_id, day_number, local_date, first_game_local_time, first_game_starts_at,
          max_result_bearing_games, readiness_duration, planned_start_interval)
       values ($1, $2, $3::date, $4::time, $5, $6, $7 * interval '1 minute',
               $8 * interval '1 minute')
       returning id`,
      [
        input.roundId,
        day.dayNumber,
        day.localDate,
        day.firstWaveLocalTime,
        day.firstGameStartsAt,
        day.maxResultGames,
        input.readinessMinutes,
        input.plannedStartIntervalMinutes,
      ],
    );
    persisted.push({ ...day, id: inserted.rows[0]!.id });
  }
  return persisted;
}

export async function insertInitialFixtureAttempt(
  client: PoolClient,
  input: {
    fixtureId: string;
    roundGameDayId: string | null;
    scheduledStartsAt: Date;
    readinessMinutes: number;
    template: DuelTemplateLifecycleSnapshot;
    readinessMode?: 'manual' | 'auto_continue';
  },
): Promise<{ id: string; readinessExpiresAt: Date; hardDeadlineAt: Date }> {
  const readinessExpiresAt = new Date(
    input.scheduledStartsAt.getTime() + input.readinessMinutes * 60_000,
  );
  const hardDeadlineAt = attemptDeadline(
    input.scheduledStartsAt,
    input.readinessMinutes,
    input.template,
  );
  const inserted = await client.query<{ id: string }>(
    `insert into tournament_fixture_attempt
       (fixture_id, round_game_day_id, attempt_number, kind, status,
        scheduled_starts_at, readiness_expires_at, hard_deadline_at, is_result_bearing,
        result_snapshot)
     values ($1, $2, 1, 'initial', 'pending', $3, $4, $5, true, $6::jsonb)
     returning id`,
    [
      input.fixtureId,
      input.roundGameDayId,
      input.scheduledStartsAt,
      readinessExpiresAt,
      hardDeadlineAt,
      JSON.stringify({
        ...input.template,
        readinessMode: input.readinessMode ?? 'manual',
      }),
    ],
  );
  await client.query(
    `update tournament_fixture
        set scheduled_starts_at = $2, window_ends_at = $3, updated_at = now()
      where id = $1`,
    [input.fixtureId, input.scheduledStartsAt, hardDeadlineAt],
  );
  return { id: inserted.rows[0]!.id, readinessExpiresAt, hardDeadlineAt };
}

export async function mirrorTournamentAttemptReady(
  client: PoolClient,
  input: { duelMatchId: string; userId: string; readyAt: Date },
): Promise<boolean> {
  const mirrored = await client.query(
    `update tournament_fixture_attempt attempt
        set home_ready_at = case when home.user_id = $2 then $3 else attempt.home_ready_at end,
            away_ready_at = case when away.user_id = $2 then $3 else attempt.away_ready_at end,
            updated_at = now()
       from tournament_fixture fixture
       left join tournament_participant home on home.id = fixture.home_participant_id
       left join tournament_participant away on away.id = fixture.away_participant_id
      where fixture.id = attempt.fixture_id
        and attempt.amateur_duel_match_id = $1
        and attempt.status = 'ready_check'
        and $2::uuid in (home.user_id, away.user_id)`,
    [input.duelMatchId, input.userId, input.readyAt],
  );
  return (mirrored.rowCount ?? 0) > 0;
}

export async function markTournamentAttemptActive(
  client: PoolClient,
  duelMatchId: string,
): Promise<boolean> {
  const activated = await client.query(
    `update tournament_fixture_attempt
        set status = 'active', updated_at = now()
      where amateur_duel_match_id = $1 and status = 'ready_check'
        and home_ready_at is not null and away_ready_at is not null
      returning fixture_id`,
    [duelMatchId],
  );
  if ((activated.rowCount ?? 0) === 0) return false;
  await client.query(
    `update tournament_fixture_segment
        set status = 'active'
      where duel_match_id = $1 and status = 'scheduled'`,
    [duelMatchId],
  );
  return true;
}

interface TournamentAttemptDuelContext {
  attempt_id: string;
  duel_match_id: string | null;
  attempt_kind: string;
  attempt_status: string;
  result_snapshot: Record<string, unknown> | null;
  readiness_expires_at: Date;
  hard_deadline_at: Date;
  home_ready_at: Date | null;
  away_ready_at: Date | null;
  fixture_id: string;
  fixture_status: string;
  series_id: string | null;
  tournament_id: string;
  round_stage: string;
  home_participant_id: string;
  away_participant_id: string;
  home_user_id: string;
  away_user_id: string;
  created_by: string;
  home_duel_state: string | null;
  away_duel_state: string | null;
}

export interface TournamentAttemptReconcileResult {
  matched: boolean;
  changed: boolean;
}

interface EarnedAttemptContext {
  attempt_id: string;
  attempt_number: number;
  attempt_status: string;
  result_snapshot: Record<string, unknown> | null;
  fixture_id: string;
  fixture_status: string;
  series_id: string | null;
  tournament_id: string;
  round_stage: string;
  home_participant_id: string;
  away_participant_id: string;
  home_goals: number;
  home_shots: number;
  home_active_time_ms: number;
  home_state: string;
  away_goals: number;
  away_shots: number;
  away_active_time_ms: number;
  away_state: string;
}

function accuracyPercent(goals: number, shots: number): number {
  return shots > 0 ? (goals / shots) * 100 : 0;
}

export async function hasActiveTournamentAttemptForDuel(
  client: PoolClient,
  duelMatchId: string,
): Promise<boolean> {
  const result = await client.query<{ active: boolean }>(
    `select exists(
       select 1
         from tournament_fixture_attempt
        where amateur_duel_match_id = $1 and status = 'active'
     ) as active`,
    [duelMatchId],
  );
  return result.rows[0]?.active === true;
}

export async function settleEarnedTournamentAttemptForDuel(
  client: PoolClient,
  input: { duelMatchId: string; settledAt: Date },
): Promise<{ matched: boolean; fixtureId?: string; completed: boolean }> {
  const contextResult = await client.query<EarnedAttemptContext>(
    `select attempt.id as attempt_id, attempt.attempt_number,
            attempt.status as attempt_status,
            attempt.result_snapshot, fixture.id as fixture_id,
            fixture.status as fixture_status, fixture.series_id, fixture.tournament_id,
            round.stage as round_stage, fixture.home_participant_id,
            fixture.away_participant_id,
            home_duel.goals as home_goals, home_duel.shots_taken as home_shots,
            home_duel.active_duration_ms as home_active_time_ms,
            home_duel.state as home_state,
            away_duel.goals as away_goals, away_duel.shots_taken as away_shots,
            away_duel.active_duration_ms as away_active_time_ms,
            away_duel.state as away_state
       from tournament_fixture_attempt attempt
       join tournament_fixture fixture on fixture.id = attempt.fixture_id
       join tournament_round round on round.id = fixture.round_id
       join tournament_participant home on home.id = fixture.home_participant_id
       join tournament_participant away on away.id = fixture.away_participant_id
       join amateur_duel_participant home_duel
         on home_duel.match_id = attempt.amateur_duel_match_id
        and home_duel.user_id = home.user_id
       join amateur_duel_participant away_duel
         on away_duel.match_id = attempt.amateur_duel_match_id
        and away_duel.user_id = away.user_id
      where attempt.amateur_duel_match_id = $1
      for update of attempt, fixture`,
    [input.duelMatchId],
  );
  const context = contextResult.rows[0];
  if (context === undefined) return { matched: false, completed: false };
  if (context.attempt_status !== 'active') {
    return {
      matched: true,
      fixtureId: context.fixture_id,
      completed: context.fixture_status === 'settled',
    };
  }
  if (context.home_state !== 'completed' || context.away_state !== 'completed') {
    throw new AppError('conflict', 'tournament attempt participants are not completed', 409);
  }
  const snapshot = context.result_snapshot ?? {};
  const format = snapshot.duelKind;
  if (
    format !== 'express' &&
    format !== 'mix' &&
    format !== 'express_plus' &&
    format !== 'classic'
  ) {
    throw new AppError('configuration_error', 'attempt duel format is not configured', 409);
  }
  const homeScore = {
    goals: Number(context.home_goals),
    accuracyPercent: accuracyPercent(Number(context.home_goals), Number(context.home_shots)),
    activeElapsedMs: Number(context.home_active_time_ms),
  };
  const awayScore = {
    goals: Number(context.away_goals),
    accuracyPercent: accuracyPercent(Number(context.away_goals), Number(context.away_shots)),
    activeElapsedMs: Number(context.away_active_time_ms),
  };
  const resolution = resolveTournamentDuelResult({ format, home: homeScore, away: awayScore });
  if (resolution === 'replay') {
    const duelTemplateId = snapshot.duelTemplateId;
    const periodDurationsMs = snapshot.periodDurationsMs;
    const breakDurationsMs = snapshot.breakDurationsMs;
    const templateSnapshot = tournamentDuelTemplateSnapshotSchema.safeParse(
      snapshot.templateSnapshot,
    );
    if (
      typeof duelTemplateId !== 'string' ||
      !Array.isArray(periodDurationsMs) ||
      !periodDurationsMs.every(
        (duration): duration is number =>
          typeof duration === 'number' && Number.isSafeInteger(duration) && duration > 0,
      ) ||
      !Array.isArray(breakDurationsMs) ||
      !breakDurationsMs.every(
        (duration): duration is number =>
          typeof duration === 'number' && Number.isSafeInteger(duration) && duration >= 0,
      ) ||
      !templateSnapshot.success
    ) {
      throw new AppError('configuration_error', 'attempt timing snapshot is invalid', 409);
    }
    const isRegularReplay = context.round_stage === 'regular';
    const replayStartsAt = new Date(input.settledAt.getTime() + (isRegularReplay ? 0 : 10_000));
    const replayReadyCheckDurationMs = isRegularReplay ? 180_000 : 10_000;
    const replayReadinessExpiresAt = new Date(
      replayStartsAt.getTime() + replayReadyCheckDurationMs,
    );
    const replayHardDeadlineAt = calculateHardGameDeadline({
      plannedStartAt: replayStartsAt,
      readyCheckDurationMs: replayReadyCheckDurationMs,
      templateTiming: { periodDurationsMs, breakDurationsMs },
    });
    const settled = await client.query(
      `update tournament_fixture_attempt
          set status = 'settled', winner_participant_id = null, outcome = 'replay',
              home_score = $2, away_score = $3, home_accuracy = $4, away_accuracy = $5,
              home_active_time_ms = $6, away_active_time_ms = $7,
              result_snapshot = coalesce(result_snapshot, '{}'::jsonb) || $8::jsonb,
              settled_at = $9, updated_at = now()
        where id = $1 and status = 'active'
        returning id`,
      [
        context.attempt_id,
        homeScore.goals,
        awayScore.goals,
        homeScore.accuracyPercent,
        awayScore.accuracyPercent,
        homeScore.activeElapsedMs,
        awayScore.activeElapsedMs,
        JSON.stringify({
          homeShots: Number(context.home_shots),
          awayShots: Number(context.away_shots),
          resolution,
        }),
        input.settledAt,
      ],
    );
    if ((settled.rowCount ?? 0) === 0) {
      return { matched: true, fixtureId: context.fixture_id, completed: false };
    }
    await client.query(
      `update tournament_fixture_segment
          set status = 'settled', home_score = $2, away_score = $3, settled_at = $4
        where duel_match_id = $1 and status in ('scheduled', 'active')`,
      [input.duelMatchId, homeScore.goals, awayScore.goals, input.settledAt],
    );
    await client.query(
      `insert into tournament_fixture_attempt
         (fixture_id, round_game_day_id, attempt_number, kind, status,
          scheduled_starts_at, readiness_expires_at, hard_deadline_at,
          is_result_bearing, result_snapshot)
       values ($1, null, $2, 'replay', 'pending', $3, $4, $5, false, $6::jsonb)`,
      [
        context.fixture_id,
        Number(context.attempt_number) + 1,
        replayStartsAt,
        replayReadinessExpiresAt,
        replayHardDeadlineAt,
        JSON.stringify({
          duelTemplateId,
          duelKind: format,
          periodDurationsMs,
          breakDurationsMs,
          templateSnapshot: templateSnapshot.data,
          readinessMode: isRegularReplay ? 'manual_replay' : 'auto_continue',
          replayOfAttemptId: context.attempt_id,
        }),
      ],
    );
    await client.query(
      `update tournament_fixture
          set status = 'scheduled', winner_participant_id = null, outcome = null,
              home_score = 0, away_score = 0,
              scheduled_starts_at = $2, window_ends_at = $3, settled_at = null,
              result_snapshot = coalesce(result_snapshot, '{}'::jsonb) || $4::jsonb,
              updated_at = now()
        where id = $1`,
      [
        context.fixture_id,
        replayStartsAt,
        replayHardDeadlineAt,
        JSON.stringify({ replayPending: true, replayOfAttemptId: context.attempt_id }),
      ],
    );
    return { matched: true, fixtureId: context.fixture_id, completed: false };
  }

  const winnerParticipantId =
    resolution === 'home_win' ? context.home_participant_id : context.away_participant_id;
  const attemptUpdated = await client.query(
    `update tournament_fixture_attempt
        set status = 'settled', winner_participant_id = $2, outcome = $3,
            home_score = $4, away_score = $5, home_accuracy = $6, away_accuracy = $7,
            home_active_time_ms = $8, away_active_time_ms = $9,
            result_snapshot = coalesce(result_snapshot, '{}'::jsonb) || $10::jsonb,
            settled_at = $11, updated_at = now()
      where id = $1 and status = 'active'
      returning id`,
    [
      context.attempt_id,
      winnerParticipantId,
      resolution,
      homeScore.goals,
      awayScore.goals,
      homeScore.accuracyPercent,
      awayScore.accuracyPercent,
      homeScore.activeElapsedMs,
      awayScore.activeElapsedMs,
      JSON.stringify({
        homeShots: Number(context.home_shots),
        awayShots: Number(context.away_shots),
        resolution,
      }),
      input.settledAt,
    ],
  );
  if ((attemptUpdated.rowCount ?? 0) === 0) {
    return { matched: true, fixtureId: context.fixture_id, completed: false };
  }
  await client.query(
    `update tournament_fixture_segment
        set status = 'settled', home_score = $2, away_score = $3, settled_at = $4
      where duel_match_id = $1 and status in ('scheduled', 'active')`,
    [input.duelMatchId, homeScore.goals, awayScore.goals, input.settledAt],
  );
  await client.query(
    `update tournament_fixture
        set status = 'settled', winner_participant_id = $2, outcome = $3,
            home_score = $4, away_score = $5,
            result_snapshot = coalesce(result_snapshot, '{}'::jsonb) || $6::jsonb,
            settled_at = $7, updated_at = now()
      where id = $1 and status in ('conditional', 'scheduled', 'open', 'active')`,
    [
      context.fixture_id,
      winnerParticipantId,
      resolution,
      homeScore.goals,
      awayScore.goals,
      JSON.stringify({ attemptId: context.attempt_id, duelKind: format }),
      input.settledAt,
    ],
  );
  if (context.series_id !== null) {
    await advanceTournamentPlayoffSeries(client, {
      seriesId: context.series_id,
      winnerParticipantId,
    });
  }
  if (context.round_stage === 'regular') {
    await rebuildHeadToHeadStandings(client, context.tournament_id);
  }
  await enqueueTournamentFixtureResultPush(client, {
    fixtureId: context.fixture_id,
    homeParticipantId: context.home_participant_id,
    awayParticipantId: context.away_participant_id,
    winnerParticipantId,
  });
  return { matched: true, fixtureId: context.fixture_id, completed: true };
}

async function settleTechnicalTournamentAttempt(
  client: PoolClient,
  context: TournamentAttemptDuelContext,
  input: {
    duelMatchId: string;
    winner: 'home' | 'away';
    attemptOutcome: 'home_no_show' | 'away_no_show' | 'home_win' | 'away_win';
    reason: string;
    now: Date;
  },
): Promise<boolean> {
  const winnerParticipantId =
    input.winner === 'home' ? context.home_participant_id : context.away_participant_id;
  const fixtureOutcome = input.winner === 'home' ? 'home_win' : 'away_win';
  const attemptUpdated = await client.query(
    `update tournament_fixture_attempt
        set status = 'technical_result', winner_participant_id = $2, outcome = $3,
            result_snapshot = coalesce(result_snapshot, '{}'::jsonb) || $4::jsonb,
            settled_at = $5, updated_at = now()
      where id = $1 and status in ('ready_check', 'active')
      returning id`,
    [
      context.attempt_id,
      winnerParticipantId,
      input.attemptOutcome,
      JSON.stringify({ technical: true, reason: input.reason }),
      input.now,
    ],
  );
  if ((attemptUpdated.rowCount ?? 0) === 0) return false;

  await cancelTournamentDuel(client, { duelMatchId: input.duelMatchId, reason: input.reason });
  await client.query(
    `update tournament_fixture_segment
        set status = 'cancelled'
      where duel_match_id = $1 and status in ('pending', 'scheduled', 'active')`,
    [input.duelMatchId],
  );
  await client.query(
    `update tournament_fixture
        set status = 'settled', winner_participant_id = $2, outcome = $3,
            result_snapshot = coalesce(result_snapshot, '{}'::jsonb) || $4::jsonb,
            settled_at = $5, updated_at = now()
      where id = $1 and status in ('conditional', 'scheduled', 'open', 'active')`,
    [
      context.fixture_id,
      winnerParticipantId,
      fixtureOutcome,
      JSON.stringify({ technical: true, reason: input.reason, attemptId: context.attempt_id }),
      input.now,
    ],
  );
  await client.query(
    `insert into tournament_adjustment
       (tournament_id, fixture_id, participant_id, kind, payload, reason, created_by)
     values ($1, $2, $3, 'forfeit', $4::jsonb, $5, $6)`,
    [
      context.tournament_id,
      context.fixture_id,
      winnerParticipantId,
      JSON.stringify({
        attemptId: context.attempt_id,
        winnerParticipantId,
        outcome: input.attemptOutcome,
        technical: true,
      }),
      input.reason,
      context.created_by,
    ],
  );
  if (context.series_id !== null) {
    await advanceTournamentPlayoffSeries(client, {
      seriesId: context.series_id,
      winnerParticipantId,
    });
  }
  if (context.round_stage === 'regular') {
    await rebuildHeadToHeadStandings(client, context.tournament_id);
  }
  await enqueueTournamentFixtureResultPush(client, {
    fixtureId: context.fixture_id,
    homeParticipantId: context.home_participant_id,
    awayParticipantId: context.away_participant_id,
    winnerParticipantId,
  });
  return true;
}

async function pauseTournamentAttempt(
  client: PoolClient,
  context: TournamentAttemptDuelContext,
  input: {
    duelMatchId: string | null;
    status: 'needs_reschedule' | 'needs_admin_decision';
    outcome: 'both_no_show' | 'both_incomplete' | null;
    incidentKind: 'both_no_show' | 'both_incomplete' | 'regular_replay_readiness_unresolved';
    reason: string;
    now: Date;
  },
): Promise<boolean> {
  const attemptUpdated = await client.query(
    `update tournament_fixture_attempt
        set status = $2, outcome = $3,
            result_snapshot = coalesce(result_snapshot, '{}'::jsonb) || $4::jsonb,
            updated_at = now()
      where id = $1 and status in ('pending', 'ready_check', 'active')
      returning id`,
    [context.attempt_id, input.status, input.outcome, JSON.stringify({ reason: input.reason })],
  );
  if ((attemptUpdated.rowCount ?? 0) === 0) return false;

  if (input.duelMatchId !== null) {
    await cancelTournamentDuel(client, {
      duelMatchId: input.duelMatchId,
      reason: input.reason,
    });
    await client.query(
      `update tournament_fixture_segment
          set status = 'cancelled'
        where duel_match_id = $1 and status in ('pending', 'scheduled', 'active')`,
      [input.duelMatchId],
    );
  }
  await client.query(
    `update tournament_fixture
        set status = 'paused', rescheduled_reason = $2, updated_at = now()
      where id = $1 and status in ('conditional', 'scheduled', 'open', 'active')`,
    [context.fixture_id, input.reason],
  );
  if (context.series_id !== null) {
    await client.query(
      `update tournament_playoff_series
          set status = 'paused', updated_at = now()
        where id = $1 and status in ('pending', 'scheduled', 'active')`,
      [context.series_id],
    );
  }
  await client.query(
    `insert into tournament_incident
       (tournament_id, series_id, fixture_id, fixture_attempt_id, kind, details, opened_at)
     values ($1, $2, $3, $4, $5, $6::jsonb, $7)
     on conflict (fixture_attempt_id, kind) where status = 'open' do nothing`,
    [
      context.tournament_id,
      context.series_id,
      context.fixture_id,
      context.attempt_id,
      input.incidentKind,
      JSON.stringify({ reason: input.reason }),
      input.now,
    ],
  );
  return true;
}

export async function reconcileTournamentAttemptForDuel(
  client: PoolClient,
  input: { duelMatchId: string; now: Date },
): Promise<TournamentAttemptReconcileResult> {
  const contextResult = await client.query<TournamentAttemptDuelContext>(
    `select attempt.id as attempt_id, attempt.amateur_duel_match_id as duel_match_id,
            attempt.kind as attempt_kind, attempt.status as attempt_status,
            attempt.result_snapshot,
            attempt.readiness_expires_at, attempt.hard_deadline_at,
            attempt.home_ready_at, attempt.away_ready_at,
            fixture.id as fixture_id, fixture.status as fixture_status, fixture.series_id,
            fixture.tournament_id, round.stage as round_stage,
            fixture.home_participant_id, fixture.away_participant_id,
            home.user_id as home_user_id, away.user_id as away_user_id,
            tournament.created_by, home_duel.state as home_duel_state,
            away_duel.state as away_duel_state
       from tournament_fixture_attempt attempt
       join tournament_fixture fixture on fixture.id = attempt.fixture_id
       join tournament_round round on round.id = fixture.round_id
       join tournament tournament on tournament.id = fixture.tournament_id
       join tournament_participant home on home.id = fixture.home_participant_id
       join tournament_participant away on away.id = fixture.away_participant_id
       join amateur_duel_participant home_duel
         on home_duel.match_id = attempt.amateur_duel_match_id
        and home_duel.user_id = home.user_id
       join amateur_duel_participant away_duel
         on away_duel.match_id = attempt.amateur_duel_match_id
        and away_duel.user_id = away.user_id
      where attempt.amateur_duel_match_id = $1
      for update of attempt, fixture`,
    [input.duelMatchId],
  );
  const context = contextResult.rows[0];
  if (context === undefined) return { matched: false, changed: false };
  if (
    !['pending', 'ready_check', 'active'].includes(context.attempt_status) ||
    !['conditional', 'scheduled', 'open', 'active'].includes(context.fixture_status)
  ) {
    return { matched: true, changed: false };
  }

  if (context.attempt_status === 'pending' || context.attempt_status === 'ready_check') {
    if (input.now < context.readiness_expires_at) return { matched: true, changed: false };
    const homeReady = context.home_ready_at !== null;
    const awayReady = context.away_ready_at !== null;
    if (homeReady !== awayReady) {
      const winner = homeReady ? 'home' : 'away';
      const changed = await settleTechnicalTournamentAttempt(client, context, {
        duelMatchId: input.duelMatchId,
        winner,
        attemptOutcome: homeReady ? 'away_no_show' : 'home_no_show',
        reason: homeReady ? 'tournament_attempt_away_no_show' : 'tournament_attempt_home_no_show',
        now: input.now,
      });
      return { matched: true, changed };
    }
    if (!homeReady && !awayReady) {
      const isManualRegularReplay =
        context.round_stage === 'regular' &&
        context.attempt_kind === 'replay' &&
        context.result_snapshot?.readinessMode === 'manual_replay';
      const changed = await pauseTournamentAttempt(client, context, {
        duelMatchId: input.duelMatchId,
        status: isManualRegularReplay ? 'needs_admin_decision' : 'needs_reschedule',
        outcome: isManualRegularReplay ? null : 'both_no_show',
        incidentKind: isManualRegularReplay
          ? 'regular_replay_readiness_unresolved'
          : 'both_no_show',
        reason: isManualRegularReplay
          ? 'regular_replay_readiness_unresolved'
          : 'tournament_attempt_both_no_show',
        now: input.now,
      });
      return { matched: true, changed };
    }
    return { matched: true, changed: false };
  }
  if (context.attempt_status === 'active' && input.now >= context.hard_deadline_at) {
    const homeCompleted = context.home_duel_state === 'completed';
    const awayCompleted = context.away_duel_state === 'completed';
    if (homeCompleted !== awayCompleted) {
      const winner = homeCompleted ? 'home' : 'away';
      const changed = await settleTechnicalTournamentAttempt(client, context, {
        duelMatchId: input.duelMatchId,
        winner,
        attemptOutcome: homeCompleted ? 'home_win' : 'away_win',
        reason: homeCompleted
          ? 'tournament_attempt_away_incomplete'
          : 'tournament_attempt_home_incomplete',
        now: input.now,
      });
      return { matched: true, changed };
    }
    if (!homeCompleted && !awayCompleted) {
      const changed = await pauseTournamentAttempt(client, context, {
        duelMatchId: input.duelMatchId,
        status: 'needs_admin_decision',
        outcome: 'both_incomplete',
        incidentKind: 'both_incomplete',
        reason: 'tournament_attempt_both_incomplete',
        now: input.now,
      });
      return { matched: true, changed };
    }
  }
  return { matched: true, changed: false };
}

export async function reconcileTournamentAttemptForFixture(
  client: PoolClient,
  input: { fixtureId: string; now: Date },
): Promise<TournamentAttemptReconcileResult> {
  const contextResult = await client.query<TournamentAttemptDuelContext>(
    `select attempt.id as attempt_id, attempt.amateur_duel_match_id as duel_match_id,
            attempt.kind as attempt_kind, attempt.status as attempt_status,
            attempt.result_snapshot, attempt.readiness_expires_at,
            attempt.hard_deadline_at,
            attempt.home_ready_at, attempt.away_ready_at,
            fixture.id as fixture_id, fixture.status as fixture_status, fixture.series_id,
            fixture.tournament_id, round.stage as round_stage,
            fixture.home_participant_id, fixture.away_participant_id,
            home.user_id as home_user_id, away.user_id as away_user_id,
            tournament.created_by, null::text as home_duel_state,
            null::text as away_duel_state
       from tournament_fixture_attempt attempt
       join tournament_fixture fixture on fixture.id = attempt.fixture_id
       join tournament_round round on round.id = fixture.round_id
       join tournament tournament on tournament.id = fixture.tournament_id
       join tournament_participant home on home.id = fixture.home_participant_id
       join tournament_participant away on away.id = fixture.away_participant_id
      where attempt.fixture_id = $1
      order by attempt.attempt_number desc
      limit 1
      for update of attempt, fixture`,
    [input.fixtureId],
  );
  const context = contextResult.rows[0];
  if (context === undefined) return { matched: false, changed: false };
  const isUnlinkedAutoContinueReplay =
    context.duel_match_id === null &&
    context.attempt_kind === 'replay' &&
    context.result_snapshot?.readinessMode === 'auto_continue';
  if (isUnlinkedAutoContinueReplay) {
    if (input.now < context.hard_deadline_at) return { matched: true, changed: false };
    const changed = await pauseTournamentAttempt(client, context, {
      duelMatchId: null,
      status: 'needs_admin_decision',
      outcome: 'both_incomplete',
      incidentKind: 'both_incomplete',
      reason: 'tournament_attempt_both_incomplete',
      now: input.now,
    });
    return { matched: true, changed };
  }
  if (
    !['pending', 'ready_check'].includes(context.attempt_status) ||
    !['conditional', 'scheduled', 'open', 'active'].includes(context.fixture_status) ||
    input.now < context.readiness_expires_at
  ) {
    return { matched: true, changed: false };
  }
  const homeReady = context.home_ready_at !== null;
  const awayReady = context.away_ready_at !== null;
  if (homeReady !== awayReady && context.duel_match_id !== null) {
    const winner = homeReady ? 'home' : 'away';
    const changed = await settleTechnicalTournamentAttempt(client, context, {
      duelMatchId: context.duel_match_id,
      winner,
      attemptOutcome: homeReady ? 'away_no_show' : 'home_no_show',
      reason: homeReady ? 'tournament_attempt_away_no_show' : 'tournament_attempt_home_no_show',
      now: input.now,
    });
    return { matched: true, changed };
  }
  if (!homeReady && !awayReady) {
    const isManualRegularReplay =
      context.round_stage === 'regular' &&
      context.attempt_kind === 'replay' &&
      context.result_snapshot?.readinessMode === 'manual_replay';
    const changed = await pauseTournamentAttempt(client, context, {
      duelMatchId: context.duel_match_id,
      status: isManualRegularReplay ? 'needs_admin_decision' : 'needs_reschedule',
      outcome: isManualRegularReplay ? null : 'both_no_show',
      incidentKind: isManualRegularReplay ? 'regular_replay_readiness_unresolved' : 'both_no_show',
      reason: isManualRegularReplay
        ? 'regular_replay_readiness_unresolved'
        : 'tournament_attempt_both_no_show',
      now: input.now,
    });
    return { matched: true, changed };
  }
  return { matched: true, changed: false };
}
