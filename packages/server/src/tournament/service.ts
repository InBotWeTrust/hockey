import type { Pool, PoolClient } from 'pg';
import { AppError } from '../plugins/errors.js';
import { appendEvent } from '../duel/eventLog.js';
import { grantTournamentStageRewardsWithClient, resolvePlayoffPlacements } from './rewards.js';
import { cancelTournamentDuel } from '../duel/amateur/lifecycle.js';
import { enqueueTournamentAudiencePush, enqueueTournamentPush } from '../push/tournament.js';
import { decideTournamentApplication, evaluateTournamentEligibility } from './registration.js';
import { buildHeadToHeadSchedulePlan } from './materialize.js';
import { addZonedCalendarDays } from './schedule.js';
import {
  attemptDeadline,
  insertInitialFixtureAttempt,
  insertRoundGameDays,
  loadDuelTemplateLifecycleSnapshot,
  resolveRoundGameDays,
  type DuelTemplateLifecycleSnapshot,
  type ResolvedRoundGameDay,
} from './fixtureAttempts.js';
import {
  DEFAULT_TOURNAMENT_GAME_DURATION_MINUTES,
  DEFAULT_TOURNAMENT_INTER_GAME_BREAK_MINUTES,
  DEFAULT_TOURNAMENT_READINESS_MINUTES,
  normalizePublishedTournamentLifecycleRules,
} from './lifecycleRules.js';
import {
  AUTOMATIC_TOURNAMENT_LIFECYCLE_VERSION,
  automaticLifecycleVersion,
  loadTournamentLifecycleDTOs,
  type TournamentLifecycleDTO,
} from './automaticLifecycle.js';
import {
  rebaseRoundGameDaysAtOrAfter,
  validateRoundGameDays,
  type RoundGameDay,
} from './playoffScheduling.js';
import {
  buildPlayoffSeriesPlan,
  buildPlayoffFixtureWindows,
  expandSeriesSchedule,
  type HomeDesignation,
  type PlayoffParticipantSource,
} from './playoffs.js';
import { rebuildHeadToHeadStandings } from './standingsPersistence.js';
import { rebuildDailyAggregateStandings } from './dailyAggregate.js';
import { advanceTournamentPlayoffSeries } from './playoffSeriesLifecycle.js';
import {
  enqueueTournamentFixtureResultPush,
} from './fixtureNotifications.js';
import { lockTournament, lockTournamentFixture } from './locks.js';
import { canTransitionTournament } from './lifecycle.js';
import { tournamentSlugBase } from './slug.js';
import type { TournamentConfig, TournamentPlayoffSize, TournamentStatus } from './types.js';

export interface TournamentRulesSnapshot {
  config: TournamentConfig;
  eligibility: {
    minLevel: number | null;
    maxLevel: number | null;
    minGoals: number;
    minExperience: number;
    invitedUserIds: string[];
    bannedUserIds: string[];
  };
  [key: string]: unknown;
}

const PLAYOFF_SCHEDULING_FIELDS = new Set([
  'firstGameStartsAt',
  'scheduleDays',
  'roundBreakMs',
  'readinessMinutes',
  'gameDurationMinutes',
  'interGameBreakMinutes',
]);
const DEFAULT_PLAYOFF_READINESS_MINUTES = 5;
const DEFAULT_PLAYOFF_START_INTERVAL_MINUTES = 30;
const LEGACY_TOURNAMENT_EDITOR_DEFAULTS: Record<string, unknown> = {
  regularDuelTemplateId: null,
  regularScoring: {
    regulationWin: 3,
    overtimeWin: 2,
    overtimeLoss: 1,
    draw: 1,
    loss: 0,
    technicalLoss: 0,
  },
  dailyPlacePoints: [],
  stageRewards: { regular: [], playoff: [] },
  notificationReminderOffsetsMs: [1_800_000, 300_000],
  notificationDeadlineLeadMs: 1_800_000,
  notificationOverrides: {},
};

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

function isJsonSubset(current: unknown, candidate: unknown): boolean {
  if (Array.isArray(candidate)) {
    return (
      Array.isArray(current) &&
      current.length === candidate.length &&
      candidate.every((value, index) => isJsonSubset(current[index], value))
    );
  }
  if (candidate !== null && typeof candidate === 'object') {
    if (current === null || typeof current !== 'object' || Array.isArray(current)) return false;
    const currentRecord = current as Record<string, unknown>;
    return Object.entries(candidate as Record<string, unknown>).every(
      ([key, value]) =>
        Object.prototype.hasOwnProperty.call(currentRecord, key) &&
        isJsonSubset(currentRecord[key], value),
    );
  }
  return stableJson(current) === stableJson(candidate);
}

function rulesWithoutPlayoffSchedule(rules: TournamentRulesSnapshot): Record<string, unknown> {
  const rest: Record<string, unknown> = { ...rules };
  const playoffRounds = rest.playoffRounds;
  delete rest.playoffRounds;
  delete rest.automaticLifecycleVersion;
  delete rest.duelLifecycleVersion;
  return {
    ...rest,
    playoffRounds: Array.isArray(playoffRounds)
      ? playoffRounds.map((round) => {
          if (round === null || typeof round !== 'object' || Array.isArray(round)) return round;
          const values = round as Record<string, unknown>;
          return Object.fromEntries(
            Object.entries(values).filter(([key, value]) => {
              if (PLAYOFF_SCHEDULING_FIELDS.has(key)) return false;
              // The HTTP parser fills these legacy omissions with their standard values only
              // after scheduleDays appears. They are not a manual rule change.
              if (key === 'readinessMinutes' && value === DEFAULT_PLAYOFF_READINESS_MINUTES) {
                return false;
              }
              if (
                key === 'plannedStartIntervalMinutes' &&
                value === DEFAULT_PLAYOFF_START_INTERVAL_MINUTES
              ) {
                return false;
              }
              return true;
            }),
          );
        })
      : playoffRounds,
  };
}

function isPlayoffScheduleOnlyRulesUpdate(
  current: TournamentRulesSnapshot,
  next: TournamentRulesSnapshot,
): boolean {
  const currentWithoutSchedule = rulesWithoutPlayoffSchedule(current);
  const nextWithoutSchedule = rulesWithoutPlayoffSchedule(next);
  for (const [key, defaultValue] of Object.entries(LEGACY_TOURNAMENT_EDITOR_DEFAULTS)) {
    if (
      !Object.prototype.hasOwnProperty.call(currentWithoutSchedule, key) &&
      stableJson(nextWithoutSchedule[key]) === stableJson(defaultValue)
    ) {
      delete nextWithoutSchedule[key];
    }
  }
  return isJsonSubset(currentWithoutSchedule, nextWithoutSchedule);
}

function mergePlayoffScheduleRules(
  current: TournamentRulesSnapshot,
  next: TournamentRulesSnapshot,
): TournamentRulesSnapshot {
  const currentRounds = Array.isArray(current.playoffRounds) ? current.playoffRounds : [];
  const nextRounds = Array.isArray(next.playoffRounds) ? next.playoffRounds : [];
  return {
    ...current,
    playoffRounds: currentRounds.map((currentRound, index) => {
      if (
        currentRound === null ||
        typeof currentRound !== 'object' ||
        Array.isArray(currentRound)
      ) {
        return currentRound;
      }
      const currentValues = currentRound as Record<string, unknown>;
      const currentRoundNumber = currentValues.roundNumber;
      const nextRound = nextRounds.find((candidate, candidateIndex) => {
        if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
          return false;
        }
        const candidateRoundNumber = (candidate as Record<string, unknown>).roundNumber;
        return (
          (typeof currentRoundNumber === 'number' && candidateRoundNumber === currentRoundNumber) ||
          (currentRoundNumber === undefined && candidateIndex === index)
        );
      });
      if (nextRound === null || typeof nextRound !== 'object' || Array.isArray(nextRound)) {
        return currentRound;
      }
      const nextValues = nextRound as Record<string, unknown>;
      const merged = { ...currentValues };
      for (const field of PLAYOFF_SCHEDULING_FIELDS) {
        if (!Object.prototype.hasOwnProperty.call(nextValues, field)) continue;
        if (
          field === 'roundBreakMs' &&
          !Object.prototype.hasOwnProperty.call(currentValues, field)
        ) {
          continue;
        }
        merged[field] = nextValues[field];
      }
      delete merged.plannedStartIntervalMinutes;
      return merged;
    }),
  };
}

function playoffRoundScheduleKey(rules: TournamentRulesSnapshot, roundNumber: number): string {
  const round = playoffRoundRules(rules, roundNumber);
  return stableJson({
    firstGameStartsAt: round.firstGameStartsAt?.toISOString() ?? null,
    roundBreakMs: round.roundBreakMs,
    scheduleDays: round.scheduleDays,
    gameDurationMinutes: round.gameDurationMinutes,
    readinessMinutes: round.readinessMinutes,
    interGameBreakMinutes: round.interGameBreakMinutes,
  });
}

async function reschedulePublishedPlayoffRounds(
  client: PoolClient,
  input: {
    tournamentId: string;
    currentRules: TournamentRulesSnapshot;
    nextRules: TournamentRulesSnapshot;
    adminUserId: string;
    now: Date;
  },
): Promise<void> {
  const rounds = await client.query<{
    id: string;
    number: number;
  }>(
    `select id, number
       from tournament_round
      where tournament_id = $1 and stage in ('playoff', 'third_place')
      order by number, stage
      for update`,
    [input.tournamentId],
  );
  for (const round of rounds.rows) {
    const roundNumber = Number(round.number);
    if (
      playoffRoundScheduleKey(input.currentRules, roundNumber) ===
      playoffRoundScheduleKey(input.nextRules, roundNumber)
    ) {
      continue;
    }
    const rules = playoffRoundRules(input.nextRules, roundNumber);
    if (rules.scheduleDays === null || rules.duelTemplateId === null) {
      throw new AppError('configuration_error', 'Для раунда не настроено расписание игр', 409);
    }
    validateRoundGameDays({
      winsRequired: rules.winsRequired,
      readinessMinutes: rules.readinessMinutes,
      gameDurationMinutes: rules.gameDurationMinutes,
      interGameBreakMinutes: rules.interGameBreakMinutes,
      ...(rules.plannedStartIntervalMinutes === null
        ? {}
        : { plannedStartIntervalMinutes: rules.plannedStartIntervalMinutes }),
      days: rules.scheduleDays,
    });
    const days = resolveRoundGameDays(input.nextRules.config.timezone, rules.scheduleDays);
    const template = await loadDuelTemplateLifecycleSnapshot(client, rules.duelTemplateId);
    await client.query(
      `select id from tournament_fixture
        where round_id = $1
        order by fixture_number
        for update`,
      [round.id],
    );
    await client.query(
      `select attempt.id
         from tournament_fixture_attempt attempt
         join tournament_fixture fixture on fixture.id = attempt.fixture_id
        where fixture.round_id = $1
        order by attempt.fixture_id, attempt.attempt_number
        for update of attempt`,
      [round.id],
    );
    const fixtures = await client.query<{
      id: string;
      status: string;
      game_number: number | null;
      attempt_id: string | null;
      attempt_status: string | null;
      duel_id: string | null;
      home_ready_at: Date | null;
      away_ready_at: Date | null;
      attempt_outcome: string | null;
      attempt_count: number;
      duel_status: string | null;
      round_game_day_id: string | null;
      duel_accepted_at: Date | null;
      duel_settled_reason: string | null;
      duel_shot_count: number;
    }>(
      `select fixture.id, fixture.status,
              (fixture.result_snapshot->>'gameNumber')::int as game_number,
              attempt.id as attempt_id, attempt.status as attempt_status,
              attempt.amateur_duel_match_id as duel_id,
              attempt.home_ready_at, attempt.away_ready_at, attempt.outcome as attempt_outcome,
              (select count(*)::int from tournament_fixture_attempt counted
                where counted.fixture_id = fixture.id) as attempt_count,
              duel.status as duel_status, duel.accepted_at as duel_accepted_at,
              duel.settled_reason as duel_settled_reason,
              coalesce((
                select count(*)::int from shot_session shot
                 where shot.amateur_duel_match_id = attempt.amateur_duel_match_id
              ), 0) as duel_shot_count
         from tournament_fixture fixture
         left join lateral (
           select candidate.*
             from tournament_fixture_attempt candidate
            where candidate.fixture_id = fixture.id
            order by candidate.attempt_number desc
            limit 1
        ) attempt on true
        left join amateur_duel_match duel on duel.id = attempt.amateur_duel_match_id
        where fixture.round_id = $1
        order by fixture.fixture_number`,
      [round.id],
    );
    const blocked = fixtures.rows.some((fixture) => {
      const readinessWasConfirmed =
        fixture.home_ready_at !== null || fixture.away_ready_at !== null;
      const unattendedReadiness =
        fixture.attempt_status === 'ready_check' &&
        !readinessWasConfirmed &&
        fixture.duel_id === null;
      const unattendedNoShow =
        fixture.attempt_status === 'needs_reschedule' &&
        fixture.attempt_outcome === 'both_no_show' &&
        !readinessWasConfirmed &&
        fixture.duel_id !== null &&
        fixture.duel_status === 'cancelled' &&
        fixture.duel_accepted_at === null &&
        fixture.duel_settled_reason === 'tournament_attempt_both_no_show' &&
        fixture.duel_shot_count === 0;
      const attemptIsSafe =
        fixture.attempt_id === null ||
        (fixture.attempt_status === 'pending' &&
          !readinessWasConfirmed &&
          fixture.duel_id === null) ||
        unattendedReadiness ||
        unattendedNoShow;
      const fixtureIsSafe =
        ['conditional', 'scheduled'].includes(fixture.status) ||
        (fixture.status === 'active' && unattendedReadiness) ||
        (fixture.status === 'paused' && unattendedNoShow);
      return !fixtureIsSafe || !attemptIsSafe || fixture.attempt_count > 1;
    });
    if (blocked) {
      throw new AppError(
        'playoff_round_started',
        `Раунд ${roundNumber} уже начался. Перенесите оставшиеся игры отдельно в календаре`,
        409,
        { roundNumber },
      );
    }
    const planned = fixtures.rows.map((fixture) => {
      if (fixture.game_number === null) {
        throw new AppError('configuration_error', 'У игры не указан номер в серии', 409);
      }
      const slot =
        fixture.game_number === 1
          ? { day: days[0]!, startsAt: days[0]!.firstGameStartsAt }
          : null;
      if (slot !== null && slot.startsAt <= input.now) {
        throw new AppError('bad_request', 'Новое время игр должно быть в будущем', 400);
      }
      return {
        fixture,
        slot,
        hardDeadlineAt:
          slot === null
            ? null
            : attemptDeadline(
                slot.startsAt,
                rules.readinessMinutes,
                template,
                rules.gameDurationMinutes,
              ),
      };
    });

    await client.query(
      `update tournament_fixture_attempt attempt
          set round_game_day_id = null
         from tournament_fixture fixture
        where fixture.id = attempt.fixture_id and fixture.round_id = $1`,
      [round.id],
    );
    await client.query(`delete from tournament_round_game_day where round_id = $1`, [round.id]);
    const persistedDays = await insertRoundGameDays(client, {
      roundId: round.id,
      days,
      readinessMinutes: rules.readinessMinutes,
      interGameBreakMinutes: rules.interGameBreakMinutes,
    });
    const dayByNumber = new Map(persistedDays.map((day) => [day.dayNumber, day]));
    let roundEnd = new Date(
      Math.max(
        ...persistedDays.map((day) =>
          attemptDeadline(
            new Date(
              day.firstGameStartsAt.getTime() +
                (day.maxResultGames - 1) *
                  (rules.gameDurationMinutes + rules.interGameBreakMinutes) *
                  60_000,
            ),
            rules.readinessMinutes,
            template,
            rules.gameDurationMinutes,
          ).getTime(),
        ),
      ),
    );
    for (const item of planned) {
      if (item.slot === null) {
        if (item.fixture.attempt_id !== null) {
          await client.query(
            `delete from tournament_fixture_attempt where id = $1 and status = 'pending'`,
            [item.fixture.attempt_id],
          );
        }
        await client.query(
          `update tournament_fixture
              set scheduled_starts_at = null, window_ends_at = null,
                  rescheduled_reason = 'Изменение расписания плей-офф', updated_at = now()
            where id = $1`,
          [item.fixture.id],
        );
        continue;
      }
      const persistedDay = dayByNumber.get(item.slot.day.dayNumber)!;
      const readinessExpiresAt = new Date(
        item.slot.startsAt.getTime() + rules.readinessMinutes * 60_000,
      );
      if (item.fixture.attempt_id === null) {
        await insertInitialFixtureAttempt(client, {
          fixtureId: item.fixture.id,
          roundGameDayId: persistedDay.id!,
          scheduledStartsAt: item.slot.startsAt,
          readinessMinutes: rules.readinessMinutes,
          gameDurationMinutes: rules.gameDurationMinutes,
          template,
          rescheduledReason: 'Изменение расписания плей-офф',
        });
      } else {
        await client.query(
          `update tournament_fixture_attempt
              set status = 'pending', round_game_day_id = $2,
                  scheduled_starts_at = $3, readiness_expires_at = $4,
                  hard_deadline_at = $5, amateur_duel_match_id = null,
                  home_ready_at = null, away_ready_at = null,
                  outcome = null, winner_participant_id = null,
                  home_score = null, away_score = null,
                  home_accuracy = null, away_accuracy = null,
                  home_active_time_ms = null, away_active_time_ms = null,
                  settled_at = null,
                  result_snapshot = coalesce(result_snapshot, '{}'::jsonb)
                    || $6::jsonb,
                  updated_at = now()
            where id = $1`,
          [
            item.fixture.attempt_id,
            persistedDay.id,
            item.slot.startsAt,
            readinessExpiresAt,
            item.hardDeadlineAt,
            JSON.stringify({
              ...template,
              readinessMode: 'manual',
              rescheduledReason: 'Изменение расписания плей-офф',
            }),
          ],
        );
        await client.query(
          `update tournament_incident
              set status = 'resolved', resolved_at = now(), resolved_by = $2, updated_at = now()
            where fixture_attempt_id = $1 and status = 'open'`,
          [item.fixture.attempt_id, input.adminUserId],
        );
      }
      await client.query(
        `update tournament_fixture
            set scheduled_starts_at = $2, window_ends_at = $3,
                status = case when status in ('active', 'paused') then 'scheduled' else status end,
                rescheduled_reason = 'Изменение расписания плей-офф', updated_at = now()
          where id = $1`,
        [item.fixture.id, item.slot.startsAt, item.hardDeadlineAt],
      );
      await client.query(
        `insert into tournament_adjustment
           (tournament_id, fixture_id, kind, payload, reason, created_by)
         values ($1, $2, 'schedule', $3, 'Изменение расписания плей-офф', $4)`,
        [
          input.tournamentId,
          item.fixture.id,
          JSON.stringify({ startsAt: item.slot.startsAt, endsAt: item.hardDeadlineAt }),
          input.adminUserId,
        ],
      );
      if (item.hardDeadlineAt! > roundEnd) roundEnd = item.hardDeadlineAt!;
    }
    await client.query(
      `update tournament_playoff_series
          set status = 'scheduled', updated_at = now()
        where round_id = $1 and status in ('active', 'paused')
          and winner_participant_id is null
          and higher_seed_wins = 0 and lower_seed_wins = 0`,
      [round.id],
    );
    await client.query(
      `update tournament_round
          set starts_at = $2, ends_at = $3,
              rules_snapshot = coalesce(rules_snapshot, '{}'::jsonb) || $4::jsonb
        where id = $1`,
      [
        round.id,
        persistedDays[0]!.firstGameStartsAt,
        roundEnd,
        JSON.stringify({
          firstGameStartsAt: persistedDays[0]!.firstGameStartsAt.toISOString(),
          roundBreakMs: rules.roundBreakMs,
          scheduleDays: rules.scheduleDays,
        }),
      ],
    );
  }

  const championshipRounds = await client.query<{
    number: number;
    starts_at: Date;
    ends_at: Date;
  }>(
    `select number, starts_at, ends_at
       from tournament_round
      where tournament_id = $1 and stage = 'playoff'
      order by number`,
    [input.tournamentId],
  );
  for (let index = 1; index < championshipRounds.rows.length; index += 1) {
    const previous = championshipRounds.rows[index - 1]!;
    const current = championshipRounds.rows[index]!;
    const earliestStart = new Date(
      previous.ends_at.getTime() +
        playoffRoundRules(input.nextRules, Number(previous.number)).roundBreakMs,
    );
    if (current.starts_at < earliestStart) {
      throw new AppError(
        'playoff_round_schedule_order',
        `Раунд ${current.number} должен начинаться после окончания предыдущего раунда и паузы`,
        400,
        { roundNumber: Number(current.number), previousRoundNumber: Number(previous.number) },
      );
    }
  }
}

export interface GenerateRegularScheduleOutcome {
  tournamentId: string;
  beforeStatus: TournamentStatus;
  status: 'registration_blocked' | 'scheduling';
  revision: number;
  participantCount: number;
  playoffSize: TournamentConfig['playoffSize'];
  title: string;
  createdBy: string;
  changed: boolean;
  matchdayCount: number;
  roundCount: number;
  fixtureCount: number;
}

function parseLocalDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new AppError(
      'bad_request',
      'Дата первого тура должна быть указана в формате ГГГГ-ММ-ДД',
      400,
    );
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new AppError('bad_request', 'Укажите корректную дату первого тура', 400);
  }
  return parsed;
}

function shiftLocalDate(value: string, calendarDays: number): string {
  const shifted = parseLocalDate(value);
  shifted.setUTCDate(shifted.getUTCDate() + calendarDays);
  return shifted.toISOString().slice(0, 10);
}

function shiftConfiguredPostRegularSchedule(
  rules: TournamentRulesSnapshot,
  calendarDays: number,
): TournamentRulesSnapshot {
  const timezone = rules.config.timezone;
  const shiftIso = (value: unknown): unknown => {
    if (typeof value !== 'string') return value;
    const date = validIsoDate(value);
    if (date === null) {
      throw new AppError(
        'configuration_error',
        'В расписании плей-офф указана некорректная дата',
        409,
      );
    }
    return addZonedCalendarDays(date, timezone, calendarDays).toISOString();
  };
  const next: TournamentRulesSnapshot = { ...rules };
  for (const field of ['tieBreakFirstGameStartsAt', 'tiebreakFirstGameStartsAt'] as const) {
    if (Object.prototype.hasOwnProperty.call(next, field)) next[field] = shiftIso(next[field]);
  }
  if (Array.isArray(rules.playoffRounds)) {
    next.playoffRounds = rules.playoffRounds.map((value) => {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
      const round = value as Record<string, unknown>;
      return {
        ...round,
        ...(Object.prototype.hasOwnProperty.call(round, 'firstGameStartsAt')
          ? { firstGameStartsAt: shiftIso(round.firstGameStartsAt) }
          : {}),
        ...(Array.isArray(round.scheduleDays)
          ? {
              scheduleDays: round.scheduleDays.map((dayValue) => {
                if (dayValue === null || typeof dayValue !== 'object' || Array.isArray(dayValue)) {
                  return dayValue;
                }
                const day = dayValue as Record<string, unknown>;
                return {
                  ...day,
                  ...(typeof day.localDate === 'string'
                    ? { localDate: shiftLocalDate(day.localDate, calendarDays) }
                    : {}),
                };
              }),
            }
          : {}),
      };
    });
  }
  return next;
}

