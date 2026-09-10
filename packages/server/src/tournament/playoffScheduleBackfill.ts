import type { Pool, PoolClient } from 'pg';
import {
  allocateSeriesGamesByDay,
  validateRoundGameDays,
  type RoundGameDay,
} from './playoffScheduling.js';
import {
  attemptDeadline,
  insertInitialFixtureAttempt,
  insertRoundGameDays,
  loadDuelTemplateLifecycleSnapshot,
  resolveRoundGameDays,
  scheduledStartForSeriesGame,
  type DuelTemplateLifecycleSnapshot,
  type ResolvedRoundGameDay,
} from './fixtureAttempts.js';

export interface PlayoffSchedulingBackfillOptions {
  tournamentSlug?: string;
  now: Date;
  dryRun: boolean;
  readinessMinutes: number;
  plannedStartIntervalMinutes: number;
}

export interface PlayoffSchedulingBackfillReport {
  tournaments: Array<{
    id: string;
    slug: string;
    status: 'planned' | 'applied' | 'unchanged' | 'blocked';
    fixtureCount: number;
    reason?: string;
  }>;
}

interface TournamentRow {
  id: string;
  slug: string;
  timezone: string;
}

interface RoundRow {
  id: string;
  starts_at: Date;
  rules_snapshot: Record<string, unknown>;
}

interface FixtureRow {
  id: string;
  game_number: number | null;
  scheduled_starts_at: Date | null;
  window_ends_at: Date | null;
  attempt_id: string | null;
  attempt_status: string | null;
  attempt_duel_id: string | null;
  attempt_starts_at: Date | null;
  attempt_readiness_expires_at: Date | null;
  attempt_hard_deadline_at: Date | null;
  attempt_round_game_day_id: string | null;
}

interface ExistingDayRow {
  id: string;
  day_number: number;
  local_date: string;
  first_game_starts_at: Date;
  max_result_bearing_games: number;
  readiness_minutes: number;
  interval_minutes: number;
}

interface PlannedRound {
  round: RoundRow;
  days: ResolvedRoundGameDay[];
  template: DuelTemplateLifecycleSnapshot;
  fixtures: Array<{
    fixture: FixtureRow;
    day: ResolvedRoundGameDay;
    startsAt: Date;
    hardDeadlineAt: Date;
  }>;
  changedFixtureCount: number;
}

function positiveInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${field} is missing or invalid`);
  }
  return value;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${field} is missing`);
  return value;
}

function localStart(date: Date, timezone: string): { localDate: string; localTime: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value;
  return {
    localDate: `${part('year')}-${part('month')}-${part('day')}`,
    localTime: `${part('hour')}:${part('minute')}`,
  };
}

function nextLocalDate(localDate: string): string {
  const [year, month, day] = localDate.split('-').map(Number);
  const shifted = new Date(Date.UTC(year!, month! - 1, day! + 1));
  return shifted.toISOString().slice(0, 10);
}

function sameInstant(left: Date | null, right: Date): boolean {
  return left?.getTime() === right.getTime();
}

async function loadExistingDays(client: PoolClient, roundId: string): Promise<ExistingDayRow[]> {
  const result = await client.query<ExistingDayRow>(
    `select id, day_number, local_date, first_game_starts_at,
            max_result_bearing_games,
            extract(epoch from readiness_duration)::int / 60 as readiness_minutes,
            extract(epoch from planned_start_interval)::int / 60 as interval_minutes
       from tournament_round_game_day
      where round_id = $1
      order by day_number`,
    [roundId],
  );
  return result.rows;
}

function existingDaysMatch(
  existing: ExistingDayRow[],
  planned: ResolvedRoundGameDay[],
  options: PlayoffSchedulingBackfillOptions,
): boolean {
  return (
    existing.length === planned.length &&
    existing.every((day, index) => {
      const expected = planned[index]!;
      return (
        Number(day.day_number) === expected.dayNumber &&
        day.local_date === expected.localDate &&
        day.first_game_starts_at.getTime() === expected.firstGameStartsAt.getTime() &&
        Number(day.max_result_bearing_games) === expected.maxResultGames &&
        Number(day.readiness_minutes) === options.readinessMinutes &&
        Number(day.interval_minutes) === options.plannedStartIntervalMinutes
      );
    })
  );
}