export async function shiftTournamentSchedule(
  pool: Pool,
  input: {
    tournamentId: string;
    expectedRevision: number;
    firstMatchdayLocalDate: string;
    adminUserId: string;
    now?: Date;
  },
) {
  return inTransaction(pool, async (client) => {
    await lockTournament(client, input.tournamentId);
    const tournamentResult = await client.query<{
      status: TournamentStatus;
      current_revision: number;
      starts_at: Date | null;
      registration_opens_at: Date | null;
      registration_closes_at: Date | null;
      rules_snapshot: TournamentRulesSnapshot;
    }>(
      `select tournament.status, tournament.current_revision, tournament.starts_at,
              tournament.registration_opens_at, tournament.registration_closes_at,
              revision.rules_snapshot
         from tournament tournament
         join tournament_revision revision on revision.id = tournament.published_revision_id
        where tournament.id = $1
        for update of tournament`,
      [input.tournamentId],
    );
    const tournament = tournamentResult.rows[0];
    if (tournament === undefined) throw new AppError('not_found', 'tournament not found', 404);
    if (tournament.status !== 'scheduling') {
      throw new AppError(
        'conflict',
        'Перенос всего календаря доступен только до запуска регулярного сезона',
        409,
      );
    }
    if (Number(tournament.current_revision) !== input.expectedRevision) {
      throw new AppError('revision_conflict', 'tournament was changed in another tab', 409);
    }
    if (tournament.starts_at === null) {
      throw new AppError('configuration_error', 'Дата первого тура не настроена', 409);
    }
    const firstMatchdayResult = await client.query<{
      local_date: string;
      starts_at: Date;
      ends_at: Date;
    }>(
      `select local_date::text, starts_at, ends_at
         from tournament_matchday
        where tournament_id = $1
        order by number
        limit 1
        for update`,
      [input.tournamentId],
    );
    const firstMatchday = firstMatchdayResult.rows[0];
    if (firstMatchday === undefined) {
      throw new AppError('conflict', 'Календарь регулярного сезона ещё не создан', 409);
    }
    const oldLocalDate = parseLocalDate(firstMatchday.local_date);
    const newLocalDate = parseLocalDate(input.firstMatchdayLocalDate);
    const shiftedCalendarDays = Math.round(
      (newLocalDate.getTime() - oldLocalDate.getTime()) / 86_400_000,
    );
    if (shiftedCalendarDays === 0) {
      throw new AppError('bad_request', 'Новая дата совпадает с текущей', 400);
    }
    const timezone = tournament.rules_snapshot.config.timezone;
    const shiftedFirstStart = addZonedCalendarDays(
      firstMatchday.starts_at,
      timezone,
      shiftedCalendarDays,
    );
    const shiftedFirstEnd = addZonedCalendarDays(
      firstMatchday.ends_at,
      timezone,
      shiftedCalendarDays,
    );
    const regularSource = tournament.rules_snapshot.config.regularSource;
    const shiftedPlayableBoundary =
      regularSource === 'head_to_head' ? shiftedFirstStart : shiftedFirstEnd;
    if (shiftedPlayableBoundary <= (input.now ?? new Date())) {
      throw new AppError(
        'tournament_schedule_date_not_future',
        'Новая дата первого тура должна быть в будущем',
        400,
      );
    }

    const dirty = await client.query<{ dirty: boolean }>(
      `select
         exists (
           select 1 from tournament_matchday matchday
            where matchday.tournament_id = $1 and matchday.status <> 'scheduled'
         )
         or exists (
           select 1 from tournament_round round
            where round.tournament_id = $1 and round.stage = 'regular'
              and round.status <> 'scheduled'
         )
         or exists (
           select 1 from tournament_fixture fixture
           join tournament_round round on round.id = fixture.round_id
            where fixture.tournament_id = $1 and round.stage = 'regular'
              and (
                fixture.status <> 'scheduled'
                or fixture.winner_participant_id is not null
                or fixture.outcome is not null
                or fixture.settled_at is not null
              )
         )
         or exists (
           select 1 from tournament_fixture_attempt attempt
           join tournament_fixture fixture on fixture.id = attempt.fixture_id
           join tournament_round round on round.id = fixture.round_id
            where fixture.tournament_id = $1 and round.stage = 'regular'
              and (
                attempt.status <> 'pending'
                or attempt.attempt_number <> 1
                or attempt.home_ready_at is not null
                or attempt.away_ready_at is not null
                or attempt.amateur_duel_match_id is not null
                or attempt.outcome is not null
                or attempt.settled_at is not null
              )
         )
         or exists (
           select 1 from tournament_classic_session session where session.tournament_id = $1
         )
         or exists (
           select 1 from tournament_daily_result result where result.tournament_id = $1
         )
         or exists (
           select 1 from tournament_playoff_series series where series.tournament_id = $1
         ) as dirty`,
      [input.tournamentId],
    );
    if (dirty.rows[0]?.dirty === true) {
      throw new AppError(
        'conflict',
        'В турнире уже есть начатые или завершённые игры. Переносите оставшиеся игры отдельно',
        409,
      );
    }

    const nextRules = shiftConfiguredPostRegularSchedule(
      tournament.rules_snapshot,
      shiftedCalendarDays,
    );
    const revision = input.expectedRevision + 1;
    const insertedRevision = await client.query<{ id: string }>(
      `insert into tournament_revision
         (tournament_id, revision, rules_snapshot, is_published, published_at, created_by)
       values ($1, $2, $3, true, now(), $4)
       returning id`,
      [input.tournamentId, revision, JSON.stringify(nextRules), input.adminUserId],
    );
    const intervalExpression = `make_interval(days => $2::int)`;
    await client.query(
      `update tournament_matchday
          set local_date = local_date + $2::int,
              starts_at = ((starts_at at time zone $3) + ${intervalExpression}) at time zone $3,
              ends_at = ((ends_at at time zone $3) + ${intervalExpression}) at time zone $3
        where tournament_id = $1`,
      [input.tournamentId, shiftedCalendarDays, timezone],
    );
    await client.query(
      `update tournament_round
          set starts_at = case when starts_at is null then null
                else ((starts_at at time zone $3) + ${intervalExpression}) at time zone $3 end,
              ends_at = case when ends_at is null then null
                else ((ends_at at time zone $3) + ${intervalExpression}) at time zone $3 end
        where tournament_id = $1 and stage = 'regular'`,
      [input.tournamentId, shiftedCalendarDays, timezone],
    );
    await client.query(
      `update tournament_fixture fixture
          set scheduled_starts_at = case when fixture.scheduled_starts_at is null then null
                else ((fixture.scheduled_starts_at at time zone $3) + ${intervalExpression}) at time zone $3 end,
              window_ends_at = case when fixture.window_ends_at is null then null
                else ((fixture.window_ends_at at time zone $3) + ${intervalExpression}) at time zone $3 end,
              rescheduled_reason = 'Перенос регулярного сезона',
              updated_at = now()
         from tournament_round round
        where fixture.round_id = round.id
          and fixture.tournament_id = $1 and round.stage = 'regular'`,
      [input.tournamentId, shiftedCalendarDays, timezone],
    );
    await client.query(
      `update tournament_fixture_attempt attempt
          set scheduled_starts_at = ((attempt.scheduled_starts_at at time zone $3) + ${intervalExpression}) at time zone $3,
              readiness_expires_at = ((attempt.readiness_expires_at at time zone $3) + ${intervalExpression}) at time zone $3,
              hard_deadline_at = ((attempt.hard_deadline_at at time zone $3) + ${intervalExpression}) at time zone $3,
              result_snapshot = coalesce(attempt.result_snapshot, '{}'::jsonb)
                || jsonb_build_object('rescheduledReason', 'Перенос регулярного сезона'),
              updated_at = now()
         from tournament_fixture fixture
         join tournament_round round on round.id = fixture.round_id
        where attempt.fixture_id = fixture.id
          and fixture.tournament_id = $1 and round.stage = 'regular'`,
      [input.tournamentId, shiftedCalendarDays, timezone],
    );
    const shiftedTournamentStart = addZonedCalendarDays(
      tournament.starts_at,
      timezone,
      shiftedCalendarDays,
    );
    await client.query(
      `update tournament
          set starts_at = $2, current_revision = $3, published_revision_id = $4,
              updated_by = $5, updated_at = now()
        where id = $1`,
      [
        input.tournamentId,
        shiftedTournamentStart,
        revision,
        insertedRevision.rows[0]!.id,
        input.adminUserId,
      ],
    );
    await appendEvent(client, input.adminUserId, 'admin_tournament_schedule_shifted', {
      tournament_id: input.tournamentId,
      previous_first_matchday_local_date: firstMatchday.local_date,
      first_matchday_local_date: input.firstMatchdayLocalDate,
      shifted_calendar_days: shiftedCalendarDays,
      previous_revision: input.expectedRevision,
      revision,
    });
    const updated = await client.query<TournamentRow>(`${tournamentSelect} where t.id = $1`, [
      input.tournamentId,
    ]);
    return {
      shiftedCalendarDays,
      tournament: await mapTournamentWithLifecycle(client, updated.rows[0]!),
    };
  });
}

async function enqueueRegistrationBlockedPushes(
  client: PoolClient,
  outcome: Pick<
    GenerateRegularScheduleOutcome,
    'tournamentId' | 'revision' | 'participantCount' | 'playoffSize' | 'title' | 'createdBy'
  >,
): Promise<void> {
  const recipients = await client.query<{ id: string }>(
    `select distinct id::text as id
       from users
      where id = $1 or role = 'admin'`,
    [outcome.createdBy],
  );
  const eventKey = `${outcome.tournamentId}:registration-blocked:${outcome.revision}`;
  for (const recipient of recipients.rows) {
    const previousDelivery = await client.query<{ exists: boolean }>(
      `select exists(
         select 1 from push_delivery_log
          where user_id = $1
            and event_type = 'tournament.registration_blocked'
            and event_key like $2 || '%'
       ) as exists`,
      [recipient.id, `${outcome.tournamentId}:registration-blocked:`],
    );
    if (previousDelivery.rows[0]!.exists) continue;
    await enqueueTournamentPush(client, {
      userId: recipient.id,
      tournamentId: outcome.tournamentId,
      eventType: 'tournament.registration_blocked',
      eventKey,
      variables: {
        tournamentTitle: outcome.title,
        approvedCount: outcome.participantCount,
        requiredCount: outcome.playoffSize,
      },
      fallback: {
        title: 'Турнир требует внимания',
        body: `В турнире «${outcome.title}» подтверждено ${outcome.participantCount} из ${outcome.playoffSize} участников.`,
        url: '/admin',
      },
    });
  }
}

export function assertTournamentDatesReady(
  registrationOpensAt: Date | null,
  registrationClosesAt: Date | null,
  startsAt: Date | null,
): void {
  if (registrationOpensAt === null || registrationClosesAt === null || startsAt === null) {
    throw new AppError('dates_required', 'registration and tournament dates are required', 409);
  }
  if (registrationOpensAt >= registrationClosesAt || registrationClosesAt >= startsAt) {
    throw new AppError(
      'invalid_date_order',
      'registration opening must precede closing and tournament start',
      409,
    );
  }
}

interface TournamentRow {
  id: string;
  slug: string;
  title: string;
  description: string;
  image_url: string | null;
  status: TournamentStatus;
  regular_source: TournamentConfig['regularSource'];
  visibility: 'public' | 'hidden';
  current_revision: number;
  published_revision_id: string | null;
  registration_opens_at: Date | null;
  registration_closes_at: Date | null;
  starts_at: Date | null;
  completed_at: Date | null;
  cancelled_at: Date | null;
  created_at: Date;
  updated_at: Date;
  rules_snapshot: TournamentRulesSnapshot;
  participant_count: number;
  pending_application_count?: number;
  regular_rewards_paid?: boolean;
  playoff_rewards_paid?: boolean;
  my_participant_state?: string | null;
  my_participant_id?: string | null;
  my_final_place?: number | null;
}

function optionalRuleRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function projectedTournamentEnd(
  startsAt: Date | null,
  rules: TournamentRulesSnapshot,
): Date | null {
  if (startsAt === null) return null;
  const config = rules.config;
  let cursor = new Date(startsAt);
  if (config.regularSource === 'head_to_head') {
    const participantCount = Math.max(2, config.participantLimit);
    const roundsPerCycle = participantCount % 2 === 0 ? participantCount - 1 : participantCount;
    const totalRounds = roundsPerCycle * config.roundRobinCycles;
    const lastRoundIndex = Math.max(0, totalRounds - 1);
    const dayIndex = Math.floor(lastRoundIndex / config.roundsPerDay);
    const roundIndexInDay = lastRoundIndex % config.roundsPerDay;
    cursor = addZonedCalendarDays(cursor, config.timezone, dayIndex);
    cursor = new Date(
      cursor.getTime() +
        roundIndexInDay * (config.fixtureWindowMs + config.roundBreakMs) +
        config.fixtureWindowMs,
    );
  } else {
    cursor = addZonedCalendarDays(cursor, config.timezone, Math.max(1, config.dailyDays));
  }

  const configuredRounds = Array.isArray(rules.playoffRounds) ? rules.playoffRounds : [];
  const roundCount = Math.log2(config.playoffSize);
  for (let index = 0; index < roundCount; index += 1) {
    const round = optionalRuleRecord(configuredRounds[index]);
    const winsRequired =
      typeof round.winsRequired === 'number' && Number.isInteger(round.winsRequired)
        ? Math.max(1, round.winsRequired)
        : 4;
    const gameWindowMs =
      typeof round.gameWindowMs === 'number' && round.gameWindowMs > 0
        ? round.gameWindowMs
        : ONE_DAY_MS;
    const gameBreakMs =
      typeof round.gameBreakMs === 'number' && round.gameBreakMs >= 0 ? round.gameBreakMs : 0;
    const roundBreakMs =
      typeof round.roundBreakMs === 'number' && round.roundBreakMs >= 0 ? round.roundBreakMs : 0;
    const firstGameStartsAt = validIsoDate(round.firstGameStartsAt);
    if (firstGameStartsAt !== null && firstGameStartsAt > cursor) cursor = firstGameStartsAt;
    const maximumGames = winsRequired * 2 - 1;
    cursor = new Date(
      cursor.getTime() +
        maximumGames * gameWindowMs +
        Math.max(0, maximumGames - 1) * gameBreakMs +
        (index < roundCount - 1 ? roundBreakMs : 0),
    );
  }
  return cursor;
}

function fallbackTournamentLifecycle(row: TournamentRow): TournamentLifecycleDTO {
  return {
    action: 'unchanged',
    dueAt: null,
    approvedParticipantCount: Number(row.participant_count),
    requiredParticipantCount: row.rules_snapshot.config.playoffSize,
    reason: null,
  };
}

function mapTournament(row: TournamentRow, lifecycle?: TournamentLifecycleDTO) {
  const projectedEndsAt = projectedTournamentEnd(row.starts_at, row.rules_snapshot);
  const resolvedLifecycle = lifecycle ?? fallbackTournamentLifecycle(row);
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    imageUrl: row.image_url,
    status: row.status,
    regularSource: row.regular_source,
    visibility: row.visibility,
    revision: Number(row.current_revision),
    publishedRevisionId: row.published_revision_id,
    registrationOpensAt: row.registration_opens_at?.toISOString() ?? null,
    registrationClosesAt: row.registration_closes_at?.toISOString() ?? null,
    startsAt: row.starts_at?.toISOString() ?? null,
    completedAt: row.completed_at?.toISOString() ?? null,
    projectedEndsAt: projectedEndsAt?.toISOString() ?? null,
    rewardEditability: {
      regular: row.regular_rewards_paid === true ? ('paid' as const) : ('editable' as const),
      playoff: row.playoff_rewards_paid === true ? ('paid' as const) : ('editable' as const),
    },
    cancelledAt: row.cancelled_at?.toISOString() ?? null,
    participantCount: Number(row.participant_count),
    pendingApplicationCount: Number(row.pending_application_count ?? 0),
    lifecycle: resolvedLifecycle,
    rules: row.rules_snapshot,
    ...(row.my_participant_state !== undefined
      ? { myParticipantState: row.my_participant_state }
      : {}),
    ...(row.my_final_place !== undefined ? { myFinalPlace: row.my_final_place } : {}),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

async function lifecycleByTournament(
  pool: Pool | PoolClient,
  rows: TournamentRow[],
): Promise<Map<string, TournamentLifecycleDTO>> {
  const lifecycle = await loadTournamentLifecycleDTOs(
    pool,
    rows.filter((row) => row.published_revision_id !== null).map((row) => row.id),
    new Date(),
  );
  for (const row of rows) {
    if (!lifecycle.has(row.id)) lifecycle.set(row.id, fallbackTournamentLifecycle(row));
  }
  return lifecycle;
}

async function mapTournamentWithLifecycle(pool: Pool | PoolClient, row: TournamentRow) {
  const lifecycle = await lifecycleByTournament(pool, [row]);
  return mapTournament(row, lifecycle.get(row.id));
}

type PlayoffDuelKind = 'express' | 'express_plus' | 'classic';

async function playoffFormatsByTournament(
  pool: Pool,
  rows: TournamentRow[],
): Promise<Map<string, Array<{ roundNumber: number; duelKind: PlayoffDuelKind }>>> {
  const references: Array<{ tournamentId: string; roundNumber: number; templateId: string }> = [];
  for (const row of rows) {
    const configured = Array.isArray(row.rules_snapshot.playoffRounds)
      ? row.rules_snapshot.playoffRounds
      : [];
    configured.forEach((value, index) => {
      const round = optionalRuleRecord(value);
      if (typeof round.duelTemplateId !== 'string') return;
      references.push({
        tournamentId: row.id,
        roundNumber: typeof round.roundNumber === 'number' ? Number(round.roundNumber) : index + 1,
        templateId: round.duelTemplateId,
      });
    });
  }
  const templateIds = [...new Set(references.map((reference) => reference.templateId))];
  if (templateIds.length === 0) return new Map();
  const templates = await pool.query<{ id: string; duel_kind: PlayoffDuelKind }>(
    `select id, duel_kind from amateur_duel_template where id = any($1::uuid[])`,
    [templateIds],
  );
  const kindByTemplate = new Map(
    templates.rows.map((template) => [template.id, template.duel_kind]),
  );
  const result = new Map<string, Array<{ roundNumber: number; duelKind: PlayoffDuelKind }>>();
  for (const reference of references) {
    const duelKind = kindByTemplate.get(reference.templateId);
    if (duelKind === undefined) continue;
    const formats = result.get(reference.tournamentId) ?? [];
    formats.push({ roundNumber: reference.roundNumber, duelKind });
    result.set(reference.tournamentId, formats);
  }
  return result;
}

async function inTransaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await work(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function terminalizeTournamentFixtureDuels(
  client: PoolClient,
  input: { tournamentId: string; fixtureIds?: string[]; reason: string },
): Promise<number> {
  const openDuels = await client.query<{ duel_match_id: string; segment_id: string }>(
    `select duel.id as duel_match_id, segment.id as segment_id
       from tournament_fixture fixture
       join tournament_fixture_segment segment on segment.fixture_id = fixture.id
       join amateur_duel_match duel on duel.id = segment.duel_match_id
      where fixture.tournament_id = $1
        and ($2::uuid[] is null or fixture.id = any($2::uuid[]))
        and duel.source = 'tournament'
        and duel.status in ('invited', 'ready_check', 'active')
      order by duel.id
      for update of duel, segment`,
    [input.tournamentId, input.fixtureIds ?? null],
  );
  for (const duel of openDuels.rows) {
    await cancelTournamentDuel(client, {
      duelMatchId: duel.duel_match_id,
      reason: input.reason,
    });
  }
  if (openDuels.rows.length > 0) {
    await client.query(
      `update tournament_fixture_segment
          set status = 'cancelled'
        where id = any($1::uuid[]) and status in ('pending', 'scheduled', 'active')`,
      [openDuels.rows.map((duel) => duel.segment_id)],
    );
  }
  return openDuels.rows.length;
}

const tournamentSelect = `
  select t.*, r.rules_snapshot,
         exists (
           select 1 from tournament_economy_event event
            where event.tournament_id = t.id and event.kind = 'stage_reward'
              and event.status = 'applied' and event.metadata->>'stage' = 'regular'
         ) as regular_rewards_paid,
         exists (
           select 1 from tournament_economy_event event
            where event.tournament_id = t.id and event.kind = 'stage_reward'
              and event.status = 'applied' and event.metadata->>'stage' = 'playoff'
         ) as playoff_rewards_paid,
         (select count(*)::int from tournament_participant p
           where p.tournament_id = t.id and p.state = 'approved') as participant_count,
         (select count(*)::int from tournament_participant p
           where p.tournament_id = t.id and p.state = 'applied') as pending_application_count
    from tournament t
    join tournament_revision r
      on r.tournament_id = t.id and r.revision = t.current_revision`;

export async function isTournamentFeatureEnabled(pool: Pool): Promise<boolean> {
  const { rows } = await pool.query<{ enabled: boolean }>(
    `select coalesce((value #>> '{}')::boolean, false) as enabled
       from game_settings where key = 'tournaments.enabled'`,
  );
  return rows[0]?.enabled === true;
}

export async function createTournamentDraft(
  pool: Pool,
  input: {
    slug?: string;
    title: string;
    description: string;
    imageUrl?: string | null;
    rules: TournamentRulesSnapshot;
    createdBy: string;
    registrationOpensAt: Date | null;
    registrationClosesAt: Date | null;
    startsAt: Date | null;
  },
) {
  return inTransaction(pool, async (client) => {
    const slug = input.slug ?? (await createUniqueTournamentSlug(client, input.title));
    const { rows } = await client.query<TournamentRow>(
      `insert into tournament
         (slug, title, description, image_url, regular_source, visibility, current_revision,
          registration_opens_at, registration_closes_at, starts_at, created_by, updated_by)
       values ($1, $2, $3, $4, $5, $6, 1, $7, $8, $9, $10, $10)
       returning *, 0::int as participant_count, 0::int as pending_application_count,
                 $11::jsonb as rules_snapshot`,
      [
        slug,
        input.title,
        input.description,
        input.imageUrl ?? null,
        input.rules.config.regularSource,
        input.rules.config.visibility,
        input.registrationOpensAt,
        input.registrationClosesAt,
        input.startsAt,
        input.createdBy,
        JSON.stringify(input.rules),
      ],
    );
    const tournament = rows[0]!;
    await client.query(
      `insert into tournament_revision
         (tournament_id, revision, rules_snapshot, created_by)
       values ($1, 1, $2, $3)`,
      [tournament.id, JSON.stringify(input.rules), input.createdBy],
    );
    return mapTournamentWithLifecycle(client, tournament);
  });
}

async function createUniqueTournamentSlug(client: PoolClient, title: string): Promise<string> {
  await client.query(`select pg_advisory_xact_lock(hashtext('tournament-slug-generation'))`);
  const base = tournamentSlugBase(title);
  for (let suffix = 1; ; suffix += 1) {
    const ending = suffix === 1 ? '' : `-${suffix}`;
    const candidate = `${base.slice(0, 80 - ending.length).replace(/-+$/g, '')}${ending}`;
    const exists = await client.query(`select 1 from tournament where slug = $1`, [candidate]);
    if (exists.rowCount === 0) return candidate;
  }
}

export async function listAdminTournaments(pool: Pool) {
  const { rows } = await pool.query<TournamentRow>(
    `${tournamentSelect} order by t.created_at desc`,
  );
  const [formats, lifecycle] = await Promise.all([
    playoffFormatsByTournament(pool, rows),
    lifecycleByTournament(pool, rows),
  ]);
  return rows.map((row) => ({
    ...mapTournament(row, lifecycle.get(row.id)),
    playoffFormats: formats.get(row.id) ?? [],
  }));
}

export async function countPendingTournamentApplications(pool: Pool): Promise<number> {
  const { rows } = await pool.query<{ count: number }>(
    `select count(*)::int as count
       from tournament_participant participant
       join tournament on tournament.id = participant.tournament_id
      where participant.state = 'applied'
        and tournament.status in ('registration', 'registration_blocked')`,
  );
  return Number(rows[0]?.count ?? 0);
}

export async function listPlayerTournaments(pool: Pool, userId: string) {
  const { rows } = await pool.query<
    TournamentRow & { my_participant_state: string | null; my_participant_id: string | null }
  >(
    `select listed.*, mine.id as my_participant_id, mine.state as my_participant_state
       from (${tournamentSelect}) listed
       left join tournament_participant mine
         on mine.tournament_id = listed.id and mine.user_id = $1
      where listed.status not in ('draft', 'archived')
        and (listed.visibility = 'public' or mine.id is not null)
      order by listed.starts_at nulls last, listed.created_at desc`,
    [userId],
  );
  const completedIds = rows
    .filter((row) => row.status === 'completed' && row.my_participant_id !== null)
    .map((row) => row.id);
  const finalPlaceByParticipant = new Map<string, number>();
  if (completedIds.length > 0) {
    const series = await pool.query<{
      tournament_id: string;
      kind: 'championship' | 'third_place';
      higher_seed_participant_id: string;
      lower_seed_participant_id: string;
      winner_participant_id: string;
    }>(
      `select tournament_id, kind, higher_seed_participant_id,
              lower_seed_participant_id, winner_participant_id
         from tournament_playoff_series
        where tournament_id = any($1::uuid[]) and status = 'completed'
          and kind in ('championship', 'third_place')`,
      [completedIds],
    );
    const seriesByTournament = new Map<string, typeof series.rows>();
    for (const row of series.rows) {
      const tournamentSeries = seriesByTournament.get(row.tournament_id) ?? [];
      tournamentSeries.push(row);
      seriesByTournament.set(row.tournament_id, tournamentSeries);
    }
    for (const tournamentId of completedIds) {
      const tournamentSeries = seriesByTournament.get(tournamentId) ?? [];
      const final = tournamentSeries.find((row) => row.kind === 'championship');
      if (final === undefined) continue;
      const bronze = tournamentSeries.find((row) => row.kind === 'third_place');
      for (const placement of resolvePlayoffPlacements({
        final: {
          higherId: final.higher_seed_participant_id,
          lowerId: final.lower_seed_participant_id,
          winnerId: final.winner_participant_id,
        },
        ...(bronze !== undefined
          ? {
              bronze: {
                higherId: bronze.higher_seed_participant_id,
                lowerId: bronze.lower_seed_participant_id,
                winnerId: bronze.winner_participant_id,
              },
            }
          : {}),
      })) {
        finalPlaceByParticipant.set(placement.participantId, placement.place);
      }
    }
  }
  for (const row of rows) {
    row.my_final_place =
      row.my_participant_id === null
        ? null
        : (finalPlaceByParticipant.get(row.my_participant_id) ?? null);
  }
  const [formats, lifecycle] = await Promise.all([
    playoffFormatsByTournament(pool, rows),
    lifecycleByTournament(pool, rows),
  ]);
  return rows.map((row) => ({
    ...mapTournament(row, lifecycle.get(row.id)),
    playoffFormats: formats.get(row.id) ?? [],
  }));
}

export async function getTournament(pool: Pool, tournamentId: string, userId?: string) {
  const values: unknown[] = [tournamentId];
  const mineSelect =
    userId === undefined
      ? 'null::text as my_participant_state'
      : `(select state from tournament_participant where tournament_id = t.id and user_id = $2)
           as my_participant_state`;
  if (userId !== undefined) values.push(userId);
  const { rows } = await pool.query<TournamentRow>(
    `${tournamentSelect.replace('select t.*,', `select t.*, ${mineSelect},`)} where t.id = $1`,
    values,
  );
  const row = rows[0];
  if (!row) throw new AppError('not_found', 'tournament not found', 404);
  if (userId !== undefined && row.visibility === 'hidden' && row.my_participant_state === null) {
    throw new AppError('not_found', 'tournament not found', 404);
  }
  const [formats, lifecycle] = await Promise.all([
    playoffFormatsByTournament(pool, [row]),
    lifecycleByTournament(pool, [row]),
  ]);
  return {
    ...mapTournament(row, lifecycle.get(row.id)),
    playoffFormats: formats.get(row.id) ?? [],
  };
}

export async function updateTournamentDraft(
  pool: Pool,
  input: {
    tournamentId: string;
    expectedRevision: number;
    title: string;
    description: string;
    imageUrl?: string | null;
    rules: TournamentRulesSnapshot;
    updatedBy: string;
    registrationOpensAt: Date | null;
    registrationClosesAt: Date | null;
    startsAt: Date | null;
  },
) {
  return inTransaction(pool, async (client) => {
    await lockTournament(client, input.tournamentId);
    const current = await client.query<{
      status: TournamentStatus;
      current_revision: number;
      rules_snapshot: TournamentRulesSnapshot;
      participant_count: number;
      playoff_series_exists: boolean;
      title: string;
      description: string;
      image_url: string | null;
      registration_opens_at: Date | null;
      registration_closes_at: Date | null;
      starts_at: Date | null;
    }>(
      `select t.status, t.current_revision, revision.rules_snapshot,
              (select count(*)::int from tournament_participant participant
                where participant.tournament_id = t.id
                  and participant.state in ('invited', 'applied', 'approved')) as participant_count,
              exists (
                select 1 from tournament_playoff_series series where series.tournament_id = t.id
              ) as playoff_series_exists,
              t.title, t.description, t.image_url,
              t.registration_opens_at, t.registration_closes_at, t.starts_at
         from tournament t
         join tournament_revision revision
           on revision.tournament_id = t.id and revision.revision = t.current_revision
        where t.id = $1 for update of t`,
      [input.tournamentId],
    );
    const tournament = current.rows[0];
    if (!tournament) throw new AppError('not_found', 'tournament not found', 404);
    const regularScheduleRecovery =
      tournament.status === 'regular' &&
      !tournament.playoff_series_exists &&
      tournament.title === input.title &&
      tournament.description === input.description &&
      (input.imageUrl === undefined || input.imageUrl === tournament.image_url) &&
      input.registrationOpensAt?.getTime() === tournament.registration_opens_at?.getTime() &&
      input.registrationClosesAt?.getTime() === tournament.registration_closes_at?.getTime() &&
      input.startsAt?.getTime() === tournament.starts_at?.getTime() &&
      isPlayoffScheduleOnlyRulesUpdate(tournament.rules_snapshot, input.rules);
    const activePlayoffScheduleUpdate =
      ['playoff', 'paused'].includes(tournament.status) &&
      tournament.playoff_series_exists &&
      tournament.title === input.title &&
      tournament.description === input.description &&
      (input.imageUrl === undefined || input.imageUrl === tournament.image_url) &&
      input.registrationOpensAt?.getTime() === tournament.registration_opens_at?.getTime() &&
      input.registrationClosesAt?.getTime() === tournament.registration_closes_at?.getTime() &&
      input.startsAt?.getTime() === tournament.starts_at?.getTime() &&
      isPlayoffScheduleOnlyRulesUpdate(tournament.rules_snapshot, input.rules);
    const updatesPublishedRules =
      ['registration', 'registration_blocked'].includes(tournament.status) ||
      regularScheduleRecovery ||
      activePlayoffScheduleUpdate;
    if (tournament.status !== 'draft' && !updatesPublishedRules) {
      throw new AppError('conflict', 'tournament format can no longer be edited', 409);
    }
    if (Number(tournament.current_revision) !== input.expectedRevision) {
      throw new AppError('revision_conflict', 'tournament was changed in another tab', 409);
    }
    if (updatesPublishedRules) {
      assertTournamentDatesReady(
        input.registrationOpensAt,
        input.registrationClosesAt,
        input.startsAt,
      );
    }
    if (Number(tournament.participant_count) > 0) {
      const currentConfig = tournament.rules_snapshot.config;
      if (input.rules.config.entryFeeCoins !== currentConfig.entryFeeCoins) {
        throw new AppError('conflict', 'registration price cannot change after applications', 409);
      }
      if (input.rules.config.registrationMode !== currentConfig.registrationMode) {
        throw new AppError('conflict', 'registration mode cannot change after applications', 409);
      }
      if (input.rules.config.participantLimit < Number(tournament.participant_count)) {
        throw new AppError('conflict', 'participant limit is below current applications', 409);
      }
    }
    const nextRules: TournamentRulesSnapshot =
      regularScheduleRecovery || activePlayoffScheduleUpdate
        ? mergePlayoffScheduleRules(tournament.rules_snapshot, input.rules)
        : { ...input.rules };
    delete nextRules.automaticLifecycleVersion;
    delete nextRules.duelLifecycleVersion;
    if (automaticLifecycleVersion(tournament.rules_snapshot) !== null) {
      nextRules.automaticLifecycleVersion = AUTOMATIC_TOURNAMENT_LIFECYCLE_VERSION;
    }
    if (tournament.rules_snapshot.duelLifecycleVersion === 2) {
      nextRules.duelLifecycleVersion = 2;
    }
    const revision = input.expectedRevision + 1;
    const insertedRevision = await client.query<{ id: string }>(
      `insert into tournament_revision
         (tournament_id, revision, rules_snapshot, is_published, published_at, created_by)
       values ($1, $2, $3, $4, case when $4 then now() else null end, $5)
       returning id`,
      [
        input.tournamentId,
        revision,
        JSON.stringify(nextRules),
        updatesPublishedRules,
        input.updatedBy,
      ],
    );
    if (activePlayoffScheduleUpdate) {
      await reschedulePublishedPlayoffRounds(client, {
        tournamentId: input.tournamentId,
        currentRules: tournament.rules_snapshot,
        nextRules,
        adminUserId: input.updatedBy,
        now: new Date(),
      });
    }
    const updatesImage = Object.prototype.hasOwnProperty.call(input, 'imageUrl');
    await client.query(
      `update tournament
          set status = case
                when status = 'registration_blocked'
                  and $10::timestamptz > now()
                  and (registration_closes_at is null or $10::timestamptz > registration_closes_at)
                then 'registration'
                else status
              end,
              title = $2, description = $3,
              image_url = case when $4::boolean then $5 else image_url end,
              regular_source = $6, visibility = $7,
              current_revision = $8, registration_opens_at = $9,
              registration_closes_at = $10, starts_at = $11, updated_by = $12,
              published_revision_id = case when $13::boolean then $14 else published_revision_id end,
              updated_at = now()
        where id = $1`,
      [
        input.tournamentId,
        input.title,
        input.description,
        updatesImage,
        input.imageUrl ?? null,
        input.rules.config.regularSource,
        input.rules.config.visibility,
        revision,
        input.registrationOpensAt,
        input.registrationClosesAt,
        input.startsAt,
        input.updatedBy,
        updatesPublishedRules,
        insertedRevision.rows[0]!.id,
      ],
    );
    const updated = await client.query<TournamentRow>(`${tournamentSelect} where t.id = $1`, [
      input.tournamentId,
    ]);
    return mapTournamentWithLifecycle(client, updated.rows[0]!);
  });
}

export async function updateTournamentRewards(
  pool: Pool,
  input: {
    tournamentId: string;
    expectedRevision: number;
    updatedBy: string;
    regular?: Array<{ place: number; experience: number; coins: number; stars: number }>;
    playoff?: Array<{ place: number; experience: number; coins: number; stars: number }>;
  },
) {
  return inTransaction(pool, async (client) => {
    await lockTournament(client, input.tournamentId);
    const current = await client.query<{
      status: TournamentStatus;
      current_revision: number;
      rules_snapshot: TournamentRulesSnapshot;
      published_revision_id: string | null;
      regular_paid: boolean;
      playoff_paid: boolean;
    }>(
      `select t.status, t.current_revision, revision.rules_snapshot, t.published_revision_id,
              exists (
                select 1 from tournament_economy_event event
                 where event.tournament_id = t.id and event.kind = 'stage_reward'
                   and event.status = 'applied' and event.metadata->>'stage' = 'regular'
              ) as regular_paid,
              exists (
                select 1 from tournament_economy_event event
                 where event.tournament_id = t.id and event.kind = 'stage_reward'
                   and event.status = 'applied' and event.metadata->>'stage' = 'playoff'
              ) as playoff_paid
         from tournament t
         join tournament_revision revision
           on revision.tournament_id = t.id and revision.revision = t.current_revision
        where t.id = $1
        for update of t`,
      [input.tournamentId],
    );
    const tournament = current.rows[0];
    if (tournament === undefined) throw new AppError('not_found', 'tournament not found', 404);
    if (tournament.published_revision_id === null) {
      throw new AppError('conflict', 'draft rewards must be edited in the tournament wizard', 409);
    }
    if (['cancelled', 'archived'].includes(tournament.status)) {
      throw new AppError('conflict', 'tournament rewards can no longer be edited', 409);
    }
    if (Number(tournament.current_revision) !== input.expectedRevision) {
      throw new AppError('revision_conflict', 'tournament was changed in another tab', 409);
    }
    if (input.regular !== undefined && tournament.regular_paid) {
      throw new AppError('rewards_paid', 'regular rewards have already been paid', 409);
    }
    if (input.playoff !== undefined && tournament.playoff_paid) {
      throw new AppError('rewards_paid', 'playoff rewards have already been paid', 409);
    }
    const previousRewards = optionalRuleRecord(tournament.rules_snapshot.stageRewards);
    const stageRewards = {
      regular: input.regular ?? previousRewards.regular ?? [],
      playoff: input.playoff ?? previousRewards.playoff ?? [],
    };
    const rules: TournamentRulesSnapshot = {
      ...tournament.rules_snapshot,
      stageRewards,
    };
    const revision = input.expectedRevision + 1;
    const inserted = await client.query<{ id: string }>(
      `insert into tournament_revision
         (tournament_id, revision, rules_snapshot, is_published, published_at, created_by)
       values ($1, $2, $3, true, now(), $4)
       returning id`,
      [input.tournamentId, revision, JSON.stringify(rules), input.updatedBy],
    );
    await client.query(
      `update tournament
          set current_revision = $2, published_revision_id = $3,
              updated_by = $4, updated_at = now()
        where id = $1`,
      [input.tournamentId, revision, inserted.rows[0]!.id, input.updatedBy],
    );
    await client.query(
      `insert into event_log (user_id, type, payload)
       values ($1, 'admin_tournament_rewards_updated', $2)`,
      [
        input.updatedBy,
        JSON.stringify({
          tournament_id: input.tournamentId,
          revision,
          changed_stages: [
            ...(input.regular !== undefined ? ['regular'] : []),
            ...(input.playoff !== undefined ? ['playoff'] : []),
          ],
          previous: previousRewards,
          next: stageRewards,
        }),
      ],
    );
    const updated = await client.query<TournamentRow>(`${tournamentSelect} where t.id = $1`, [
      input.tournamentId,
    ]);
    return mapTournamentWithLifecycle(client, updated.rows[0]!);
  });
}

export async function publishTournament(
  pool: Pool,
  tournamentId: string,
  expectedRevision: number,
  userId: string,
) {
  return inTransaction(pool, async (client) => {
    await lockTournament(client, tournamentId);
    const { rows } = await client.query<{
      status: TournamentStatus;
      current_revision: number;
      revision_id: string;
      registration_opens_at: Date | null;
      registration_closes_at: Date | null;
      starts_at: Date | null;
    }>(
      `select t.status, t.current_revision, r.id as revision_id,
              t.registration_opens_at, t.registration_closes_at, t.starts_at
         from tournament t
         join tournament_revision r
           on r.tournament_id = t.id and r.revision = t.current_revision
        where t.id = $1 for update of t`,
      [tournamentId],
    );
    const tournament = rows[0];
    if (!tournament) throw new AppError('not_found', 'tournament not found', 404);
    if (tournament.status !== 'draft')
      throw new AppError('conflict', 'tournament is published', 409);
    if (Number(tournament.current_revision) !== expectedRevision) {
      throw new AppError('revision_conflict', 'tournament was changed in another tab', 409);
    }
    assertTournamentDatesReady(
      tournament.registration_opens_at,
      tournament.registration_closes_at,
      tournament.starts_at,
    );
    await client.query(
      `update tournament_revision set is_published = true, published_at = now()
        where id = $1`,
      [tournament.revision_id],
    );
    await client.query(
      `update tournament
          set status = 'registration', published_revision_id = $2,
              updated_by = $3, updated_at = now()
        where id = $1`,
      [tournamentId, tournament.revision_id, userId],
    );
    return { tournamentId, status: 'registration' as const, revision: expectedRevision };
  });
}

async function applyEntryFee(
  client: PoolClient,
  input: { tournamentId: string; participantId: string; userId: string; amount: number },
): Promise<void> {
  if (input.amount === 0) return;
  const key = `tournament:${input.tournamentId}:entry:${input.userId}`;
  const inserted = await client.query(
    `insert into tournament_economy_event
       (tournament_id, participant_id, idempotency_key, kind, coins)
     values ($1, $2, $3, 'entry_fee', $4)
     on conflict (idempotency_key) do nothing
     returning id`,
    [input.tournamentId, input.participantId, key, input.amount],
  );
  if (inserted.rowCount === 0) return;
  await client.query('select id from users where id = $1 for update', [input.userId]);
  await client.query(
    `insert into user_currency_account (user_id) values ($1) on conflict do nothing`,
    [input.userId],
  );
  const account = await client.query<{ balance: number; reserved_balance: number }>(
    `update user_currency_account set balance = balance - $2, updated_at = now()
      where user_id = $1 and balance >= $2 returning balance, reserved_balance`,
    [input.userId, input.amount],
  );
  if (!account.rows[0]) throw new AppError('insufficient_coins', 'not enough coins', 409);
  await client.query(
    `insert into currency_ledger
       (user_id, reason, available_delta, reserved_delta, balance_after, reserved_after, metadata)
     values ($1, 'tournament_entry_fee', $2, 0, $3, $4, $5)`,
    [
      input.userId,
      -input.amount,
      Number(account.rows[0].balance),
      Number(account.rows[0].reserved_balance),
      JSON.stringify({ tournament_id: input.tournamentId, participant_id: input.participantId }),
    ],
  );
  await client.query(
    `update tournament_economy_event set status = 'applied', applied_at = now() where id = $1`,
    [inserted.rows[0].id],
  );
  await client.query(
    `update tournament_participant set entry_fee_state = 'paid', updated_at = now() where id = $1`,
    [input.participantId],
  );
}

export async function applyToTournament(pool: Pool, tournamentId: string, userId: string) {
  return inTransaction(pool, async (client) => {
    await lockTournament(client, tournamentId);
    const { rows } = await client.query<{
      status: TournamentStatus;
      title: string;
      registration_opens_at: Date | null;
      registration_closes_at: Date | null;
      rules_snapshot: TournamentRulesSnapshot;
    }>(
      `select t.status, t.title, t.registration_opens_at, t.registration_closes_at, r.rules_snapshot
         from tournament t join tournament_revision r on r.id = t.published_revision_id
        where t.id = $1 for update of t`,
      [tournamentId],
    );
    const tournament = rows[0];
    if (!tournament) throw new AppError('not_found', 'tournament not found', 404);
    if (tournament.status !== 'registration') {
      throw new AppError('registration_closed', 'registration is closed', 409);
    }
    const now = new Date();
    if (
      (tournament.registration_opens_at !== null && now < tournament.registration_opens_at) ||
      (tournament.registration_closes_at !== null && now >= tournament.registration_closes_at)
    ) {
      throw new AppError('registration_closed', 'registration is closed', 409);
    }
    const existing = await client.query<{ id: string; state: string }>(
      `select id, state from tournament_participant where tournament_id = $1 and user_id = $2`,
      [tournamentId, userId],
    );
    const invited = existing.rows[0]?.state === 'invited';
    if (existing.rows[0] && !invited)
      throw new AppError('conflict', 'application already exists', 409);
    const playerResult = await client.query<{
      level: number;
      lifetime_goals_total: number;
      experience: number;
    }>(`select level, lifetime_goals_total, experience from users where id = $1`, [userId]);
    const player = playerResult.rows[0];
    if (!player) throw new AppError('not_found', 'user not found', 404);
    const approved = await client.query<{ count: string }>(
      `select count(*)::text as count from tournament_participant
        where tournament_id = $1 and state = 'approved'`,
      [tournamentId],
    );
    const rules = tournament.rules_snapshot;
    const eligibility = evaluateTournamentEligibility(
      {
        userId,
        level: Number(player.level),
        goals: Number(player.lifetime_goals_total),
        experience: Number(player.experience),
      },
      rules.eligibility,
    );
    const decision = decideTournamentApplication({
      mode: rules.config.registrationMode,
      invited,
      eligible: eligibility.eligible,
      approvedParticipants: Number(approved.rows[0]?.count ?? 0),
      participantLimit: rules.config.participantLimit,
    });
    if (!decision.accepted) throw new AppError(decision.reason, decision.reason, 409);
    const participant = await client.query<{ id: string }>(
      `insert into tournament_participant
         (tournament_id, user_id, state, entry_fee_coins, entry_fee_state, joined_at)
       values ($1, $2, $3, $4, $5, case when $3 = 'approved' then now() else null end)
       on conflict (tournament_id, user_id) do update
         set state = excluded.state, entry_fee_coins = excluded.entry_fee_coins,
             entry_fee_state = excluded.entry_fee_state, joined_at = excluded.joined_at,
             updated_at = now()
       returning id`,
      [
        tournamentId,
        userId,
        decision.state,
        rules.config.entryFeeCoins,
        rules.config.entryFeeCoins === 0 ? 'not_required' : 'pending',
      ],
    );
    if (decision.state === 'approved') {
      await applyEntryFee(client, {
        tournamentId,
        participantId: participant.rows[0]!.id,
        userId,
        amount: rules.config.entryFeeCoins,
      });
      await enqueueTournamentPush(client, {
        tournamentId,
        userId,
        eventType: 'tournament.application_approved',
        eventKey: `${tournamentId}:application-approved:${userId}`,
        variables: { tournamentTitle: tournament.title },
        fallback: {
          title: 'Заявка подтверждена',
          body: `${tournament.title}: вы участвуете.`,
          url: '/?view=amateur&section=tournaments',
        },
      });
    }
    return { tournamentId, participantId: participant.rows[0]!.id, state: decision.state };
  });
}

export async function deleteEmptyDraft(pool: Pool, tournamentId: string): Promise<void> {
  const result = await pool.query(
    `delete from tournament t
      where t.id = $1 and t.status = 'draft'
        and not exists (select 1 from tournament_participant p where p.tournament_id = t.id)`,
    [tournamentId],
  );
  if (result.rowCount === 0) {
    throw new AppError('conflict', 'only an empty draft can be deleted', 409);
  }
}

async function refundEntryFee(
  client: PoolClient,
  input: { tournamentId: string; participantId: string; userId: string; amount: number },
): Promise<void> {
  if (input.amount === 0) return;
  const key = `tournament:${input.tournamentId}:refund:${input.userId}`;
  const inserted = await client.query<{ id: string }>(
    `insert into tournament_economy_event
       (tournament_id, participant_id, idempotency_key, kind, coins)
     values ($1, $2, $3, 'entry_refund', $4)
     on conflict (idempotency_key) do nothing returning id`,
    [input.tournamentId, input.participantId, key, input.amount],
  );
  if (inserted.rowCount === 0) return;
  await client.query('select id from users where id = $1 for update', [input.userId]);
  await client.query(
    `insert into user_currency_account (user_id) values ($1) on conflict do nothing`,
    [input.userId],
  );
  const account = await client.query<{ balance: number; reserved_balance: number }>(
    `update user_currency_account set balance = balance + $2, updated_at = now()
      where user_id = $1 returning balance, reserved_balance`,
    [input.userId, input.amount],
  );
  await client.query(
    `insert into currency_ledger
       (user_id, reason, available_delta, reserved_delta, balance_after, reserved_after, metadata)
     values ($1, 'tournament_entry_refund', $2, 0, $3, $4, $5)`,
    [
      input.userId,
      input.amount,
      Number(account.rows[0]!.balance),
      Number(account.rows[0]!.reserved_balance),
      JSON.stringify({ tournament_id: input.tournamentId, participant_id: input.participantId }),
    ],
  );
  await client.query(
    `update tournament_economy_event set status = 'applied', applied_at = now() where id = $1`,
    [inserted.rows[0]!.id],
  );
  await client.query(
    `update tournament_participant set entry_fee_state = 'refunded', updated_at = now() where id = $1`,
    [input.participantId],
  );
}

export async function withdrawTournamentApplication(
  pool: Pool,
  tournamentId: string,
  userId: string,
) {
  return inTransaction(pool, async (client) => {
    await lockTournament(client, tournamentId);
    const tournament = await client.query<{ status: TournamentStatus }>(
      `select status from tournament where id = $1 for update`,
      [tournamentId],
    );
    if (!tournament.rows[0]) throw new AppError('not_found', 'tournament not found', 404);
    if (!['registration', 'registration_blocked'].includes(tournament.rows[0].status)) {
      throw new AppError('conflict', 'application can no longer be withdrawn', 409);
    }
    const participantResult = await client.query<{
      id: string;
      state: string;
      entry_fee_coins: number;
      entry_fee_state: string;
    }>(
      `select id, state, entry_fee_coins, entry_fee_state
         from tournament_participant
        where tournament_id = $1 and user_id = $2 for update`,
      [tournamentId, userId],
    );
    const participant = participantResult.rows[0];
    if (!participant || !['applied', 'approved', 'invited'].includes(participant.state)) {
      throw new AppError('conflict', 'active application not found', 409);
    }
    if (participant.entry_fee_state === 'paid') {
      await refundEntryFee(client, {
        tournamentId,
        participantId: participant.id,
        userId,
        amount: Number(participant.entry_fee_coins),
      });
    }
    await client.query(
      `update tournament_participant
          set state = 'withdrawn', withdrawn_at = now(), updated_at = now()
        where id = $1`,
      [participant.id],
    );
    return { tournamentId, state: 'withdrawn' as const };
  });
}

export async function inviteTournamentParticipant(
  pool: Pool,
  tournamentId: string,
  userId: string,
  invitedBy: string,
) {
  return inTransaction(pool, async (client) => {
    await lockTournament(client, tournamentId);
    const tournament = await client.query<{ status: TournamentStatus; entry_fee_coins: number }>(
      `select tournament.status,
              (revision.rules_snapshot->'config'->>'entryFeeCoins')::int as entry_fee_coins
         from tournament
         join tournament_revision revision on revision.id = tournament.published_revision_id
        where tournament.id = $1
        for update of tournament`,
      [tournamentId],
    );
    if (!tournament.rows[0]) throw new AppError('not_found', 'tournament not found', 404);
    if (!['registration', 'registration_blocked'].includes(tournament.rows[0].status)) {
      throw new AppError('registration_closed', 'registration is closed', 409);
    }
    const entryFeeCoins = Number(tournament.rows[0].entry_fee_coins);
    const { rows } = await client.query<{ id: string }>(
      `insert into tournament_participant
         (tournament_id, user_id, state, invited_by, entry_fee_coins, entry_fee_state)
       values ($1, $2, 'invited', $3, $4, case when $4 = 0 then 'not_required' else 'pending' end)
       on conflict (tournament_id, user_id) do update
         set state = case
               when tournament_participant.state in ('rejected', 'declined', 'withdrawn')
               then 'invited' else tournament_participant.state end,
             entry_fee_coins = case
               when tournament_participant.state in ('rejected', 'declined', 'withdrawn')
               then excluded.entry_fee_coins else tournament_participant.entry_fee_coins end,
             entry_fee_state = case
               when tournament_participant.state in ('rejected', 'declined', 'withdrawn')
               then excluded.entry_fee_state else tournament_participant.entry_fee_state end,
             invited_by = $3, updated_at = now()
       returning id`,
      [tournamentId, userId, invitedBy, entryFeeCoins],
    );
    return { participantId: rows[0]!.id, state: 'invited' as const };
  });
}

export async function approveTournamentParticipant(
  pool: Pool,
  tournamentId: string,
  participantId: string,
  approvedBy: string,
) {
  return inTransaction(pool, async (client) => {
    await lockTournament(client, tournamentId);
    const tournamentResult = await client.query<{
      status: TournamentStatus;
      title: string;
      rules_snapshot: TournamentRulesSnapshot;
    }>(
      `select t.status, t.title, r.rules_snapshot from tournament t
         join tournament_revision r on r.id = t.published_revision_id
        where t.id = $1 for update of t`,
      [tournamentId],
    );
    const tournament = tournamentResult.rows[0];
    if (!tournament || !['registration', 'registration_blocked'].includes(tournament.status)) {
      throw new AppError('registration_closed', 'registration is closed', 409);
    }
    const participantResult = await client.query<{
      id: string;
      user_id: string;
      state: string;
      entry_fee_coins: number;
    }>(
      `select id, user_id, state, entry_fee_coins from tournament_participant
        where id = $1 and tournament_id = $2 for update`,
      [participantId, tournamentId],
    );
    const participant = participantResult.rows[0];
    if (!participant || !['applied', 'invited'].includes(participant.state)) {
      throw new AppError('conflict', 'participant cannot be approved', 409);
    }
    const count = await client.query<{ count: string }>(
      `select count(*)::text as count from tournament_participant
        where tournament_id = $1 and state = 'approved'`,
      [tournamentId],
    );
    if (Number(count.rows[0]?.count ?? 0) >= tournament.rules_snapshot.config.participantLimit) {
      throw new AppError('capacity_reached', 'capacity reached', 409);
    }
    const entryFeeCoins = tournament.rules_snapshot.config.entryFeeCoins;
    await client.query(
      `update tournament_participant
          set state = 'approved', approved_by = $2, joined_at = now(),
              entry_fee_coins = $3,
              entry_fee_state = case when $3 = 0 then 'not_required' else 'pending' end,
              updated_at = now()
        where id = $1`,
      [participant.id, approvedBy, entryFeeCoins],
    );
    await applyEntryFee(client, {
      tournamentId,
      participantId: participant.id,
      userId: participant.user_id,
      amount: entryFeeCoins,
    });
    await enqueueTournamentPush(client, {
      tournamentId,
      userId: participant.user_id,
      eventType: 'tournament.application_approved',
      eventKey: `${tournamentId}:application-approved:${participant.user_id}`,
      variables: { tournamentTitle: tournament.title },
      fallback: {
        title: 'Заявка подтверждена',
        body: `${tournament.title}: вы участвуете.`,
        url: '/?view=amateur&section=tournaments',
      },
    });
    return { participantId, state: 'approved' as const };
  });
}

export async function approveAllTournamentApplications(
  pool: Pool,
  tournamentId: string,
  approvedBy: string,
) {
  return inTransaction(pool, async (client) => {
    await lockTournament(client, tournamentId);
    const tournamentResult = await client.query<{
      status: TournamentStatus;
      title: string;
      rules_snapshot: TournamentRulesSnapshot;
    }>(
      `select t.status, t.title, r.rules_snapshot from tournament t
         join tournament_revision r on r.id = t.published_revision_id
        where t.id = $1 for update of t`,
      [tournamentId],
    );
    const tournament = tournamentResult.rows[0];
    if (!tournament || !['registration', 'registration_blocked'].includes(tournament.status)) {
      throw new AppError('registration_closed', 'registration is closed', 409);
    }
    const pending = await client.query<{
      id: string;
      user_id: string;
    }>(
      `select id, user_id from tournament_participant
        where tournament_id = $1 and state = 'applied'
        order by created_at, id
        for update`,
      [tournamentId],
    );
    if (pending.rows.length === 0) return { approvedCount: 0 };

    const approved = await client.query<{ count: number }>(
      `select count(*)::int as count from tournament_participant
        where tournament_id = $1 and state = 'approved'`,
      [tournamentId],
    );
    const approvedCount = Number(approved.rows[0]?.count ?? 0);
    const participantLimit = tournament.rules_snapshot.config.participantLimit;
    if (approvedCount + pending.rows.length > participantLimit) {
      throw new AppError('capacity_reached', 'capacity reached', 409, {
        approvedCount,
        participantLimit,
        availableSlots: Math.max(0, participantLimit - approvedCount),
        pendingCount: pending.rows.length,
      });
    }

    const entryFeeCoins = tournament.rules_snapshot.config.entryFeeCoins;
    for (const participant of pending.rows) {
      await client.query(
        `update tournament_participant
            set state = 'approved', approved_by = $2, joined_at = now(),
                entry_fee_coins = $3,
                entry_fee_state = case when $3 = 0 then 'not_required' else 'pending' end,
                updated_at = now()
          where id = $1`,
        [participant.id, approvedBy, entryFeeCoins],
      );
      await applyEntryFee(client, {
        tournamentId,
        participantId: participant.id,
        userId: participant.user_id,
        amount: entryFeeCoins,
      });
      await enqueueTournamentPush(client, {
        tournamentId,
        userId: participant.user_id,
        eventType: 'tournament.application_approved',
        eventKey: `${tournamentId}:application-approved:${participant.user_id}`,
        variables: { tournamentTitle: tournament.title },
        fallback: {
          title: 'Заявка подтверждена',
          body: `${tournament.title}: вы участвуете.`,
          url: '/?view=amateur&section=tournaments',
        },
      });
    }
    await client.query(
      `insert into event_log (user_id, type, payload)
       values ($1, 'admin_tournament_applications_bulk_approved', $2)`,
      [
        approvedBy,
        JSON.stringify({
          tournament_id: tournamentId,
          approved_count: pending.rows.length,
          participant_ids: pending.rows.map((participant) => participant.id),
        }),
      ],
    );
    return { approvedCount: pending.rows.length };
  });
}

export async function rejectTournamentApplication(
  pool: Pool,
  input: {
    tournamentId: string;
    participantId: string;
    reason: string;
    adminUserId: string;
  },
) {
  return inTransaction(pool, async (client) => {
    await lockTournament(client, input.tournamentId);
    const tournament = await client.query<{ status: TournamentStatus; title: string }>(
      `select status, title from tournament where id = $1 for update`,
      [input.tournamentId],
    );
    if (
      !tournament.rows[0] ||
      !['registration', 'registration_blocked'].includes(tournament.rows[0].status)
    ) {
      throw new AppError('registration_closed', 'registration is closed', 409);
    }
    const participant = await client.query<{ user_id: string; updated_at: Date }>(
      `update tournament_participant
          set state = 'rejected', updated_at = now(),
              metadata = metadata || jsonb_build_object(
                'rejectionReason', $3::text,
                'rejectedBy', $4::text,
                'rejectedAt', now()
              )
        where id = $1 and tournament_id = $2 and state = 'applied'
        returning user_id, updated_at`,
      [input.participantId, input.tournamentId, input.reason, input.adminUserId],
    );
    const rejected = participant.rows[0];
    if (!rejected) throw new AppError('conflict', 'application cannot be rejected', 409);

    await enqueueTournamentPush(client, {
      tournamentId: input.tournamentId,
      userId: rejected.user_id,
      eventType: 'tournament.manual',
      eventKey: `${input.participantId}:application-rejected:${rejected.updated_at.toISOString()}`,
      variables: {
        title: 'Заявка отклонена',
        body: `${tournament.rows[0].title}: заявка не подтверждена.`,
      },
      fallback: {
        title: 'Заявка отклонена',
        body: `${tournament.rows[0].title}: заявка не подтверждена.`,
        url: '/?view=amateur&section=tournaments',
      },
    });
    await client.query(
      `insert into event_log (user_id, type, payload)
       values ($1, 'admin_tournament_application_rejected', $2)`,
      [
        input.adminUserId,
        JSON.stringify({
          tournament_id: input.tournamentId,
          participant_id: input.participantId,
          reason: input.reason,
        }),
      ],
    );
    return { participantId: input.participantId, state: 'rejected' as const };
  });
}

export async function cancelTournament(
  pool: Pool,
  tournamentId: string,
  expectedRevision: number,
  cancelledBy: string,
) {
  return inTransaction(pool, async (client) => {
    await lockTournament(client, tournamentId);
    const tournament = await client.query<{ status: TournamentStatus; current_revision: number }>(
      `select status, current_revision from tournament where id = $1 for update`,
      [tournamentId],
    );
    const row = tournament.rows[0];
    if (!row) throw new AppError('not_found', 'tournament not found', 404);
    if (Number(row.current_revision) !== expectedRevision) {
      throw new AppError('revision_conflict', 'tournament was changed in another tab', 409);
    }
    if (['completed', 'cancelled', 'archived'].includes(row.status)) {
      throw new AppError('conflict', 'tournament cannot be cancelled', 409);
    }
    const participants = await client.query<{
      id: string;
      user_id: string;
      entry_fee_coins: number;
    }>(
      `select id, user_id, entry_fee_coins from tournament_participant
        where tournament_id = $1 and entry_fee_state = 'paid' for update`,
      [tournamentId],
    );
    for (const participant of participants.rows) {
      await refundEntryFee(client, {
        tournamentId,
        participantId: participant.id,
        userId: participant.user_id,
        amount: Number(participant.entry_fee_coins),
      });
    }
    await terminalizeTournamentFixtureDuels(client, {
      tournamentId,
      reason: 'tournament_cancelled',
    });
    await client.query(
      `update tournament_fixture
          set status = 'cancelled', updated_at = now()
        where tournament_id = $1
          and status in ('conditional', 'scheduled', 'open', 'active', 'paused')`,
      [tournamentId],
    );
    await client.query(
      `update tournament_fixture_segment segment
          set status = 'cancelled'
         from tournament_fixture fixture
        where fixture.id = segment.fixture_id
          and fixture.tournament_id = $1
          and segment.status in ('pending', 'scheduled', 'active')`,
      [tournamentId],
    );
    await client.query(
      `update tournament set status = 'cancelled', cancelled_at = now(),
              updated_by = $2, updated_at = now() where id = $1`,
      [tournamentId, cancelledBy],
    );
    return { tournamentId, status: 'cancelled' as const };
  });
}

export async function archiveTournament(pool: Pool, tournamentId: string, userId: string) {
  const result = await pool.query(
    `update tournament set status = 'archived', archived_at = now(), updated_by = $2, updated_at = now()
      where id = $1 and status in ('completed', 'cancelled')`,
    [tournamentId, userId],
  );
  if (result.rowCount === 0) throw new AppError('conflict', 'tournament cannot be archived', 409);
  return { tournamentId, status: 'archived' as const };
}

export async function pauseTournament(
  pool: Pool,
  input: { tournamentId: string; reason: string; adminUserId: string },
) {
  return inTransaction(pool, async (client) => {
    await lockTournament(client, input.tournamentId);
    const tournament = await client.query<{ status: TournamentStatus }>(
      `select status from tournament where id = $1 for update`,
      [input.tournamentId],
    );
    const previousStatus = tournament.rows[0]?.status;
    if (previousStatus === undefined) throw new AppError('not_found', 'tournament not found', 404);
    if (!canTransitionTournament(previousStatus, 'paused')) {
      throw new AppError('conflict', 'tournament cannot be paused', 409);
    }
    await client.query(
      `update tournament
          set status = 'paused', updated_by = $2, updated_at = now()
        where id = $1`,
      [input.tournamentId, input.adminUserId],
    );
    await client.query(
      `insert into tournament_adjustment
         (tournament_id, kind, payload, reason, created_by)
       values ($1, 'incident_resolution', $2, $3, $4)`,
      [
        input.tournamentId,
        JSON.stringify({ action: 'pause', previousStatus }),
        input.reason,
        input.adminUserId,
      ],
    );
    return { tournamentId: input.tournamentId, status: 'paused' as const, previousStatus };
  });
}

export async function resumeTournament(
  pool: Pool,
  input: { tournamentId: string; reason: string; adminUserId: string },
) {
  return inTransaction(pool, async (client) => {
    await lockTournament(client, input.tournamentId);
    const tournament = await client.query<{ status: TournamentStatus }>(
      `select status from tournament where id = $1 for update`,
      [input.tournamentId],
    );
    const status = tournament.rows[0]?.status;
    if (status === undefined) throw new AppError('not_found', 'tournament not found', 404);
    if (status !== 'paused') throw new AppError('conflict', 'tournament is not paused', 409);
    const audit = await client.query<{ previous_status: TournamentStatus | null }>(
      `select payload->>'previousStatus' as previous_status
         from tournament_adjustment
        where tournament_id = $1
          and kind = 'incident_resolution'
          and payload->>'action' = 'pause'
        order by created_at desc, id desc
        limit 1`,
      [input.tournamentId],
    );
    const previousStatus = audit.rows[0]?.previous_status;
    if (
      previousStatus === null ||
      previousStatus === undefined ||
      !canTransitionTournament('paused', previousStatus)
    ) {
      throw new AppError('conflict', 'previous tournament status is not recoverable', 409);
    }
    await client.query(
      `update tournament
          set status = $2, updated_by = $3, updated_at = now()
        where id = $1`,
      [input.tournamentId, previousStatus, input.adminUserId],
    );
    await client.query(
      `insert into tournament_adjustment
         (tournament_id, kind, payload, reason, created_by)
       values ($1, 'incident_resolution', $2, $3, $4)`,
      [
        input.tournamentId,
        JSON.stringify({ action: 'resume', previousStatus }),
        input.reason,
        input.adminUserId,
      ],
    );
    return { tournamentId: input.tournamentId, status: previousStatus };
  });
}

export async function generateRegularSchedule(
  pool: Pool,
  tournamentId: string,
  expectedRevision: number,
  options: { manualPlayoffSize?: TournamentPlayoffSize; recoveredBy?: string } = {},
): Promise<GenerateRegularScheduleOutcome> {
  return inTransaction(pool, async (client) => {
    await lockTournament(client, tournamentId);
    const tournamentResult = await client.query<{
      status: TournamentStatus;
      current_revision: number;
      starts_at: Date | null;
      title: string;
      created_by: string;
      rules_snapshot: TournamentRulesSnapshot;
    }>(
      `select t.status, t.current_revision, t.starts_at, t.title, t.created_by::text, r.rules_snapshot
         from tournament t join tournament_revision r on r.id = t.published_revision_id
        where t.id = $1 for update of t`,
      [tournamentId],
    );
    const tournament = tournamentResult.rows[0];
    if (!tournament) throw new AppError('not_found', 'tournament not found', 404);
    if (!['registration', 'registration_blocked', 'scheduling'].includes(tournament.status)) {
      throw new AppError('conflict', 'schedule cannot be regenerated after publication', 409);
    }
    const participants = await client.query<{ id: string }>(
      `select id from tournament_participant
        where tournament_id = $1 and state = 'approved'
        order by seed nulls last, joined_at, id`,
      [tournamentId],
    );
    const participantCount = participants.rows.length;
    const manualPlayoffSize = options.manualPlayoffSize;
    const manualRecovery = manualPlayoffSize !== undefined;
    let revision = Number(tournament.current_revision);
    let rulesSnapshot = tournament.rules_snapshot;
    let config = rulesSnapshot.config;
    const acceptedManualRetry =
      manualRecovery &&
      tournament.status === 'scheduling' &&
      revision === expectedRevision + 1 &&
      config.playoffSize === manualPlayoffSize;
    if (revision !== expectedRevision && !acceptedManualRetry) {
      throw new AppError('revision_conflict', 'tournament was changed in another tab', 409);
    }
    if (
      manualRecovery &&
      (config.regularSource !== 'head_to_head' ||
        participantCount < 2 ||
        manualPlayoffSize > participantCount)
    ) {
      throw new AppError('conflict', 'manual schedule recovery is not available', 409);
    }
    if (manualRecovery && tournament.status !== 'registration_blocked' && !acceptedManualRetry) {
      throw new AppError('conflict', 'manual schedule recovery is not available', 409);
    }
    const outcome = () => ({
      tournamentId,
      beforeStatus: tournament.status,
      revision,
      participantCount,
      playoffSize: config.playoffSize,
      title: tournament.title,
      createdBy: tournament.created_by,
    });
    if (tournament.status === 'scheduling') {
      const existing = await client.query<{
        matchday_count: number;
        round_count: number;
        fixture_count: number;
      }>(
        `select
           (select count(*)::int from tournament_matchday where tournament_id = $1) as matchday_count,
           (select count(*)::int from tournament_round where tournament_id = $1) as round_count,
           (select count(*)::int from tournament_fixture where tournament_id = $1) as fixture_count`,
        [tournamentId],
      );
      const counts = existing.rows[0]!;
      if (Number(counts.matchday_count) > 0) {
        return {
          ...outcome(),
          status: 'scheduling' as const,
          changed: false,
          matchdayCount: Number(counts.matchday_count),
          roundCount: Number(counts.round_count),
          fixtureCount: Number(counts.fixture_count),
        };
      }
    }
    if (manualRecovery) {
      if (options.recoveredBy === undefined) {
        throw new AppError(
          'configuration_error',
          'manual schedule recovery requires an administrator',
          409,
        );
      }
      revision += 1;
      rulesSnapshot = {
        ...rulesSnapshot,
        config: { ...config, playoffSize: manualPlayoffSize },
      } as TournamentRulesSnapshot;
      config = rulesSnapshot.config;
      const insertedRevision = await client.query<{ id: string }>(
        `insert into tournament_revision
           (tournament_id, revision, rules_snapshot, is_published, published_at, created_by)
         values ($1, $2, $3, true, now(), $4)
         returning id`,
        [tournamentId, revision, JSON.stringify(rulesSnapshot), options.recoveredBy],
      );
      await client.query(
        `update tournament
            set current_revision = $2, published_revision_id = $3, updated_by = $4, updated_at = now()
          where id = $1`,
        [tournamentId, revision, insertedRevision.rows[0]!.id, options.recoveredBy],
      );
      await appendEvent(client, options.recoveredBy, 'admin_tournament_manual_schedule_recovered', {
        tournament_id: tournamentId,
        previous_revision: expectedRevision,
        revision,
        playoff_size: manualPlayoffSize,
        approved_participant_count: participantCount,
      });
    }
    if (tournament.starts_at === null)
      throw new AppError('conflict', 'start time is required', 409);
    const regularLifecycleV2 =
      config.regularSource === 'head_to_head' && rulesSnapshot.duelLifecycleVersion === 2;
    const regularReadinessMinutes = boundedInteger(
      rulesSnapshot.regularReadinessMinutes ?? rulesSnapshot.readinessMinutes,
      DEFAULT_TOURNAMENT_READINESS_MINUTES,
      1,
      120,
    );
    let regularAttemptTemplate: DuelTemplateLifecycleSnapshot | null = null;
    if (regularLifecycleV2) {
      if (typeof rulesSnapshot.regularDuelTemplateId !== 'string') {
        throw new AppError('configuration_error', 'regular duel template is not configured', 409);
      }
      regularAttemptTemplate = await loadDuelTemplateLifecycleSnapshot(
        client,
        rulesSnapshot.regularDuelTemplateId,
      );
    }
    if (participantCount < config.playoffSize) {
      const changed = tournament.status !== 'registration_blocked';
      if (changed) {
        await client.query(
          `update tournament set status = 'registration_blocked', updated_at = now() where id = $1`,
          [tournamentId],
        );
      }
      const blockedOutcome = {
        ...outcome(),
        status: 'registration_blocked' as const,
        changed,
        matchdayCount: 0,
        roundCount: 0,
        fixtureCount: 0,
      };
      await enqueueRegistrationBlockedPushes(client, blockedOutcome);
      return blockedOutcome;
    }
    await client.query(`delete from tournament_matchday where tournament_id = $1`, [tournamentId]);
    let roundCount = 0;
    let fixtureCount = 0;
    let matchdayCount = 0;
    if (config.regularSource === 'head_to_head') {
      const plan = buildHeadToHeadSchedulePlan({
        participantIds: participants.rows.map((participant) => participant.id),
        cycles: config.roundRobinCycles,
        roundsPerDay: config.roundsPerDay,
        firstStart: tournament.starts_at,
        timezone: config.timezone,
        firstRoundLocalTime: config.firstRoundLocalTime,
        fixtureWindowMs: config.fixtureWindowMs,
        roundBreakMs: config.roundBreakMs,
      });
      const grouped = new Map<number, typeof plan>();
      for (const round of plan) {
        const day = grouped.get(round.matchdayNumber) ?? [];
        day.push(round);
        grouped.set(round.matchdayNumber, day);
      }
      const matchdayIds = new Map<number, string>();
      for (const [number, rounds] of grouped) {
        const startsAt = rounds[0]!.startsAt;
        const endsAt = rounds[rounds.length - 1]!.endsAt;
        const inserted = await client.query<{ id: string }>(
          `insert into tournament_matchday
             (tournament_id, number, local_date, starts_at, ends_at)
           values ($1, $2, ($3::timestamptz at time zone $5)::date, $3, $4)
           returning id`,
          [tournamentId, number, startsAt, endsAt, config.timezone],
        );
        matchdayCount += 1;
        matchdayIds.set(number, inserted.rows[0]!.id);
      }
      for (const round of plan) {
        const insertedRound = await client.query<{ id: string }>(
          `insert into tournament_round
             (tournament_id, matchday_id, stage, number, cycle_number, starts_at, ends_at,
              rules_snapshot)
           values ($1, $2, 'regular', $3, $4, $5, $6, $7) returning id`,
          [
            tournamentId,
            matchdayIds.get(round.matchdayNumber),
            round.roundNumber,
            round.cycleNumber,
            round.startsAt,
            round.endsAt,
            JSON.stringify({ byeParticipantId: round.byeParticipantId }),
          ],
        );
        roundCount += 1;
        for (const fixture of round.fixtures) {
          fixtureCount += 1;
          const insertedFixture = await client.query<{ id: string }>(
            `insert into tournament_fixture
               (tournament_id, round_id, fixture_number, home_participant_id,
                away_participant_id, scheduled_starts_at, window_ends_at, status, venue_mode)
             values ($1, $2, $3, $4, $5, $6, $7, 'scheduled', $8)
             returning id`,
            [
              tournamentId,
              insertedRound.rows[0]!.id,
              fixtureCount,
              fixture.homeParticipantId,
              fixture.awayParticipantId,
              round.startsAt,
              round.endsAt,
              fixture.venueMode,
            ],
          );
          if (regularAttemptTemplate !== null) {
            await insertInitialFixtureAttempt(client, {
              fixtureId: insertedFixture.rows[0]!.id,
              roundGameDayId: null,
              scheduledStartsAt: new Date(round.startsAt),
              readinessMinutes: regularReadinessMinutes,
              template: regularAttemptTemplate,
            });
          }
        }
      }
    } else {
      for (let day = 1; day <= config.dailyDays; day += 1) {
        const startsAt = addZonedCalendarDays(tournament.starts_at, config.timezone, day - 1);
        const endsAt = addZonedCalendarDays(tournament.starts_at, config.timezone, day);
        await client.query(
          `insert into tournament_matchday
             (tournament_id, number, local_date, starts_at, ends_at)
           values ($1, $2, ($3::timestamptz at time zone $5)::date, $3, $4)`,
          [tournamentId, day, startsAt, endsAt, config.timezone],
        );
        matchdayCount += 1;
      }
    }
    await client.query(
      `update tournament set status = 'scheduling', updated_at = now() where id = $1`,
      [tournamentId],
    );
    return {
      ...outcome(),
      status: 'scheduling' as const,
      changed: true,
      matchdayCount,
      roundCount,
      fixtureCount,
    };
  });
}

export async function publishRegularSchedule(pool: Pool, tournamentId: string) {
  return inTransaction(pool, async (client) => {
    await lockTournament(client, tournamentId);
    const tournament = await client.query<{
      title: string;
      current_revision: number;
      regular_source: TournamentConfig['regularSource'];
      rules_snapshot: TournamentRulesSnapshot;
    }>(
      `select t.title, t.current_revision, t.regular_source, revision.rules_snapshot
         from tournament t
         join tournament_revision revision on revision.id = t.published_revision_id
        where t.id = $1 and t.status = 'scheduling' for update of t`,
      [tournamentId],
    );
    const current = tournament.rows[0];
    if (!current) throw new AppError('conflict', 'schedule is not ready', 409);
    await client.query(
      `update tournament set status = 'regular', updated_at = now() where id = $1`,
      [tournamentId],
    );
    const publishedConfig = current.rules_snapshot.config;
    if (
      current.regular_source !== 'head_to_head' &&
      publishedConfig.regularSource !== 'head_to_head'
    ) {
      await rebuildDailyAggregateStandings(client, tournamentId, {
        ...current.rules_snapshot,
        config: publishedConfig,
      });
    }
    await enqueueTournamentAudiencePush(client, {
      tournamentId,
      eventType: 'tournament.schedule_published',
      eventKey: `${tournamentId}:schedule-published:${current.current_revision}`,
      variables: { tournamentTitle: current.title },
      fallback: {
        title: 'Календарь опубликован',
        body: `Расписание турнира ${current.title} готово.`,
        url: '/?view=amateur&section=tournaments',
      },
    });
    return { tournamentId, status: 'regular' as const };
  });
}

interface TournamentScheduleFixtureRow {
    id: string;
    series_id: string | null;
    game_number: number | null;
    series_wins_required: number | null;
    game_day_id: string | null;
    game_day_number: number | null;
    game_day_local_date: string | null;
    game_day_starts_at: Date | null;
    fixture_number: number;
    stage: string;
    round_number: number;
    scheduled_starts_at: Date | null;
    window_ends_at: Date | null;
    status: string;
    venue_mode: 'home_selected' | 'neutral_default';
    home_user_id: string | null;
    home_name: string | null;
    home_avatar_url: string | null;
    home_seed: number | null;
    away_user_id: string | null;
    away_name: string | null;
    away_avatar_url: string | null;
    away_seed: number | null;
    home_score: number;
    away_score: number;
    settled_at?: Date | null;
    actual_starts_at?: Date | null;
    winner_user_id?: string | null;
    technical_result: boolean;
}

function tournamentScheduleFixtureDto(row: TournamentScheduleFixtureRow) {
  return {
    id: row.id,
    seriesId: row.series_id ?? null,
    gameNumber: row.game_number == null ? null : Number(row.game_number),
    seriesWinsRequired:
      row.series_wins_required == null ? null : Number(row.series_wins_required),
    gameDay:
      row.game_day_id == null || row.game_day_local_date == null || row.game_day_starts_at == null
        ? null
        : {
            id: row.game_day_id,
            dayNumber: Number(row.game_day_number),
            localDate: row.game_day_local_date,
            startsAt: row.game_day_starts_at.toISOString(),
          },
    fixtureNumber: Number(row.fixture_number),
    stage: row.stage,
    roundNumber: Number(row.round_number),
    scheduledStartsAt: row.scheduled_starts_at?.toISOString() ?? null,
    windowEndsAt: row.window_ends_at?.toISOString() ?? null,
    actualStartsAt: row.actual_starts_at?.toISOString() ?? null,
    status: row.status,
    venueMode: row.venue_mode,
    home:
      row.home_user_id === null
        ? null
        : {
            userId: row.home_user_id,
            name: row.home_name,
            avatarUrl: row.home_avatar_url,
            seed: row.home_seed === null ? null : Number(row.home_seed),
          },
    away:
      row.away_user_id === null
        ? null
        : {
            userId: row.away_user_id,
            name: row.away_name,
            avatarUrl: row.away_avatar_url,
            seed: row.away_seed === null ? null : Number(row.away_seed),
          },
    score: { home: Number(row.home_score), away: Number(row.away_score) },
    winnerUserId: row.winner_user_id ?? null,
    technicalResult: row.technical_result,
  };
}

const PUBLIC_SCHEDULE_FIXTURE_SELECT = `
  select fixture.id, fixture.series_id, fixture.game_number, fixture.series_wins_required,
         fixture.game_day_id, fixture.game_day_number, fixture.game_day_local_date,
         fixture.game_day_starts_at,
         fixture.fixture_number, fixture.stage, fixture.round_number,
         fixture.scheduled_starts_at, fixture.window_ends_at, fixture.actual_starts_at,
         fixture.status, fixture.venue_mode,
         fixture.home_user_id, fixture.home_name, fixture.home_avatar_url, fixture.home_seed,
         fixture.away_user_id, fixture.away_name, fixture.away_avatar_url, fixture.away_seed,
         fixture.home_score, fixture.away_score, fixture.winner_user_id,
         fixture.technical_result
    from fixture_scope fixture`;

const PUBLIC_SCHEDULE_FIXTURE_SCOPE = `
  with fixture_scope as (
    select f.id, f.series_id,
           (f.result_snapshot->>'gameNumber')::int as game_number,
           series.wins_required as series_wins_required,
           coalesce(game_day.id, planned_game_day.id) as game_day_id,
           coalesce(game_day.day_number, planned_game_day.day_number) as game_day_number,
           coalesce(game_day.local_date, planned_game_day.local_date)::text as game_day_local_date,
           coalesce(
             (to_jsonb(game_day)->>'rescheduled_starts_at')::timestamptz,
             game_day.first_game_starts_at,
             planned_game_day.rescheduled_starts_at,
             planned_game_day.first_game_starts_at
           ) as game_day_starts_at,
           f.fixture_number, r.stage, r.number as round_number,
           f.scheduled_starts_at, f.window_ends_at, f.status, f.venue_mode,
           coalesce(
             game_day.local_date,
             (f.scheduled_starts_at at time zone
               coalesce(revision.rules_snapshot->'config'->>'timezone', 'Europe/Moscow'))::date,
             planned_game_day.local_date
           )
             as local_date,
           duel.accepted_at as actual_starts_at,
           hp.user_id as home_user_id, hu.display_name as home_name,
           coalesce(case
             when hu.display_source = 'custom' then hu.custom_avatar_url
             when hu.display_source = 'vk' then hu.vk_avatar_url
             when hu.display_source = 'telegram' then hu.tg_avatar_url
             else hu.avatar_url end, hu.avatar_url) as home_avatar_url,
           case when r.stage in ('playoff', 'third_place') then hs.rank end as home_seed,
           ap.user_id as away_user_id, au.display_name as away_name,
           coalesce(case
             when au.display_source = 'custom' then au.custom_avatar_url
             when au.display_source = 'vk' then au.vk_avatar_url
             when au.display_source = 'telegram' then au.tg_avatar_url
             else au.avatar_url end, au.avatar_url) as away_avatar_url,
           case when r.stage in ('playoff', 'third_place') then aws.rank end as away_seed,
           f.home_score, f.away_score, winner.user_id as winner_user_id,
           coalesce((f.result_snapshot->>'technical')::boolean, false) as technical_result
      from tournament_fixture f
      join tournament_round r on r.id = f.round_id
      join tournament tournament on tournament.id = f.tournament_id
      join tournament_revision revision on revision.id = tournament.published_revision_id
      left join tournament_playoff_series series on series.id = f.series_id
      left join tournament_participant hp on hp.id = f.home_participant_id
      left join users hu on hu.id = hp.user_id
      left join tournament_standing hs
        on hs.tournament_id = f.tournament_id and hs.participant_id = hp.id
      left join tournament_participant ap on ap.id = f.away_participant_id
      left join users au on au.id = ap.user_id
      left join tournament_standing aws
        on aws.tournament_id = f.tournament_id and aws.participant_id = ap.id
      left join tournament_participant winner on winner.id = f.winner_participant_id
      left join lateral (
        select attempt.round_game_day_id, attempt.amateur_duel_match_id
          from tournament_fixture_attempt attempt
         where attempt.fixture_id = f.id
         order by attempt.attempt_number desc
         limit 1
       ) latest_attempt on true
       left join tournament_round_game_day game_day on game_day.id = latest_attempt.round_game_day_id
       left join lateral (
         select planned_day.id, planned_day.local_date, planned_day.day_number,
                planned_day.first_game_starts_at, planned_day.rescheduled_starts_at
           from (
             select day.id, day.local_date, day.day_number, day.first_game_starts_at,
                    (to_jsonb(day)->>'rescheduled_starts_at')::timestamptz
                      as rescheduled_starts_at,
                    sum(day.max_result_bearing_games) over (
                      order by day.day_number
                    ) as cumulative_game_capacity
               from tournament_round_game_day day
              where day.round_id = f.round_id and day.status <> 'cancelled'
           ) planned_day
          where latest_attempt.round_game_day_id is null
            and f.series_id is not null
            and f.status in ('conditional', 'scheduled', 'open', 'active')
            and planned_day.cumulative_game_capacity >=
                coalesce((f.result_snapshot->>'gameNumber')::int, 1)
          order by planned_day.day_number
          limit 1
       ) planned_game_day on true
       left join amateur_duel_match duel on duel.id = latest_attempt.amateur_duel_match_id
     where f.tournament_id = $1
  )`;

export async function getTournamentScheduleDay(
  pool: Pool,
  tournamentId: string,
  userId: string,
  localDate: string,
) {
  const daysResult = await pool.query<{
    local_date: string;
    has_games: boolean;
    has_my_game: boolean;
    has_playoff: boolean;
  }>(
    `${PUBLIC_SCHEDULE_FIXTURE_SCOPE}
     select local_date::text as local_date, true as has_games,
            bool_or($2::uuid in (home_user_id, away_user_id)) as has_my_game,
            bool_or(stage in ('playoff', 'third_place')) as has_playoff
       from fixture_scope
      where local_date is not null
      group by local_date
      order by local_date`,
    [tournamentId, userId],
  );
  const myGamesResult = await pool.query<TournamentScheduleFixtureRow>(
    `${PUBLIC_SCHEDULE_FIXTURE_SCOPE}
     ${PUBLIC_SCHEDULE_FIXTURE_SELECT}
      where fixture.local_date = $3::date
        and $2::uuid in (home_user_id, away_user_id)
      order by fixture.fixture_number, fixture.id`,
    [tournamentId, userId, localDate],
  );
  const otherGamesResult = await pool.query<{ has_other_games: boolean }>(
    `${PUBLIC_SCHEDULE_FIXTURE_SCOPE}
     select exists(
       select 1 from fixture_scope fixture
        where fixture.local_date = $3::date
          and $2::uuid not in (home_user_id, away_user_id)
     ) as has_other_games`,
    [tournamentId, userId, localDate],
  );
  return {
    days: daysResult.rows.map((row) => ({
      localDate: row.local_date,
      hasGames: row.has_games,
      hasMyGame: row.has_my_game,
      hasPlayoff: row.has_playoff,
    })),
    myGames: myGamesResult.rows.map(tournamentScheduleFixtureDto),
    hasOtherGames: otherGamesResult.rows[0]?.has_other_games === true,
  };
}

export interface TournamentScheduleCursor {
  fixtureNumber: number;
  id: string;
}

export async function getTournamentReadinessHint(
  pool: Pool,
  tournamentId: string,
  userId: string,
) {
  const result = await pool.query<{ dismissed_at: Date }>(
    `select dismissed_at
       from tournament_readiness_hint_preference
      where tournament_id = $1 and user_id = $2`,
    [tournamentId, userId],
  );
  const dismissedAt = result.rows[0]?.dismissed_at;
  return {
    dismissed: dismissedAt !== undefined,
    dismissedAt: dismissedAt?.toISOString() ?? null,
  };
}

export async function dismissTournamentReadinessHint(
  pool: Pool,
  tournamentId: string,
  userId: string,
) {
  const result = await pool.query<{ dismissed_at: Date }>(
    `insert into tournament_readiness_hint_preference (tournament_id, user_id)
     values ($1, $2)
     on conflict (tournament_id, user_id) do update
       set dismissed_at = tournament_readiness_hint_preference.dismissed_at
     returning dismissed_at`,
    [tournamentId, userId],
  );
  return {
    dismissed: true,
    dismissedAt: result.rows[0]!.dismissed_at.toISOString(),
  };
}

export async function getTournamentScheduleOtherGames(
  pool: Pool,
  tournamentId: string,
  userId: string,
  localDate: string,
  _cursor: TournamentScheduleCursor | null,
) {
  const result = await pool.query<TournamentScheduleFixtureRow>(
    `${PUBLIC_SCHEDULE_FIXTURE_SCOPE}
     ${PUBLIC_SCHEDULE_FIXTURE_SELECT}
      where fixture.local_date = $3::date
        and $2::uuid not in (home_user_id, away_user_id)
      order by fixture.fixture_number, fixture.id`,
    [tournamentId, userId, localDate],
  );
  return {
    games: result.rows.map(tournamentScheduleFixtureDto),
    nextCursor: null,
  };
}

export async function getTournamentSchedule(pool: Pool, tournamentId: string) {
  const { rows } = await pool.query<TournamentScheduleFixtureRow>(
    `select f.id, f.fixture_number, r.stage, r.number as round_number,
            f.scheduled_starts_at, f.window_ends_at, f.status, f.venue_mode,
            hp.user_id as home_user_id, hu.display_name as home_name,
            coalesce(
              case
                when hu.display_source = 'custom' then hu.custom_avatar_url
                when hu.display_source = 'vk' then hu.vk_avatar_url
                when hu.display_source = 'telegram' then hu.tg_avatar_url
                else hu.avatar_url
              end,
              hu.avatar_url
            ) as home_avatar_url,
            case when r.stage in ('playoff', 'third_place') then hs.rank end as home_seed,
            ap.user_id as away_user_id, au.display_name as away_name,
            coalesce(
              case
                when au.display_source = 'custom' then au.custom_avatar_url
                when au.display_source = 'vk' then au.vk_avatar_url
                when au.display_source = 'telegram' then au.tg_avatar_url
                else au.avatar_url
              end,
              au.avatar_url
            ) as away_avatar_url,
            case when r.stage in ('playoff', 'third_place') then aws.rank end as away_seed,
            f.home_score, f.away_score
       from tournament_fixture f
       join tournament_round r on r.id = f.round_id
       left join tournament_participant hp on hp.id = f.home_participant_id
       left join users hu on hu.id = hp.user_id
       left join tournament_standing hs
         on hs.tournament_id = f.tournament_id and hs.participant_id = hp.id
       left join tournament_participant ap on ap.id = f.away_participant_id
       left join users au on au.id = ap.user_id
       left join tournament_standing aws
         on aws.tournament_id = f.tournament_id and aws.participant_id = ap.id
      where f.tournament_id = $1
      order by f.fixture_number`,
    [tournamentId],
  );
  return rows.map(tournamentScheduleFixtureDto);
}

export async function getTournamentMatchdays(
  pool: Pool,
  tournamentId: string,
  userId: string | null = null,
) {
  const { rows } = await pool.query<{
    id: string;
    number: number;
    local_date: string;
    starts_at: Date;
    ends_at: Date;
    result_id: string | null;
    result_goals: number | null;
    result_shots: number | null;
    result_accuracy: string | null;
    result_completed: boolean | null;
  }>(
    `select matchday.id, matchday.number, matchday.local_date,
            matchday.starts_at, matchday.ends_at,
            result.id as result_id, result.goals as result_goals,
            result.shots as result_shots, result.accuracy as result_accuracy,
            result.completed as result_completed
       from tournament_matchday matchday
       left join tournament_participant participant
         on participant.tournament_id = matchday.tournament_id
        and participant.user_id = $2
       left join tournament_daily_result result
         on result.tournament_id = matchday.tournament_id
        and result.participant_id = participant.id
        and result.tournament_day = matchday.number
      where matchday.tournament_id = $1
      order by matchday.number`,
    [tournamentId, userId],
  );
  return rows.map((row) => ({
    id: row.id,
    number: Number(row.number),
    localDate: row.local_date,
    startsAt: row.starts_at.toISOString(),
    endsAt: row.ends_at.toISOString(),
    myResult:
      row.result_id === null
        ? null
        : {
            goals: Number(row.result_goals),
            shots: Number(row.result_shots),
            accuracy: Number(row.result_accuracy),
            completed: row.result_completed === true,
          },
  }));
}

export async function getTournamentMatchdayResults(
  pool: Pool,
  tournamentId: string,
  tournamentDay: number,
  options: {
    excludeUserId: string;
    limit: number;
    cursor: { finalizedAt: string; id: string } | null;
  },
) {
  const { rows } = await pool.query<{
    id: string;
    finalized_at: Date;
    user_id: string;
    display_name: string | null;
    avatar_url: string | null;
    goals: number;
    shots: number;
    accuracy: string;
  }>(
    `select result.id, result.finalized_at, participant.user_id, user_account.display_name,
            coalesce(
              case
                when user_account.display_source = 'custom' then user_account.custom_avatar_url
                when user_account.display_source = 'vk' then user_account.vk_avatar_url
                when user_account.display_source = 'telegram' then user_account.tg_avatar_url
                else user_account.avatar_url
              end,
              user_account.avatar_url
            ) as avatar_url,
            result.goals, result.shots, result.accuracy
       from tournament_daily_result result
       join tournament_participant participant on participant.id = result.participant_id
       join users user_account on user_account.id = participant.user_id
      where result.tournament_id = $1
        and result.tournament_day = $2
        and participant.user_id <> $3
        and result.completed = true
        and (
          $4::timestamptz is null
          or (result.finalized_at, result.id) < ($4::timestamptz, $5::uuid)
        )
      order by result.finalized_at desc, result.id desc
      limit $6`,
    [
      tournamentId,
      tournamentDay,
      options.excludeUserId,
      options.cursor?.finalizedAt ?? null,
      options.cursor?.id ?? null,
      options.limit + 1,
    ],
  );
  const hasMore = rows.length > options.limit;
  const visibleRows = rows.slice(0, options.limit);
  const lastVisible = visibleRows.at(-1);
  return {
    results: visibleRows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      goals: Number(row.goals),
      shots: Number(row.shots),
      accuracy: Number(row.accuracy),
    })),
    nextCursor:
      hasMore && lastVisible !== undefined
        ? { finalizedAt: lastVisible.finalized_at.toISOString(), id: lastVisible.id }
        : null,
  };
}