async function planTournament(
  client: PoolClient,
  tournament: TournamentRow,
  options: PlayoffSchedulingBackfillOptions,
): Promise<{ rounds: PlannedRound[]; fixtureCount: number }> {
  const unsafe = await client.query<{ blocked: boolean }>(
    `select exists(
       select 1
         from tournament_fixture fixture
         left join tournament_fixture_attempt attempt on attempt.fixture_id = fixture.id
         left join tournament_fixture_segment segment on segment.fixture_id = fixture.id
         left join amateur_duel_match duel on duel.id = segment.duel_match_id
        where fixture.tournament_id = $1
          and (
            fixture.status in ('open', 'active', 'paused')
            or attempt.status in ('ready_check', 'active', 'needs_reschedule', 'needs_admin_decision')
            or duel.status in ('ready_check', 'active')
          )
     ) as blocked`,
    [tournament.id],
  );
  if (unsafe.rows[0]?.blocked === true) {
    throw new Error('есть начатая или приостановленная игра');
  }

  const roundResult = await client.query<RoundRow>(
    `select id, starts_at, rules_snapshot
       from tournament_round
      where tournament_id = $1 and stage in ('playoff', 'third_place')
      order by number, stage`,
    [tournament.id],
  );
  const rounds: PlannedRound[] = [];
  let fixtureCount = 0;
  for (const round of roundResult.rows) {
    const winsRequired = positiveInteger(round.rules_snapshot.winsRequired, 'winsRequired');
    const duelTemplateId = requiredString(round.rules_snapshot.duelTemplateId, 'duelTemplateId');
    const allocation = allocateSeriesGamesByDay(winsRequired, winsRequired === 1 ? 1 : 2);
    const first = localStart(round.starts_at, tournament.timezone);
    const rawDays: RoundGameDay[] = allocation.map((maxResultGames, index) => ({
      localDate: index === 0 ? first.localDate : nextLocalDate(first.localDate),
      firstWaveLocalTime: first.localTime,
      maxResultGames,
    }));
    validateRoundGameDays({
      winsRequired,
      readinessMinutes: options.readinessMinutes,
      plannedStartIntervalMinutes: options.plannedStartIntervalMinutes,
      days: rawDays,
    });
    const days = resolveRoundGameDays(tournament.timezone, rawDays);
    const template = await loadDuelTemplateLifecycleSnapshot(client, duelTemplateId);
    const fixtureResult = await client.query<FixtureRow>(
      `select fixture.id,
              (fixture.result_snapshot->>'gameNumber')::int as game_number,
              fixture.scheduled_starts_at, fixture.window_ends_at,
              attempt.id as attempt_id, attempt.status as attempt_status,
              attempt.amateur_duel_match_id as attempt_duel_id,
              attempt.scheduled_starts_at as attempt_starts_at,
              attempt.readiness_expires_at as attempt_readiness_expires_at,
              attempt.hard_deadline_at as attempt_hard_deadline_at,
              attempt.round_game_day_id as attempt_round_game_day_id
         from tournament_fixture fixture
         left join lateral (
           select candidate.* from tournament_fixture_attempt candidate
            where candidate.fixture_id = fixture.id
            order by candidate.attempt_number desc limit 1
         ) attempt on true
        where fixture.round_id = $1
          and fixture.status in ('conditional', 'scheduled')
          and fixture.scheduled_starts_at > $2
        order by fixture.fixture_number`,
      [round.id, options.now],
    );
    const existingDays = await loadExistingDays(client, round.id);
    if (existingDays.length > 0 && !existingDaysMatch(existingDays, days, options)) {
      throw new Error('существующее расписание дней отличается от нового');
    }
    const dayIds = new Map(existingDays.map((day) => [Number(day.day_number), day.id]));
    const plannedFixtures: PlannedRound['fixtures'] = [];
    let changedFixtureCount = 0;
    for (const fixture of fixtureResult.rows) {
      if (fixture.game_number === null) throw new Error('у игры не указан номер в серии');
      if (
        fixture.attempt_id !== null &&
        (fixture.attempt_status !== 'pending' || fixture.attempt_duel_id !== null)
      ) {
        throw new Error('у будущей игры уже началась попытка');
      }
      const scheduled = scheduledStartForSeriesGame(
        days,
        Number(fixture.game_number),
        options.plannedStartIntervalMinutes,
      );
      if (scheduled.startsAt <= options.now) {
        throw new Error('новое время одной из игр уже прошло');
      }
      const hardDeadlineAt = attemptDeadline(
        scheduled.startsAt,
        options.readinessMinutes,
        template,
      );
      const expectedReadinessAt = new Date(
        scheduled.startsAt.getTime() + options.readinessMinutes * 60_000,
      );
      const attemptMatches =
        fixture.attempt_id !== null &&
        sameInstant(fixture.attempt_starts_at, scheduled.startsAt) &&
        sameInstant(fixture.attempt_readiness_expires_at, expectedReadinessAt) &&
        sameInstant(fixture.attempt_hard_deadline_at, hardDeadlineAt) &&
        fixture.attempt_round_game_day_id === (dayIds.get(scheduled.day.dayNumber) ?? null);
      const fixtureMatches =
        sameInstant(fixture.scheduled_starts_at, scheduled.startsAt) &&
        sameInstant(fixture.window_ends_at, hardDeadlineAt);
      if (!attemptMatches || !fixtureMatches) changedFixtureCount += 1;
      plannedFixtures.push({
        fixture,
        day: scheduled.day,
        startsAt: scheduled.startsAt,
        hardDeadlineAt,
      });
    }
    if (existingDays.length === 0 && plannedFixtures.length > 0) {
      changedFixtureCount = Math.max(changedFixtureCount, plannedFixtures.length);
    }
    fixtureCount += changedFixtureCount;
    rounds.push({ round, days, template, fixtures: plannedFixtures, changedFixtureCount });
  }
  return { rounds, fixtureCount };
}