export type TournamentGameContextAction =
  | 'play_daily'
  | 'play_classic'
  | 'round_completed'
  | 'not_started'
  | 'waiting_playoff'
  | 'playoff_active'
  | 'tournament_completed'
  | 'not_participant';

export interface TournamentGameContext {
  action: TournamentGameContextAction;
  tournamentDay: number | null;
  result: { goals: number; shots: number; accuracy: number; completed: boolean } | null;
  message: string | null;
}

interface TournamentGameContextRow {
  status: TournamentStatus;
  regular_source: TournamentConfig['regularSource'];
  participant_id: string | null;
  participant_state: string | null;
}

interface TournamentGameContextMatchday {
  number: number;
  starts_at: Date;
  ends_at: Date;
  goals: number | null;
  shots: number | null;
  accuracy: string | null;
  completed: boolean | null;
}

function gameContextResult(
  row: Pick<TournamentGameContextMatchday, 'goals' | 'shots' | 'accuracy' | 'completed'>,
): TournamentGameContext['result'] {
  if (row.goals === null || row.shots === null || row.accuracy === null || row.completed === null) {
    return null;
  }
  return {
    goals: Number(row.goals),
    shots: Number(row.shots),
    accuracy: Number(Number(row.accuracy).toFixed(5)),
    completed: row.completed === true,
  };
}