async function applyTournamentPlan(
  client: PoolClient,
  plan: { rounds: PlannedRound[] },
  options: PlayoffSchedulingBackfillOptions,
): Promise<void> {
  for (const plannedRound of plan.rounds) {
    if (plannedRound.changedFixtureCount === 0) continue;
    const existingDays = await loadExistingDays(client, plannedRound.round.id);
    const persistedDays =
      existingDays.length === 0
        ? await insertRoundGameDays(client, {
            roundId: plannedRound.round.id,
            days: plannedRound.days,
            readinessMinutes: options.readinessMinutes,
            plannedStartIntervalMinutes: options.plannedStartIntervalMinutes,
          })
        : plannedRound.days.map((day) => ({
            ...day,
            id: existingDays.find((existing) => Number(existing.day_number) === day.dayNumber)!.id,
          }));
    const dayByNumber = new Map(persistedDays.map((day) => [day.dayNumber, day]));
    let roundEnd = plannedRound.days[0]!.firstGameStartsAt;
    for (const planned of plannedRound.fixtures) {
      const persistedDay = dayByNumber.get(planned.day.dayNumber)!;
      if (planned.fixture.attempt_id === null) {
        await insertInitialFixtureAttempt(client, {
          fixtureId: planned.fixture.id,
          roundGameDayId: persistedDay.id!,
          scheduledStartsAt: planned.startsAt,
          readinessMinutes: options.readinessMinutes,
          template: plannedRound.template,
        });
      } else {
        const readinessExpiresAt = new Date(
          planned.startsAt.getTime() + options.readinessMinutes * 60_000,
        );
        await client.query(
          `update tournament_fixture_attempt
              set round_game_day_id = $2, scheduled_starts_at = $3,
                  readiness_expires_at = $4, hard_deadline_at = $5,
                  result_snapshot = coalesce(result_snapshot, '{}'::jsonb) || $6::jsonb,
                  updated_at = now()
            where id = $1 and status = 'pending' and amateur_duel_match_id is null`,
          [
            planned.fixture.attempt_id,
            persistedDay.id,
            planned.startsAt,
            readinessExpiresAt,
            planned.hardDeadlineAt,
            JSON.stringify({ ...plannedRound.template, readinessMode: 'manual' }),
          ],
        );
        await client.query(
          `update tournament_fixture
              set scheduled_starts_at = $2, window_ends_at = $3, updated_at = now()
            where id = $1`,
          [planned.fixture.id, planned.startsAt, planned.hardDeadlineAt],
        );
      }
      if (planned.hardDeadlineAt > roundEnd) roundEnd = planned.hardDeadlineAt;
    }
    await client.query(
      `update tournament_round
          set starts_at = $2, ends_at = $3,
              rules_snapshot = coalesce(rules_snapshot, '{}'::jsonb) || $4::jsonb
        where id = $1`,
      [
        plannedRound.round.id,
        plannedRound.days[0]!.firstGameStartsAt,
        roundEnd,
        JSON.stringify({
          readinessMinutes: options.readinessMinutes,
          plannedStartIntervalMinutes: options.plannedStartIntervalMinutes,
          scheduleDays: plannedRound.days.map((day) => ({
            localDate: day.localDate,
            firstWaveLocalTime: day.firstWaveLocalTime,
            maxResultGames: day.maxResultGames,
          })),
        }),
      ],
    );
  }
}