function tournamentGameContext(
  action: TournamentGameContextAction,
  tournamentDay: number | null,
  result: TournamentGameContext['result'],
  message: string | null,
): TournamentGameContext {
  return { action, tournamentDay, result, message };
}

/**
 * Resolves a tournament-origin game URL without reading or creating an ordinary daily attempt.
 * Matchday windows are deliberately half-open: starts_at <= now < ends_at.
 */
export async function getTournamentGameContext(
  pool: Pool,
  input: { tournamentId: string; userId: string; now: Date },
): Promise<TournamentGameContext> {
  const tournament = await pool.query<TournamentGameContextRow>(
    `select tournament.status, tournament.regular_source,
            participant.id::text as participant_id, participant.state as participant_state
       from tournament
       left join tournament_participant participant
         on participant.tournament_id = tournament.id and participant.user_id = $2
      where tournament.id = $1
        and (tournament.visibility = 'public' or participant.id is not null)`,
    [input.tournamentId, input.userId],
  );
  const row = tournament.rows[0];
  if (row === undefined) throw new AppError('not_found', 'tournament not found', 404);

  if (row.participant_id === null || row.participant_state !== 'approved') {
    return tournamentGameContext('not_participant', null, null, 'Вы не участвуете в этом турнире.');
  }
  if (row.status === 'playoff') {
    return tournamentGameContext(
      'playoff_active',
      null,
      null,
      'Регулярный сезон завершён. Плей-офф уже начался.',
    );
  }
  if (row.status === 'completed') {
    return tournamentGameContext('tournament_completed', null, null, 'Турнир завершён.');
  }
  if (row.status === 'cancelled') {
    return tournamentGameContext('tournament_completed', null, null, 'Турнир отменён.');
  }
  if (row.status === 'paused') {
    return tournamentGameContext(
      'not_started',
      null,
      null,
      'Турнир поставлен на паузу. О продолжении сообщат организаторы.',
    );
  }
  if (row.status !== 'regular') {
    return tournamentGameContext('not_started', null, null, 'Регулярный сезон ещё не начался.');
  }
  if (row.regular_source === 'head_to_head') {
    return tournamentGameContext(
      'not_started',
      null,
      null,
      'В этом турнире регулярный сезон проходит в дуэлях.',
    );
  }

  const active = await pool.query<TournamentGameContextMatchday>(
    `select matchday.number, matchday.starts_at, matchday.ends_at,
            result.goals, result.shots, result.accuracy, result.completed
       from tournament_matchday matchday
       left join tournament_daily_result result
         on result.tournament_id = matchday.tournament_id
        and result.participant_id = $2
        and result.tournament_day = matchday.number
      where matchday.tournament_id = $1
        and matchday.starts_at <= $3
        and $3 < matchday.ends_at
      order by matchday.number
      limit 1`,
    [input.tournamentId, row.participant_id, input.now],
  );
  const activeMatchday = active.rows[0];
  if (activeMatchday !== undefined) {
    const result = gameContextResult(activeMatchday);
    if (result?.completed === true) {
      return tournamentGameContext(
        'round_completed',
        Number(activeMatchday.number),
        result,
        'Этот тур уже завершён. Ожидаем следующий игровой день.',
      );
    }
    return tournamentGameContext(
      row.regular_source === 'classic' ? 'play_classic' : 'play_daily',
      Number(activeMatchday.number),
      result,
      null,
    );
  }

  const previous = await pool.query<TournamentGameContextMatchday>(
    `select matchday.number, matchday.starts_at, matchday.ends_at,
            result.goals, result.shots, result.accuracy, result.completed
       from tournament_matchday matchday
       left join tournament_daily_result result
         on result.tournament_id = matchday.tournament_id
        and result.participant_id = $2
        and result.tournament_day = matchday.number
      where matchday.tournament_id = $1 and matchday.ends_at <= $3
      order by matchday.number desc
      limit 1`,
    [input.tournamentId, row.participant_id, input.now],
  );
  const last = previous.rows[0];
  const next = await pool.query<{ number: number }>(
    `select number from tournament_matchday
      where tournament_id = $1 and starts_at > $2
      order by number
      limit 1`,
    [input.tournamentId, input.now],
  );
  if (last !== undefined && next.rows[0] !== undefined) {
    return tournamentGameContext(
      'round_completed',
      Number(last.number),
      gameContextResult(last),
      'Игровой день завершён. Следующий тур ещё не начался.',
    );
  }
  if (last !== undefined) {
    return tournamentGameContext(
      'waiting_playoff',
      Number(last.number),
      gameContextResult(last),
      'Регулярный сезон завершён. Ожидаем начала плей-офф.',
    );
  }
  const first = await pool.query<{ number: number }>(
    `select number from tournament_matchday where tournament_id = $1 order by number limit 1`,
    [input.tournamentId],
  );
  return tournamentGameContext(
    'not_started',
    first.rows[0] === undefined ? null : Number(first.rows[0].number),
    null,
    'Регулярный сезон ещё не начался.',
  );
}

async function refreshLegacyClassicStandings(pool: Pool, tournamentId: string): Promise<void> {
  const legacy = await pool.query<{ rules_snapshot: TournamentRulesSnapshot }>(
    `select revision.rules_snapshot
       from tournament tournament
       join tournament_revision revision on revision.id = tournament.published_revision_id
      where tournament.id = $1
        and tournament.regular_source = 'classic'
        and exists (
          select 1
            from tournament_daily_result result
            left join tournament_standing standing
              on standing.tournament_id = result.tournament_id
             and standing.participant_id = result.participant_id
           where result.tournament_id = tournament.id
             and result.completed = true
             and result.source_snapshot->>'source' = 'tournament_classic'
             and (
               standing.participant_id is null
               or not (standing.metrics ? 'totalDurationMs')
             )
        )
      limit 1`,
    [tournamentId],
  );
  const rules = legacy.rows[0]?.rules_snapshot;
  if (rules === undefined || rules.config.regularSource !== 'classic') return;
  const dailyPlacePoints = rules.dailyPlacePoints;
  const client = await pool.connect();
  try {
    await client.query('begin');
    await rebuildDailyAggregateStandings(client, tournamentId, {
      config: {
        regularSource: rules.config.regularSource,
        dailyDays: rules.config.dailyDays,
        dailyMetric: rules.config.dailyMetric,
        bestDays: rules.config.bestDays,
      },
      ...(Array.isArray(dailyPlacePoints) && dailyPlacePoints.every(Number.isFinite)
        ? { dailyPlacePoints: dailyPlacePoints as number[] }
        : {}),
    });
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function getTournamentStandings(pool: Pool, tournamentId: string) {
  await refreshLegacyClassicStandings(pool, tournamentId);
  const { rows } = await pool.query(
    `select s.rank, p.user_id, u.display_name,
            coalesce(
              case
                when u.display_source = 'custom' then u.custom_avatar_url
                when u.display_source = 'vk' then u.vk_avatar_url
                when u.display_source = 'telegram' then u.tg_avatar_url
                else u.avatar_url
              end,
              u.avatar_url
            ) as avatar_url,
            s.played, s.wins, s.draws, s.losses,
            s.goals_for, s.goals_against, s.points, s.metrics
       from tournament_standing s
       join tournament_participant p on p.id = s.participant_id
       join users u on u.id = p.user_id
      where s.tournament_id = $1
      order by s.rank nulls last, u.display_name`,
    [tournamentId],
  );
  if (rows.length > 0) return rows;

  const preview = await pool.query(
    `select row_number() over (order by u.display_name, p.id)::int as rank,
            p.user_id, u.display_name,
            coalesce(
              case
                when u.display_source = 'custom' then u.custom_avatar_url
                when u.display_source = 'vk' then u.vk_avatar_url
                when u.display_source = 'telegram' then u.tg_avatar_url
                else u.avatar_url
              end,
              u.avatar_url
            ) as avatar_url,
            0::int as played, 0::int as wins, 0::int as draws, 0::int as losses,
            0::int as goals_for, 0::int as goals_against, 0::numeric as points,
            '{}'::jsonb as metrics
       from tournament_participant p
       join tournament t on t.id = p.tournament_id
       join users u on u.id = p.user_id
      where p.tournament_id = $1
        and p.state = 'approved'
        and t.status in ('scheduling', 'regular')
      order by u.display_name, p.id`,
    [tournamentId],
  );
  return preview.rows;
}

function resolveSeedSource(source: PlayoffParticipantSource): string | null {
  return source.type === 'seed' ? source.participantId : null;
}

function defaultHomeSequence(winsRequired: number): HomeDesignation[] {
  const bestOf = winsRequired * 2 - 1;
  const standard: HomeDesignation[] = ['H', 'H', 'A', 'A', 'H', 'A', 'H'];
  return Array.from(
    { length: bestOf },
    (_, index) => standard[index] ?? (index % 2 === 0 ? 'H' : 'A'),
  );
}

const ONE_DAY_MS = 86_400_000;
const MAX_PLAYOFF_ROUND_BREAK_MS = 30 * ONE_DAY_MS;

interface PlayoffRoundRules {
  winsRequired: number;
  homeSequence: HomeDesignation[];
  duelTemplateId: string | null;
  gameWindowMs: number;
  gameBreakMs: number;
  roundBreakMs: number;
  firstGameStartsAt: Date | null;
  readinessMinutes: number;
  /** Completion window after both players have confirmed readiness. */
  gameDurationMinutes: number;
  interGameBreakMinutes: number;
  /** Retained for old persisted snapshots only. */
  plannedStartIntervalMinutes: number | null;
  scheduleDays: RoundGameDay[] | null;
  overtime: {
    count: number;
    shootoutInitialShots: number;
  };
}

const DEFAULT_OVERTIME_RULES = { count: 1, shootoutInitialShots: 3 } as const;
const MAX_OVERTIME_SEGMENTS = 20;
const MAX_SHOOTOUT_INITIAL_SHOTS = 100;

function objectRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function overtimeRules(
  value: unknown,
  fallback: { count: number; shootoutInitialShots: number } = DEFAULT_OVERTIME_RULES,
): { count: number; shootoutInitialShots: number } {
  const record = objectRecord(value);
  return {
    count:
      typeof record.count === 'number' &&
      Number.isSafeInteger(record.count) &&
      record.count >= 0 &&
      record.count <= MAX_OVERTIME_SEGMENTS
        ? record.count
        : fallback.count,
    shootoutInitialShots:
      typeof record.shootoutInitialShots === 'number' &&
      Number.isSafeInteger(record.shootoutInitialShots) &&
      record.shootoutInitialShots >= 1 &&
      record.shootoutInitialShots <= MAX_SHOOTOUT_INITIAL_SHOTS
        ? record.shootoutInitialShots
        : fallback.shootoutInitialShots,
  };
}

function validIsoDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const parts =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(
      value,
    );
  if (!parts) return null;
  const [year, month, day, hour, minute, second] = parts.slice(1, 7).map(Number);
  const offsetHour = parts[7] === undefined ? 0 : Number(parts[7]);
  const offsetMinute = parts[8] === undefined ? 0 : Number(parts[8]);
  const daysInMonth = new Date(Date.UTC(year!, month!, 0)).getUTCDate();
  if (
    month! < 1 ||
    month! > 12 ||
    day! < 1 ||
    day! > daysInMonth ||
    hour! > 23 ||
    minute! > 59 ||
    (second !== undefined && second > 59) ||
    offsetHour > 23 ||
    offsetMinute > 59
  ) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function positiveDuration(value: unknown, fallback: number, maxMs = ONE_DAY_MS): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= maxMs
    ? value
    : fallback;
}

function nonNegativeDuration(value: unknown, fallback: number, maxMs = ONE_DAY_MS): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= maxMs
    ? value
    : fallback;
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max
    ? value
    : fallback;
}

function maxDate(...dates: Date[]): Date {
  return new Date(Math.max(...dates.map((date) => date.getTime())));
}

export function playoffRoundRules(
  rules: TournamentRulesSnapshot,
  roundNumber: number,
): PlayoffRoundRules {
  const configured = Array.isArray(rules.playoffRounds)
    ? rules.playoffRounds.find(
        (value) =>
          typeof value === 'object' &&
          value !== null &&
          (value as Record<string, unknown>).roundNumber === roundNumber,
      )
    : undefined;
  const record =
    typeof configured === 'object' && configured !== null
      ? (configured as Record<string, unknown>)
      : {};
  const winsRequired =
    typeof record.winsRequired === 'number' && Number.isInteger(record.winsRequired)
      ? Math.max(1, record.winsRequired)
      : 4;
  const homeSequence =
    Array.isArray(record.homeSequence) &&
    record.homeSequence.length === winsRequired * 2 - 1 &&
    record.homeSequence.every((item) => item === 'H' || item === 'A')
      ? (record.homeSequence as HomeDesignation[])
      : defaultHomeSequence(winsRequired);
  const duelTemplateId =
    typeof record.duelTemplateId === 'string'
      ? record.duelTemplateId
      : typeof rules.regularDuelTemplateId === 'string'
        ? rules.regularDuelTemplateId
        : null;
  const defaultOvertime = overtimeRules(rules.overtime);
  const scheduleDays = Array.isArray(record.scheduleDays)
    ? record.scheduleDays.map((value) => {
        const day = objectRecord(value);
        return {
          localDate: typeof day.localDate === 'string' ? day.localDate : '',
          firstWaveLocalTime:
            typeof day.firstWaveLocalTime === 'string' ? day.firstWaveLocalTime : '',
          maxResultGames:
            typeof day.maxResultGames === 'number' && Number.isSafeInteger(day.maxResultGames)
              ? day.maxResultGames
              : 0,
        };
      })
    : null;
  return {
    winsRequired,
    homeSequence,
    duelTemplateId,
    gameWindowMs: positiveDuration(record.gameWindowMs, ONE_DAY_MS),
    gameBreakMs: nonNegativeDuration(record.gameBreakMs, 0),
    roundBreakMs: nonNegativeDuration(record.roundBreakMs, 0, MAX_PLAYOFF_ROUND_BREAK_MS),
    firstGameStartsAt: validIsoDate(record.firstGameStartsAt),
    readinessMinutes: boundedInteger(
      record.readinessMinutes,
      DEFAULT_TOURNAMENT_READINESS_MINUTES,
      1,
      120,
    ),
    gameDurationMinutes: boundedInteger(
      record.gameDurationMinutes,
      DEFAULT_TOURNAMENT_GAME_DURATION_MINUTES,
      5,
      60,
    ),
    interGameBreakMinutes: boundedInteger(
      record.interGameBreakMinutes,
      DEFAULT_TOURNAMENT_INTER_GAME_BREAK_MINUTES,
      1,
      30,
    ),
    plannedStartIntervalMinutes:
      record.plannedStartIntervalMinutes === undefined
        ? null
        : boundedInteger(record.plannedStartIntervalMinutes, 30, 1, 1440),
    scheduleDays,
    overtime: overtimeRules(record.overtime, defaultOvertime),
  };
}

function tieBreakRules(rules: TournamentRulesSnapshot): PlayoffRoundRules {
  const config = rules.config;
  const configured =
    typeof rules.tieBreak === 'object' && rules.tieBreak !== null && !Array.isArray(rules.tieBreak)
      ? (rules.tieBreak as Record<string, unknown>)
      : typeof rules.tiebreak === 'object' &&
          rules.tiebreak !== null &&
          !Array.isArray(rules.tiebreak)
        ? (rules.tiebreak as Record<string, unknown>)
        : {};
  const firstDefined = (...values: unknown[]): unknown =>
    values.find((value) => value !== undefined);
  const duelTemplateId = firstDefined(
    configured.duelTemplateId,
    rules.tieBreakDuelTemplateId,
    rules.tiebreakDuelTemplateId,
    rules.regularDuelTemplateId,
  );
  const regularWindow =
    config.regularSource === 'head_to_head' ? config.fixtureWindowMs : ONE_DAY_MS;
  const regularBreak = config.regularSource === 'head_to_head' ? config.roundBreakMs : 0;
  const defaultOvertime = overtimeRules(rules.overtime);
  return {
    winsRequired: 1,
    homeSequence: ['H'],
    duelTemplateId: typeof duelTemplateId === 'string' ? duelTemplateId : null,
    gameWindowMs: positiveDuration(
      firstDefined(configured.gameWindowMs, rules.tieBreakGameWindowMs, rules.tiebreakGameWindowMs),
      regularWindow,
    ),
    gameBreakMs: nonNegativeDuration(
      firstDefined(configured.gameBreakMs, rules.tieBreakGameBreakMs, rules.tiebreakGameBreakMs),
      regularBreak,
    ),
    roundBreakMs: nonNegativeDuration(
      firstDefined(configured.roundBreakMs, rules.tieBreakRoundBreakMs, rules.tiebreakRoundBreakMs),
      0,
      MAX_PLAYOFF_ROUND_BREAK_MS,
    ),
    firstGameStartsAt: validIsoDate(
      firstDefined(
        configured.firstGameStartsAt,
        rules.tieBreakFirstGameStartsAt,
        rules.tiebreakFirstGameStartsAt,
      ),
    ),
    readinessMinutes: DEFAULT_TOURNAMENT_READINESS_MINUTES,
    gameDurationMinutes: DEFAULT_TOURNAMENT_GAME_DURATION_MINUTES,
    interGameBreakMinutes: DEFAULT_TOURNAMENT_INTER_GAME_BREAK_MINUTES,
    plannedStartIntervalMinutes: null,
    scheduleDays: null,
    overtime: overtimeRules(configured.overtime, defaultOvertime),
  };
}

async function playoffBaseTime(
  client: PoolClient,
  tournamentId: string,
  now: Date,
  tournamentStartsAt: Date | null,
): Promise<Date> {
  const existing = await client.query<{ latest_end: Date | null }>(
    `select max(f.window_ends_at) as latest_end
       from tournament_fixture f
       join tournament_round r on r.id = f.round_id
      where f.tournament_id = $1
        and r.stage in ('regular', 'tiebreak')
        and f.window_ends_at is not null`,
    [tournamentId],
  );
  const tieBreak = await client.query<{
    ends_at: Date | null;
    latest_fixture_end: Date | null;
    rules_snapshot: Record<string, unknown>;
  }>(
    `select r.ends_at, r.rules_snapshot, max(f.window_ends_at) as latest_fixture_end
       from tournament_round r
       left join tournament_fixture f on f.round_id = r.id and f.window_ends_at is not null
      where r.tournament_id = $1 and r.stage = 'tiebreak'
      group by r.id
      order by r.ends_at desc nulls last limit 1`,
    [tournamentId],
  );
  const candidates = [now];
  if (tournamentStartsAt !== null) candidates.push(tournamentStartsAt);
  if (existing.rows[0]?.latest_end !== null && existing.rows[0]?.latest_end !== undefined) {
    candidates.push(existing.rows[0].latest_end);
  }
  const completedTieBreak = tieBreak.rows[0];
  const actualTieBreakEnd =
    completedTieBreak?.latest_fixture_end ?? completedTieBreak?.ends_at ?? null;
  if (completedTieBreak && actualTieBreakEnd !== null) {
    const roundBreakMs = nonNegativeDuration(
      completedTieBreak.rules_snapshot.roundBreakMs,
      0,
      MAX_PLAYOFF_ROUND_BREAK_MS,
    );
    candidates.push(new Date(actualTieBreakEnd.getTime() + roundBreakMs));
  }
  return maxDate(...candidates);
}

async function dailyBoundaryTieParticipantIds(
  client: PoolClient,
  tournamentId: string,
  playoffSize: number,
): Promise<string[]> {
  const tied = await client.query<{ participant_id: string }>(
    `with boundary as (
       select tie_key from tournament_standing
        where tournament_id = $1 and rank = $2
     ), crossing as (
       select 1 from tournament_standing standing
       join boundary on boundary.tie_key = standing.tie_key
        where standing.tournament_id = $1 and standing.rank = $2 + 1
     )
     select standing.participant_id
       from tournament_standing standing
       join boundary on boundary.tie_key = standing.tie_key
      where standing.tournament_id = $1 and exists (select 1 from crossing)
      order by standing.rank, standing.participant_id`,
    [tournamentId, playoffSize],
  );
  return tied.rows.map((row) => row.participant_id);
}