export async function backfillPlayoffScheduling(
  pool: Pool,
  options: PlayoffSchedulingBackfillOptions,
): Promise<PlayoffSchedulingBackfillReport> {
  if (Number.isNaN(options.now.getTime())) throw new Error('now must be a valid date');
  const tournaments = await pool.query<TournamentRow>(
    `select tournament.id, tournament.slug,
            revision.rules_snapshot->'config'->>'timezone' as timezone
       from tournament tournament
       join tournament_revision revision on revision.id = tournament.published_revision_id
      where tournament.status in ('playoff', 'paused')
        and ($1::text is null or tournament.slug = $1)
      order by tournament.slug`,
    [options.tournamentSlug ?? null],
  );
  const report: PlayoffSchedulingBackfillReport = { tournaments: [] };
  for (const tournament of tournaments.rows) {
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(`select id from tournament where id = $1 for update`, [tournament.id]);
      let plan: { rounds: PlannedRound[]; fixtureCount: number };
      try {
        plan = await planTournament(client, tournament, options);
      } catch (error) {
        await client.query('rollback');
        report.tournaments.push({
          id: tournament.id,
          slug: tournament.slug,
          status: 'blocked',
          fixtureCount: 0,
          reason: error instanceof Error ? error.message : 'неизвестная ошибка',
        });
        continue;
      }
      if (options.dryRun) {
        await client.query('rollback');
        report.tournaments.push({
          id: tournament.id,
          slug: tournament.slug,
          status: plan.fixtureCount > 0 ? 'planned' : 'unchanged',
          fixtureCount: plan.fixtureCount,
        });
        continue;
      }
      if (plan.fixtureCount === 0) {
        await client.query('rollback');
        report.tournaments.push({
          id: tournament.id,
          slug: tournament.slug,
          status: 'unchanged',
          fixtureCount: 0,
        });
        continue;
      }
      await applyTournamentPlan(client, plan, options);
      await client.query('commit');
      report.tournaments.push({
        id: tournament.id,
        slug: tournament.slug,
        status: 'applied',
        fixtureCount: plan.fixtureCount,
      });
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }
  return report;
}