async function applySettledDailyTieBreakOrder(
  client: PoolClient,
  tournamentId: string,
  participantIds: string[],
  playoffSize: number,
): Promise<{
  resolved: boolean;
  participantIds: string[];
  createRoundNumber: number | null;
}> {
  const latestRound = await client.query<{
    id: string;
    number: number;
    rules_snapshot: Record<string, unknown>;
  }>(
    `select id, number, rules_snapshot from tournament_round
      where tournament_id = $1 and stage = 'tiebreak'
      order by number desc limit 1`,
    [tournamentId],
  );
  const latest = latestRound.rows[0];
  if (!latest) {
    return { resolved: false, participantIds, createRoundNumber: 1 };
  }
  const storedParticipantIds = latest.rules_snapshot.participantIds;
  const roundParticipantIds =
    Array.isArray(storedParticipantIds) &&
    storedParticipantIds.every(
      (participantId): participantId is string => typeof participantId === 'string',
    )
      ? storedParticipantIds
      : latest.number === 1
        ? participantIds
        : [];
  const boundaryParticipantSet = new Set(participantIds);
  if (
    roundParticipantIds.length < 2 ||
    new Set(roundParticipantIds).size !== roundParticipantIds.length ||
    roundParticipantIds.some((participantId) => !boundaryParticipantSet.has(participantId))
  ) {
    throw new AppError('conflict', 'tie-break participant subset is invalid', 409);
  }
  const fixtures = await client.query<{
    home_participant_id: string | null;
    away_participant_id: string | null;
    winner_participant_id: string | null;
    home_score: number;
    away_score: number;
    status: string;
  }>(
    `select fixture.home_participant_id, fixture.away_participant_id,
            fixture.winner_participant_id, fixture.home_score, fixture.away_score,
            fixture.status
       from tournament_fixture fixture
      where fixture.tournament_id = $1 and fixture.round_id = $2
      order by fixture.fixture_number`,
    [tournamentId, latest.id],
  );
  const participantPairKey = (left: string, right: string) =>
    left < right ? `${left}:${right}` : `${right}:${left}`;
  const expectedPairs = new Set<string>();
  for (let left = 0; left < roundParticipantIds.length; left += 1) {
    for (let right = left + 1; right < roundParticipantIds.length; right += 1) {
      expectedPairs.add(
        participantPairKey(roundParticipantIds[left]!, roundParticipantIds[right]!),
      );
    }
  }
  const actualPairs = new Set<string>();
  for (const fixture of fixtures.rows) {
    if (
      fixture.home_participant_id === null ||
      fixture.away_participant_id === null ||
      !roundParticipantIds.includes(fixture.home_participant_id) ||
      !roundParticipantIds.includes(fixture.away_participant_id)
    ) {
      throw new AppError('conflict', 'tie-break fixture participants are invalid', 409);
    }
    const pair = participantPairKey(fixture.home_participant_id, fixture.away_participant_id);
    if (actualPairs.has(pair) || !expectedPairs.has(pair)) {
      throw new AppError('conflict', 'tie-break fixture pairs are invalid', 409);
    }
    actualPairs.add(pair);
  }
  if (actualPairs.size !== expectedPairs.size) {
    throw new AppError('conflict', 'tie-break fixture pairs are incomplete', 409);
  }
  if (fixtures.rows.some((fixture) => !['settled', 'forfeit'].includes(fixture.status))) {
    return { resolved: false, participantIds: roundParticipantIds, createRoundNumber: null };
  }
  for (const fixture of fixtures.rows) {
    if (
      fixture.winner_participant_id === null ||
      (fixture.winner_participant_id !== fixture.home_participant_id &&
        fixture.winner_participant_id !== fixture.away_participant_id)
    ) {
      throw new AppError('conflict', 'tie-break fixture winner is invalid', 409);
    }
  }
  const standings = await client.query<{ participant_id: string; rank: number }>(
    `select participant_id, rank from tournament_standing
      where tournament_id = $1 and participant_id = any($2::uuid[])
      order by rank`,
    [tournamentId, roundParticipantIds],
  );
  if (standings.rows.length !== roundParticipantIds.length) {
    throw new AppError('conflict', 'tie-break standings are incomplete', 409);
  }
  const stats = new Map(
    roundParticipantIds.map((participantId) => [
      participantId,
      { participantId, wins: 0, goalsFor: 0, goalsAgainst: 0 },
    ]),
  );
  for (const fixture of fixtures.rows) {
    const home = stats.get(fixture.home_participant_id!);
    const away = stats.get(fixture.away_participant_id!);
    if (!home || !away) {
      throw new AppError('conflict', 'tie-break fixture participants are invalid', 409);
    }
    home.goalsFor += Number(fixture.home_score);
    home.goalsAgainst += Number(fixture.away_score);
    away.goalsFor += Number(fixture.away_score);
    away.goalsAgainst += Number(fixture.home_score);
    stats.get(fixture.winner_participant_id!)!.wins += 1;
  }
  const compareCompetitively = (
    left: { wins: number; goalsFor: number; goalsAgainst: number },
    right: { wins: number; goalsFor: number; goalsAgainst: number },
  ) =>
    right.wins - left.wins ||
    right.goalsFor - right.goalsAgainst - (left.goalsFor - left.goalsAgainst) ||
    right.goalsFor - left.goalsFor;
  const rankByParticipant = new Map(
    standings.rows.map((standing) => [standing.participant_id, Number(standing.rank)]),
  );
  const ordered = [...stats.values()].sort(
    (left, right) =>
      compareCompetitively(left, right) ||
      rankByParticipant.get(left.participantId)! - rankByParticipant.get(right.participantId)!,
  );
  for (const [index, standing] of standings.rows.entries()) {
    await client.query(
      `update tournament_standing set rank = $3, recalculated_at = now()
        where tournament_id = $1 and participant_id = $2`,
      [tournamentId, ordered[index]!.participantId, standing.rank],
    );
  }
  const playoffSlots = standings.rows.filter(
    (standing) => Number(standing.rank) <= playoffSize,
  ).length;
  let cursor = 0;
  while (cursor < ordered.length) {
    let end = cursor + 1;
    while (end < ordered.length && compareCompetitively(ordered[cursor]!, ordered[end]!) === 0) {
      end += 1;
    }
    if (cursor < playoffSlots && end > playoffSlots) {
      return {
        resolved: false,
        participantIds: ordered.slice(cursor, end).map((row) => row.participantId),
        createRoundNumber: Number(latest.number) + 1,
      };
    }
    cursor = end;
  }
  return { resolved: true, participantIds: [], createRoundNumber: null };
}

async function materializeTieBreakRound(
  client: PoolClient,
  input: {
    tournamentId: string;
    roundNumber: number;
    participantIds: string[];
    baseTime: Date;
    rules: PlayoffRoundRules;
  },
): Promise<void> {
  const existing = await client.query<{ id: string }>(
    `select id from tournament_round
      where tournament_id = $1 and stage = 'tiebreak' and number = $2`,
    [input.tournamentId, input.roundNumber],
  );
  if (existing.rows[0]) return;
  const firstStart = maxDate(input.baseTime, input.rules.firstGameStartsAt ?? input.baseTime);
  const gameCount = (input.participantIds.length * (input.participantIds.length - 1)) / 2;
  const windows = buildPlayoffFixtureWindows({
    gameCount,
    firstStart,
    gameWindowMs: input.rules.gameWindowMs,
    gameBreakMs: input.rules.gameBreakMs,
  });
  const round = await client.query<{ id: string }>(
    `insert into tournament_round
       (tournament_id, stage, number, name, starts_at, ends_at, status, rules_snapshot)
     values ($1, 'tiebreak', $2, 'Тай-брейк за выход в плей-офф', $3, $4, 'scheduled', $5)
     returning id`,
    [
      input.tournamentId,
      input.roundNumber,
      firstStart,
      new Date(windows[windows.length - 1]!.endsAt),
      JSON.stringify({
        reason: 'playoff_boundary_tie',
        participantIds: input.participantIds,
        duelTemplateId: input.rules.duelTemplateId,
        gameWindowMs: input.rules.gameWindowMs,
        gameBreakMs: input.rules.gameBreakMs,
        roundBreakMs: input.rules.roundBreakMs,
        firstGameStartsAt: firstStart.toISOString(),
      }),
    ],
  );
  const latestFixtureNumber = await client.query<{ fixture_number: number }>(
    `select coalesce(max(fixture.fixture_number), 100000)::int as fixture_number
       from tournament_fixture fixture
       join tournament_round round on round.id = fixture.round_id and round.stage = 'tiebreak'
      where fixture.tournament_id = $1`,
    [input.tournamentId],
  );
  const fixtureNumberBase = Number(latestFixtureNumber.rows[0]!.fixture_number);
  let number = 1;
  for (let left = 0; left < input.participantIds.length; left += 1) {
    for (let right = left + 1; right < input.participantIds.length; right += 1) {
      const window = windows[number - 1]!;
      await client.query(
        `insert into tournament_fixture
           (tournament_id, round_id, fixture_number, home_participant_id,
            away_participant_id, scheduled_starts_at, window_ends_at, status, result_snapshot, venue_mode)
         values ($1, $2, $3, $4, $5, $6, $7, 'scheduled', $8, 'neutral_default')`,
        [
          input.tournamentId,
          round.rows[0]!.id,
          fixtureNumberBase + number,
          input.participantIds[left],
          input.participantIds[right],
          window.startsAt,
          window.endsAt,
          JSON.stringify({ gameNumber: number, duelTemplateId: input.rules.duelTemplateId }),
        ],
      );
      number += 1;
    }
  }
}

export async function startTournamentPlayoffs(pool: Pool, tournamentId: string, now = new Date()) {
  return inTransaction(pool, async (client) => {
    await lockTournament(client, tournamentId);
    const tournamentResult = await client.query<{
      status: TournamentStatus;
      title: string;
      rules_snapshot: TournamentRulesSnapshot;
      starts_at: Date | null;
    }>(
      `select t.status, t.title, t.starts_at, r.rules_snapshot from tournament t
         join tournament_revision r on r.id = t.published_revision_id
        where t.id = $1 for update of t`,
      [tournamentId],
    );
    const tournament = tournamentResult.rows[0];
    if (!tournament) {
      throw new AppError('conflict', 'regular season is not active', 409);
    }
    const existingSeries = await client.query<{ count: number }>(
      `select count(*)::int as count from tournament_playoff_series where tournament_id = $1`,
      [tournamentId],
    );
    if (Number(existingSeries.rows[0]?.count ?? 0) > 0) {
      return {
        tournamentId,
        status:
          tournament.status === 'playoff' ? ('playoff' as const) : ('tiebreak_required' as const),
        seriesCount: Number(existingSeries.rows[0]!.count),
        created: false,
      };
    }
    if (tournament.status !== 'regular') {
      throw new AppError('conflict', 'regular season is not active', 409);
    }
    if (tournament.rules_snapshot.config.regularSource !== 'head_to_head') {
      const coverage = await client.query<{
        participant_count: number;
        result_count: number;
      }>(
        `select count(distinct participant.id)::int as participant_count,
                count(result.id)::int as result_count
           from tournament_participant participant
           left join tournament_daily_result result
             on result.tournament_id = participant.tournament_id
            and result.participant_id = participant.id
            and result.tournament_day between 1 and $2
          where participant.tournament_id = $1
            and participant.state in ('approved', 'withdrawn', 'removed', 'disqualified')`,
        [tournamentId, tournament.rules_snapshot.config.dailyDays],
      );
      const counts = coverage.rows[0];
      if (
        counts === undefined ||
        Number(counts.result_count) !==
          Number(counts.participant_count) * tournament.rules_snapshot.config.dailyDays
      ) {
        throw new AppError('conflict', 'daily results are not fully finalized', 409);
      }
    } else {
      const coverage = await client.query<{ fixture_count: number; terminal_count: number }>(
        `select count(fixture.id)::int as fixture_count,
                count(fixture.id) filter (
                  where fixture.status in ('settled', 'forfeit', 'cancelled')
                )::int as terminal_count
           from tournament_round round
           left join tournament_fixture fixture on fixture.round_id = round.id
          where round.tournament_id = $1 and round.stage = 'regular'`,
        [tournamentId],
      );
      const counts = coverage.rows[0];
      if (
        counts === undefined ||
        Number(counts.fixture_count) === 0 ||
        Number(counts.terminal_count) !== Number(counts.fixture_count)
      ) {
        throw new AppError('conflict', 'regular fixtures are not fully settled', 409);
      }
    }
    const rebuilt =
      tournament.rules_snapshot.config.regularSource === 'head_to_head'
        ? await rebuildHeadToHeadStandings(client, tournamentId)
        : {
            boundaryTieParticipantIds: await dailyBoundaryTieParticipantIds(
              client,
              tournamentId,
              tournament.rules_snapshot.config.playoffSize,
            ),
          };
    let tieBreakRoundToCreate: number | null = null;
    if (rebuilt.boundaryTieParticipantIds.length > 0) {
      const tieBreak = await applySettledDailyTieBreakOrder(
        client,
        tournamentId,
        rebuilt.boundaryTieParticipantIds,
        tournament.rules_snapshot.config.playoffSize,
      );
      rebuilt.boundaryTieParticipantIds = tieBreak.participantIds;
      tieBreakRoundToCreate = tieBreak.createRoundNumber;
    }
    const baseTime = await playoffBaseTime(client, tournamentId, now, tournament.starts_at);
    if (rebuilt.boundaryTieParticipantIds.length > 0) {
      const roundToCreate = tieBreakRoundToCreate;
      const created = roundToCreate !== null;
      if (roundToCreate !== null) {
        const rules = tieBreakRules(tournament.rules_snapshot);
        if (rules.duelTemplateId === null) {
          throw new AppError(
            'configuration_error',
            'tie-break duel template is not configured',
            409,
          );
        }
        await materializeTieBreakRound(client, {
          tournamentId,
          roundNumber: roundToCreate,
          participantIds: rebuilt.boundaryTieParticipantIds,
          baseTime,
          rules,
        });
      }
      return {
        tournamentId,
        status: 'tiebreak_required' as const,
        participantIds: rebuilt.boundaryTieParticipantIds,
        created,
      };
    }
    const size = tournament.rules_snapshot.config.playoffSize;
    const standings = await client.query<{ participant_id: string }>(
      `select participant_id from tournament_standing
        where tournament_id = $1 and rank <= $2 order by rank`,
      [tournamentId, size],
    );
    if (standings.rows.length !== size) {
      throw new AppError('conflict', 'playoff participants are not resolved', 409);
    }
    const plan = buildPlayoffSeriesPlan(standings.rows.map((row) => row.participant_id));
    const schedules = new Map<
      number,
      {
        rules: PlayoffRoundRules;
        startsAt: Date;
        endsAt: Date;
        windows: ReturnType<typeof buildPlayoffFixtureWindows> | null;
        days: ResolvedRoundGameDay[] | null;
        template: DuelTemplateLifecycleSnapshot | null;
      }
    >();
    let previousRoundEnd = baseTime;
    let previousRoundBreakMs = 0;
    const roundNumbers = [
      ...new Set(
        plan.filter((item) => item.kind === 'championship').map((item) => item.roundNumber),
      ),
    ].sort((left, right) => left - right);
    for (const roundNumber of roundNumbers) {
      const rules = playoffRoundRules(tournament.rules_snapshot, roundNumber);
      if (rules.duelTemplateId === null) {
        throw new AppError('configuration_error', 'playoff duel template is not configured', 409);
      }
      if (rules.scheduleDays !== null) {
        const earliestRoundStart = maxDate(
          baseTime,
          new Date(previousRoundEnd.getTime() + previousRoundBreakMs),
        );
        const rebasedDays = rebaseRoundGameDaysAtOrAfter(
          tournament.rules_snapshot.config.timezone,
          rules.scheduleDays,
          earliestRoundStart,
        );
        const days = resolveRoundGameDays(tournament.rules_snapshot.config.timezone, rebasedDays);
        const template = await loadDuelTemplateLifecycleSnapshot(client, rules.duelTemplateId);
        const endsAt = new Date(
          Math.max(
            ...days.map((day) =>
              attemptDeadline(
                new Date(
                  day.firstGameStartsAt.getTime() +
                    (day.maxResultGames - 1) *
                      (rules.gameDurationMinutes + rules.interGameBreakMinutes) *
                      60_000,
                ),
                rules.readinessMinutes,
                template,
                rules.gameDurationMinutes,
              ).getTime(),
            ),
          ),
        );
        schedules.set(roundNumber, {
          rules,
          startsAt: days[0]!.firstGameStartsAt,
          endsAt,
          windows: null,
          days,
          template,
        });
        previousRoundEnd = endsAt;
        previousRoundBreakMs = rules.roundBreakMs;
        continue;
      }
      const firstStart = maxDate(
        new Date(previousRoundEnd.getTime() + previousRoundBreakMs),
        rules.firstGameStartsAt ?? previousRoundEnd,
      );
      const windows = buildPlayoffFixtureWindows({
        gameCount: rules.winsRequired * 2 - 1,
        firstStart,
        gameWindowMs: rules.gameWindowMs,
        gameBreakMs: rules.gameBreakMs,
      });
      const endsAt = new Date(windows[windows.length - 1]!.endsAt);
      schedules.set(roundNumber, {
        rules,
        startsAt: firstStart,
        endsAt,
        windows,
        days: null,
        template: null,
      });
      previousRoundEnd = endsAt;
      previousRoundBreakMs = rules.roundBreakMs;
    }
    const roundIds = new Map<string, string>();
    const roundGameDays = new Map<string, ResolvedRoundGameDay[]>();
    for (const item of plan) {
      const stage = item.kind === 'third_place' ? 'third_place' : 'playoff';
      const key = `${stage}:${item.roundNumber}`;
      if (roundIds.has(key)) continue;
      const schedule = schedules.get(item.roundNumber)!;
      const round = await client.query<{ id: string }>(
        `insert into tournament_round
           (tournament_id, stage, number, name, starts_at, ends_at, status, rules_snapshot)
         values ($1, $2, $3, $4, $5, $6, 'scheduled', $7) returning id`,
        [
          tournamentId,
          stage,
          item.roundNumber,
          stage === 'third_place' ? 'Серия за третье место' : `Раунд плей-офф ${item.roundNumber}`,
          schedule.startsAt,
          schedule.endsAt,
          JSON.stringify({
            ...schedule.rules,
            firstGameStartsAt: schedule.rules.firstGameStartsAt?.toISOString() ?? null,
          }),
        ],
      );
      roundIds.set(key, round.rows[0]!.id);
      if (schedule.days !== null) {
        roundGameDays.set(
          key,
          await insertRoundGameDays(client, {
            roundId: round.rows[0]!.id,
            days: schedule.days,
            readinessMinutes: schedule.rules.readinessMinutes,
            interGameBreakMinutes: schedule.rules.interGameBreakMinutes,
          }),
        );
      }
    }
    const seriesIds = new Map<string, string>();
    const fixtureNumberResult = await client.query<{ next: number }>(
      `select coalesce(max(fixture_number), 0)::int + 1 as next
         from tournament_fixture where tournament_id = $1`,
      [tournamentId],
    );
    let fixtureNumber = Number(fixtureNumberResult.rows[0]?.next ?? 1);
    for (const item of plan) {
      const scheduleWindows = schedules.get(item.roundNumber)!;
      const rules = scheduleWindows.rules;
      if (rules.duelTemplateId === null) {
        throw new AppError('configuration_error', 'playoff duel template is not configured', 409);
      }
      const stage = item.kind === 'third_place' ? 'third_place' : 'playoff';
      const higherParticipantId = resolveSeedSource(item.higherSource);
      const lowerParticipantId = resolveSeedSource(item.lowerSource);
      const series = await client.query<{ id: string }>(
        `insert into tournament_playoff_series
           (tournament_id, round_id, bracket_position, kind,
            higher_seed_participant_id, lower_seed_participant_id, wins_required,
            home_sequence, status, depends_on)
         values ($1, $2, $3, $4, $5, $6, $7, $8,
                 case when $5::uuid is null then 'pending' else 'scheduled' end, $9)
         returning id`,
        [
          tournamentId,
          roundIds.get(`${stage}:${item.roundNumber}`),
          item.position,
          item.kind,
          higherParticipantId,
          lowerParticipantId,
          rules.winsRequired,
          JSON.stringify(rules.homeSequence),
          JSON.stringify({ key: item.key, sources: [item.higherSource, item.lowerSource] }),
        ],
      );
      seriesIds.set(item.key, series.rows[0]!.id);
      const schedule = expandSeriesSchedule(rules.winsRequired, rules.homeSequence);
      for (const game of schedule) {
        const higherIsHome = game.higherSeedIsHome;
        const modernSlot =
          scheduleWindows.days === null || game.gameNumber !== 1
            ? null
            : {
                day: roundGameDays.get(`${stage}:${item.roundNumber}`)![0]!,
                startsAt: scheduleWindows.days[0]!.firstGameStartsAt,
              };
        const legacyWindow =
          scheduleWindows.windows === null ? null : scheduleWindows.windows[game.gameNumber - 1]!;
        const scheduledStartsAt =
          modernSlot?.startsAt ?? (legacyWindow === null ? null : legacyWindow.startsAt);
        const windowEndsAt =
          modernSlot !== null
            ? attemptDeadline(
                modernSlot.startsAt,
                rules.readinessMinutes,
                scheduleWindows.template!,
                rules.gameDurationMinutes ?? undefined,
              )
            : (legacyWindow?.endsAt ?? null);
        const insertedFixture = await client.query<{ id: string }>(
          `insert into tournament_fixture
             (tournament_id, round_id, series_id, fixture_number,
              home_participant_id, away_participant_id, scheduled_starts_at,
              window_ends_at, status, result_snapshot, venue_mode)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'home_selected')
           returning id`,
          [
            tournamentId,
            roundIds.get(`${stage}:${item.roundNumber}`),
            series.rows[0]!.id,
            fixtureNumber,
            higherIsHome ? higherParticipantId : lowerParticipantId,
            higherIsHome ? lowerParticipantId : higherParticipantId,
            scheduledStartsAt,
            windowEndsAt,
            higherParticipantId === null || lowerParticipantId === null || game.conditional
              ? 'conditional'
              : 'scheduled',
            JSON.stringify({
              gameNumber: game.gameNumber,
              higherSeedIsHome: game.higherSeedIsHome,
              duelTemplateId: rules.duelTemplateId,
            }),
          ],
        );
        if (modernSlot !== null) {
          await insertInitialFixtureAttempt(client, {
            fixtureId: insertedFixture.rows[0]!.id,
            roundGameDayId: modernSlot.day.id!,
            scheduledStartsAt: modernSlot.startsAt,
            readinessMinutes: rules.readinessMinutes,
            gameDurationMinutes: rules.gameDurationMinutes,
            template: scheduleWindows.template!,
          });
        }
        fixtureNumber += 1;
      }
    }
    await grantTournamentStageRewardsWithClient(client, tournamentId, 'regular');
    await client.query(
      `update tournament set status = 'playoff', updated_at = now() where id = $1`,
      [tournamentId],
    );
    await enqueueTournamentAudiencePush(client, {
      tournamentId,
      eventType: 'tournament.playoff_started',
      eventKey: `${tournamentId}:playoff-started`,
      variables: { tournamentTitle: tournament.title },
      fallback: {
        title: 'Начинается плей-офф',
        body: `Сетка турнира ${tournament.title} опубликована.`,
        url: '/?view=amateur&section=tournaments',
      },
    });
    return { tournamentId, status: 'playoff' as const, seriesCount: seriesIds.size, created: true };
  });
}

export async function getTournamentBracket(pool: Pool, tournamentId: string) {
  const { rows } = await pool.query(
    `select s.id, s.bracket_position, s.kind, s.wins_required, s.higher_seed_wins,
            s.lower_seed_wins, s.status, s.home_sequence, s.depends_on,
            r.number as round_number, r.name as round_name,
            hp.user_id as higher_user_id, hs.rank as higher_seed,
            hu.display_name as higher_name,
            coalesce(
              case
                when hu.display_source = 'custom' then hu.custom_avatar_url
                when hu.display_source = 'vk' then hu.vk_avatar_url
                when hu.display_source = 'telegram' then hu.tg_avatar_url
                else hu.avatar_url
              end,
              hu.avatar_url
            ) as higher_avatar_url,
            lp.user_id as lower_user_id, ls.rank as lower_seed,
            lu.display_name as lower_name,
            coalesce(
              case
                when lu.display_source = 'custom' then lu.custom_avatar_url
                when lu.display_source = 'vk' then lu.vk_avatar_url
                when lu.display_source = 'telegram' then lu.tg_avatar_url
                else lu.avatar_url
              end,
              lu.avatar_url
            ) as lower_avatar_url,
            wp.user_id as winner_user_id, fixture_schedule.fixtures
       from tournament_playoff_series s
       join tournament_round r on r.id = s.round_id
       left join tournament_participant hp on hp.id = s.higher_seed_participant_id
       left join tournament_standing hs
         on hs.tournament_id = s.tournament_id and hs.participant_id = hp.id
       left join users hu on hu.id = hp.user_id
       left join tournament_participant lp on lp.id = s.lower_seed_participant_id
       left join tournament_standing ls
         on ls.tournament_id = s.tournament_id and ls.participant_id = lp.id
       left join users lu on lu.id = lp.user_id
       left join tournament_participant wp on wp.id = s.winner_participant_id
       left join lateral (
         select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'id', fixture.id,
               'gameNumber', coalesce((fixture.result_snapshot->>'gameNumber')::int, 1),
               'gameDay', case
                 when coalesce(game_day.id, planned_game_day.id) is null then null
                 else jsonb_build_object(
                   'id', coalesce(game_day.id, planned_game_day.id),
                   'dayNumber', coalesce(game_day.day_number, planned_game_day.day_number),
                   'localDate', coalesce(game_day.local_date, planned_game_day.local_date),
                   'startsAt', coalesce(
                     (to_jsonb(game_day)->>'rescheduled_starts_at')::timestamptz,
                     game_day.first_game_starts_at,
                     planned_game_day.starts_at
                   )
                 )
               end,
               'scheduledStartsAt', fixture.scheduled_starts_at,
               'windowEndsAt', fixture.window_ends_at,
               'status', fixture.status,
               'homeUserId', fixture_home.user_id,
               'awayUserId', fixture_away.user_id,
               'homeName', fixture_home_user.display_name,
               'awayName', fixture_away_user.display_name,
               'homeScore', fixture.home_score,
               'awayScore', fixture.away_score,
               'technicalResult', coalesce((fixture.result_snapshot->>'technical')::boolean, false),
               'winnerSide', case
                 when fixture.winner_participant_id = fixture.home_participant_id then 'home'
                 when fixture.winner_participant_id = fixture.away_participant_id then 'away'
                 else null
               end
             ) order by fixture.fixture_number
           ),
           '[]'::jsonb
         ) as fixtures
           from tournament_fixture fixture
           left join tournament_participant fixture_home
             on fixture_home.id = fixture.home_participant_id
           left join users fixture_home_user on fixture_home_user.id = fixture_home.user_id
           left join tournament_participant fixture_away
             on fixture_away.id = fixture.away_participant_id
           left join users fixture_away_user on fixture_away_user.id = fixture_away.user_id
           left join lateral (
             select attempt.round_game_day_id
               from tournament_fixture_attempt attempt
              where attempt.fixture_id = fixture.id
              order by attempt.attempt_number desc
              limit 1
           ) latest_attempt on true
           left join tournament_round_game_day game_day
             on game_day.id = latest_attempt.round_game_day_id
           left join lateral (
             select day.id, day.day_number, day.local_date,
                    coalesce(
                      (to_jsonb(day)->>'rescheduled_starts_at')::timestamptz,
                      day.first_game_starts_at
                    ) as starts_at
               from (
                 select candidate.*,
                        sum(candidate.max_result_bearing_games) over (
                          order by candidate.day_number
                        ) as cumulative_game_capacity
                   from tournament_round_game_day candidate
                  where candidate.round_id = fixture.round_id
                    and candidate.status <> 'cancelled'
               ) day
              where latest_attempt.round_game_day_id is null
                and day.cumulative_game_capacity >=
                    coalesce((fixture.result_snapshot->>'gameNumber')::int, 1)
              order by day.day_number
              limit 1
           ) planned_game_day on true
          where fixture.series_id = s.id
       ) fixture_schedule on true
      where s.tournament_id = $1
      order by r.number, s.kind, s.bracket_position`,
    [tournamentId],
  );
  return rows;
}

export async function duplicateTournamentDraft(
  pool: Pool,
  input: { tournamentId: string; slug?: string; title: string; createdBy: string },
) {
  const source = await getTournament(pool, input.tournamentId);
  const rules = normalizePublishedTournamentLifecycleRules(source.rules, {
    markNewAutomaticLifecycle: true,
  }) as TournamentRulesSnapshot;
  return createTournamentDraft(pool, {
    ...(input.slug !== undefined ? { slug: input.slug } : {}),
    title: input.title,
    description: source.description,
    imageUrl: source.imageUrl,
    rules,
    createdBy: input.createdBy,
    registrationOpensAt: null,
    registrationClosesAt: null,
    startsAt: null,
  });
}

export async function listTournamentParticipants(pool: Pool, tournamentId: string) {
  const { rows } = await pool.query(
    `select p.id, p.user_id, u.display_name,
            coalesce(
              case
                when u.display_source = 'custom' then u.custom_avatar_url
                when u.display_source = 'vk' then u.vk_avatar_url
                when u.display_source = 'telegram' then u.tg_avatar_url
                else u.avatar_url
              end,
              u.avatar_url
            ) as avatar_url,
            p.state, p.seed,
            p.entry_fee_coins, p.entry_fee_state, p.joined_at, p.withdrawn_at,
            p.created_at, p.updated_at
       from tournament_participant p join users u on u.id = p.user_id
      where p.tournament_id = $1 order by p.created_at, p.id`,
    [tournamentId],
  );
  return rows;
}

export async function listPlayerTournamentParticipants(pool: Pool, tournamentId: string) {
  const { rows } = await pool.query<{
    user_id: string;
    display_name: string;
    avatar_url: string | null;
    seed: number | null;
  }>(
    `select p.user_id, u.display_name,
            coalesce(
              case
                when u.display_source = 'custom' then u.custom_avatar_url
                when u.display_source = 'vk' then u.vk_avatar_url
                when u.display_source = 'telegram' then u.tg_avatar_url
                else u.avatar_url
              end,
              u.avatar_url
            ) as avatar_url,
            p.seed
       from tournament_participant p
       join users u on u.id = p.user_id
      where p.tournament_id = $1 and p.state = 'approved'
      order by p.seed nulls last, p.joined_at, p.id`,
    [tournamentId],
  );
  return rows.map((row) => ({
    userId: row.user_id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    seed: row.seed,
  }));
}

export async function rescheduleTournamentFixture(
  pool: Pool,
  input: {
    tournamentId: string;
    fixtureId: string;
    startsAt: Date;
    endsAt: Date;
    reason: string;
    adminUserId: string;
  },
) {
  return inTransaction(pool, async (client) => {
    await lockTournamentFixture(client, input);
    const attempt = await client.query<{
      id: string;
      status: string;
      amateur_duel_match_id: string | null;
      duel_status: string | null;
      round_game_day_id: string | null;
      scheduled_starts_at: Date;
      readiness_expires_at: Date;
      hard_deadline_at: Date;
    }>(
      `select attempt.id, attempt.status, attempt.amateur_duel_match_id, attempt.round_game_day_id,
              duel.status as duel_status, attempt.scheduled_starts_at,
              attempt.readiness_expires_at, attempt.hard_deadline_at
         from tournament_fixture_attempt attempt
         left join amateur_duel_match duel on duel.id = attempt.amateur_duel_match_id
        where attempt.fixture_id = $1
        order by attempt.attempt_number desc
        limit 1
        for update of attempt`,
      [input.fixtureId],
    );
    const currentAttempt = attempt.rows[0];
    if (currentAttempt !== undefined) {
      if (
        !['pending', 'needs_reschedule', 'needs_admin_decision'].includes(currentAttempt.status) ||
        (currentAttempt.amateur_duel_match_id !== null &&
          currentAttempt.duel_status !== 'cancelled')
      ) {
        throw new AppError('conflict', 'Игру нельзя перенести после начала готовности', 409);
      }
      const readinessDurationMs =
        currentAttempt.readiness_expires_at.getTime() -
        currentAttempt.scheduled_starts_at.getTime();
      const gameplayDurationMs =
        currentAttempt.hard_deadline_at.getTime() - currentAttempt.readiness_expires_at.getTime();
      const readinessExpiresAt = new Date(input.startsAt.getTime() + readinessDurationMs);
      const hardDeadlineAt = new Date(readinessExpiresAt.getTime() + gameplayDurationMs);
      if (hardDeadlineAt.getTime() !== input.endsAt.getTime()) {
        throw new AppError(
          'bad_request',
          'Конец игры должен учитывать готовность и длительность выбранного формата',
          400,
        );
      }
      await client.query(
        `update tournament_fixture_attempt
            set status = 'pending', scheduled_starts_at = $2,
                readiness_expires_at = $3, hard_deadline_at = $4,
                amateur_duel_match_id = null,
                home_ready_at = null, away_ready_at = null,
                outcome = null, winner_participant_id = null,
                home_score = null, away_score = null,
                home_accuracy = null, away_accuracy = null,
                home_active_time_ms = null, away_active_time_ms = null,
                settled_at = null,
                result_snapshot = coalesce(result_snapshot, '{}'::jsonb)
                  || jsonb_build_object('rescheduledReason', $5::text),
                updated_at = now()
          where id = $1`,
        [currentAttempt.id, input.startsAt, readinessExpiresAt, hardDeadlineAt, input.reason],
      );
      await client.query(
        `update tournament_incident
            set status = 'resolved', resolved_at = now(), resolved_by = $2, updated_at = now()
          where fixture_attempt_id = $1 and status = 'open'`,
        [currentAttempt.id, input.adminUserId],
      );
    }
    const updated = await client.query(
      `update tournament_fixture
          set scheduled_starts_at = $3, window_ends_at = $4,
              status = case when status = 'paused' then 'scheduled' else status end,
              rescheduled_reason = $5, updated_at = now()
        where id = $1 and tournament_id = $2
          and status in ('conditional', 'scheduled', 'open', 'paused')
        returning id, scheduled_starts_at, window_ends_at`,
      [input.fixtureId, input.tournamentId, input.startsAt, input.endsAt, input.reason],
    );
    if (updated.rowCount === 0)
      throw new AppError('conflict', 'fixture cannot be rescheduled', 409);
    const assignedGameDay = (
      await client.query<{ round_game_day_id: string }>(
        `select round_game_day_id from tournament_fixture_attempt
          where fixture_id = $1 and round_game_day_id is not null
          order by attempt_number desc limit 1`,
        [input.fixtureId],
      )
    ).rows[0]?.round_game_day_id;
    if (assignedGameDay !== undefined) {
      await client.query(
        `update tournament_round_game_day
            set schedule_revision = schedule_revision + 1, rescheduled_starts_at = $2
          where id = $1`,
        [assignedGameDay, input.startsAt],
      );
    } else {
      await client.query(
        `update tournament_round round
            set schedule_revision = schedule_revision + 1, rescheduled_starts_at = $2
           from tournament_fixture fixture
          where fixture.id = $1 and fixture.round_id = round.id`,
        [input.fixtureId, input.startsAt],
      );
    }
    await client.query(
      `update tournament_playoff_series series
          set status = 'scheduled', updated_at = now()
         from tournament_fixture fixture
        where fixture.id = $1 and fixture.series_id = series.id and series.status = 'paused'`,
      [input.fixtureId],
    );
    await client.query(
      `insert into tournament_adjustment
         (tournament_id, fixture_id, kind, payload, reason, created_by)
       values ($1, $2, 'schedule', $3, $4, $5)`,
      [
        input.tournamentId,
        input.fixtureId,
        JSON.stringify({ startsAt: input.startsAt, endsAt: input.endsAt }),
        input.reason,
        input.adminUserId,
      ],
    );
    return {
      fixtureId: input.fixtureId,
      startsAt: input.startsAt.toISOString(),
      endsAt: input.endsAt.toISOString(),
    };
  });
}

export async function resolveTournamentNoShow(
  pool: Pool,
  input: {
    tournamentId: string;
    fixtureId: string;
    absent: 'home' | 'away' | 'both';
    reason: string;
    adminUserId: string;
  },
) {
  const settledAt = new Date();
  return inTransaction(pool, async (client) => {
    await lockTournamentFixture(client, input);
    const fixtureResult = await client.query<{
      home_participant_id: string | null;
      away_participant_id: string | null;
      series_id: string | null;
      stage: string;
      fixture_status: string;
      tournament_status: TournamentStatus;
    }>(
      `select f.home_participant_id, f.away_participant_id, f.series_id, r.stage,
              f.status as fixture_status, t.status as tournament_status
         from tournament_fixture f
         join tournament_round r on r.id = f.round_id
         join tournament t on t.id = f.tournament_id
        where f.id = $1 and f.tournament_id = $2 for update of f`,
      [input.fixtureId, input.tournamentId],
    );
    const fixture = fixtureResult.rows[0];
    if (!fixture || fixture.home_participant_id === null || fixture.away_participant_id === null) {
      throw new AppError('not_found', 'fixture not found', 404);
    }
    const attemptResult = await client.query<{
      id: string;
      status: string;
    }>(
      `select id, status from tournament_fixture_attempt
        where fixture_id = $1
        order by attempt_number desc
        limit 1
        for update`,
      [input.fixtureId],
    );
    const attempt = attemptResult.rows[0];
    let fixtureChanged = false;
    if (input.absent === 'both' && fixture.stage !== 'regular') {
      const paused = await client.query(
        `update tournament_fixture
            set status = 'paused', updated_at = now()
          where id = $1 and status in ('conditional', 'scheduled', 'open', 'active')
          returning id`,
        [input.fixtureId],
      );
      fixtureChanged = (paused.rowCount ?? 0) > 0;
      if (fixtureChanged && fixture.series_id) {
        await client.query(
          `update tournament_playoff_series
              set status = 'paused', updated_at = now()
            where id = $1 and status in ('pending', 'scheduled', 'active')`,
          [fixture.series_id],
        );
      }
      if (fixtureChanged) {
        if (attempt !== undefined) {
          await client.query(
            `update tournament_fixture_attempt
                set status = 'needs_admin_decision', outcome = 'both_no_show',
                    result_snapshot = coalesce(result_snapshot, '{}'::jsonb)
                      || $2::jsonb,
                    updated_at = now()
              where id = $1 and status in (
                'pending', 'ready_check', 'active', 'needs_reschedule', 'needs_admin_decision'
              )`,
            [attempt.id, JSON.stringify({ reason: input.reason, resolvedByAdmin: true })],
          );
          await client.query(
            `insert into tournament_incident
               (tournament_id, series_id, fixture_id, fixture_attempt_id, kind, details)
             values ($1, $2, $3, $4, 'both_no_show', $5::jsonb)
             on conflict (fixture_attempt_id, kind) where status = 'open' do nothing`,
            [
              input.tournamentId,
              fixture.series_id,
              input.fixtureId,
              attempt.id,
              JSON.stringify({ reason: input.reason, resolvedByAdmin: true }),
            ],
          );
        }
        await terminalizeTournamentFixtureDuels(client, {
          tournamentId: input.tournamentId,
          fixtureIds: [input.fixtureId],
          reason: 'tournament_no_show',
        });
        if (attempt === undefined && fixture.tournament_status !== 'paused') {
          await client.query(
            `insert into tournament_adjustment
               (tournament_id, fixture_id, kind, payload, reason, created_by)
             values ($1, $2, 'incident_resolution', $3, $4, $5)`,
            [
              input.tournamentId,
              input.fixtureId,
              JSON.stringify({ action: 'pause', previousStatus: fixture.tournament_status }),
              input.reason,
              input.adminUserId,
            ],
          );
        }
        if (attempt === undefined) {
          await client.query(
            `update tournament set status = 'paused', updated_at = now()
              where id = $1 and status <> 'paused'`,
            [input.tournamentId],
          );
        }
      }
    } else {
      const winner =
        input.absent === 'home'
          ? fixture.away_participant_id
          : input.absent === 'away'
            ? fixture.home_participant_id
            : null;
      const outcome =
        input.absent === 'home'
          ? 'away_win'
          : input.absent === 'away'
            ? 'home_win'
            : 'double_forfeit';
      const updated = await client.query(
        `update tournament_fixture
            set status = 'forfeit', winner_participant_id = $2, outcome = $3,
                home_score = case when $3 = 'home_win' then 1 else 0 end,
                away_score = case when $3 = 'away_win' then 1 else 0 end,
                result_snapshot = coalesce(result_snapshot, '{}'::jsonb) || $4::jsonb,
                settled_at = now(), updated_at = now()
          where id = $1 and status in ('conditional', 'scheduled', 'open', 'active', 'paused')
          returning id`,
        [
          input.fixtureId,
          winner,
          outcome,
          JSON.stringify({ technical: true, absent: input.absent }),
        ],
      );
      if ((updated.rowCount ?? 0) > 0) {
        fixtureChanged = true;
        if (attempt !== undefined && winner !== null) {
          await client.query(
            `update tournament_fixture_attempt
                set status = 'technical_result', winner_participant_id = $2,
                    outcome = $3,
                    result_snapshot = coalesce(result_snapshot, '{}'::jsonb)
                      || $4::jsonb,
                    settled_at = now(), updated_at = now()
              where id = $1 and status in (
                'pending', 'ready_check', 'active', 'needs_reschedule', 'needs_admin_decision'
              )`,
            [
              attempt.id,
              winner,
              input.absent === 'home' ? 'home_no_show' : 'away_no_show',
              JSON.stringify({ reason: input.reason, resolvedByAdmin: true }),
            ],
          );
        }
        await terminalizeTournamentFixtureDuels(client, {
          tournamentId: input.tournamentId,
          fixtureIds: [input.fixtureId],
          reason: 'tournament_no_show',
        });
        if (fixture.series_id !== null && winner !== null) {
          if (fixture.fixture_status === 'paused') {
            await client.query(
              `update tournament_playoff_series
                  set status = 'scheduled', updated_at = now()
                where id = $1 and status = 'paused'`,
              [fixture.series_id],
            );
          }
          await advanceTournamentPlayoffSeries(client, {
            seriesId: fixture.series_id,
            winnerParticipantId: winner,
            settledAt,
          });
        }
        if (fixture.stage === 'regular')
          await rebuildHeadToHeadStandings(client, input.tournamentId);
        await enqueueTournamentFixtureResultPush(client, {
          fixtureId: input.fixtureId,
          homeParticipantId: fixture.home_participant_id,
          awayParticipantId: fixture.away_participant_id,
          winnerParticipantId: winner,
        });
      }
    }
    if (fixtureChanged) {
      await client.query(
        `insert into tournament_adjustment
           (tournament_id, fixture_id, kind, payload, reason, created_by)
         values ($1, $2, 'forfeit', $3, $4, $5)`,
        [
          input.tournamentId,
          input.fixtureId,
          JSON.stringify({ absent: input.absent }),
          input.reason,
          input.adminUserId,
        ],
      );
    }
    return { fixtureId: input.fixtureId, resolution: input.absent };
  });
}

export async function disqualifyTournamentParticipant(
  pool: Pool,
  input: { tournamentId: string; participantId: string; reason: string; adminUserId: string },
) {
  const settledAt = new Date();
  return inTransaction(pool, async (client) => {
    await lockTournament(client, input.tournamentId);
    const participant = await client.query(
      `update tournament_participant set state = 'disqualified', withdrawn_at = now(), updated_at = now()
        where id = $1 and tournament_id = $2 and state = 'approved' returning id`,
      [input.participantId, input.tournamentId],
    );
    if (participant.rowCount === 0)
      throw new AppError('conflict', 'participant cannot be disqualified', 409);
    let futureForfeits = 0;
    let regularFixtureChanged = false;
    for (;;) {
      const fixtureResult = await client.query<{
        id: string;
        series_id: string | null;
        stage: string;
        home_participant_id: string;
        away_participant_id: string;
        side: 'home' | 'away';
        winner_participant_id: string;
      }>(
        `select f.id, f.series_id, r.stage, f.home_participant_id, f.away_participant_id,
                case when f.home_participant_id = $2 then 'home' else 'away' end as side,
                case when f.home_participant_id = $2
                     then f.away_participant_id else f.home_participant_id end
                  as winner_participant_id
           from tournament_fixture f
           join tournament_round r on r.id = f.round_id
          where f.tournament_id = $1
            and f.status in ('conditional', 'scheduled', 'open', 'active')
            and (f.home_participant_id = $2 or f.away_participant_id = $2)
            and f.home_participant_id is not null and f.away_participant_id is not null
          order by f.fixture_number
          limit 1
          for update of f`,
        [input.tournamentId, input.participantId],
      );
      const fixture = fixtureResult.rows[0];
      if (!fixture) break;
      const updated = await client.query(
        `update tournament_fixture
            set status = 'forfeit',
                winner_participant_id = case when $2 = 'home' then away_participant_id else home_participant_id end,
                outcome = case when $2 = 'home' then 'away_win' else 'home_win' end,
                home_score = case when $2 = 'away' then 1 else 0 end,
                away_score = case when $2 = 'home' then 1 else 0 end,
                result_snapshot = $3, settled_at = now(), updated_at = now()
          where id = $1 and status in ('conditional', 'scheduled', 'open', 'active')
          returning id`,
        [fixture.id, fixture.side, JSON.stringify({ technical: true, disqualification: true })],
      );
      if (updated.rowCount === 0) continue;
      futureForfeits += 1;
      await client.query(
        `update tournament_fixture_attempt
            set status = 'technical_result', winner_participant_id = $2,
                outcome = $3,
                result_snapshot = coalesce(result_snapshot, '{}'::jsonb)
                  || $4::jsonb,
                settled_at = now(), updated_at = now()
          where fixture_id = $1 and status in (
            'pending', 'ready_check', 'active', 'needs_reschedule', 'needs_admin_decision'
          )`,
        [
          fixture.id,
          fixture.winner_participant_id,
          fixture.side === 'home' ? 'home_no_show' : 'away_no_show',
          JSON.stringify({
            technical: true,
            disqualification: true,
            reason: input.reason,
          }),
        ],
      );
      await terminalizeTournamentFixtureDuels(client, {
        tournamentId: input.tournamentId,
        fixtureIds: [fixture.id],
        reason: 'tournament_disqualification',
      });
      if (fixture.series_id !== null) {
        await advanceTournamentPlayoffSeries(client, {
          seriesId: fixture.series_id,
          winnerParticipantId: fixture.winner_participant_id,
          settledAt,
        });
      }
      if (fixture.stage === 'regular') regularFixtureChanged = true;
      await enqueueTournamentFixtureResultPush(client, {
        fixtureId: fixture.id,
        homeParticipantId: fixture.home_participant_id,
        awayParticipantId: fixture.away_participant_id,
        winnerParticipantId: fixture.winner_participant_id,
      });
    }
    await client.query(
      `insert into tournament_adjustment
         (tournament_id, participant_id, kind, payload, reason, created_by)
       values ($1, $2, 'disqualification', $3, $4, $5)`,
      [
        input.tournamentId,
        input.participantId,
        JSON.stringify({ futureFixtures: futureForfeits }),
        input.reason,
        input.adminUserId,
      ],
    );
    if (regularFixtureChanged) await rebuildHeadToHeadStandings(client, input.tournamentId);
    return { participantId: input.participantId, futureForfeits };
  });
}
