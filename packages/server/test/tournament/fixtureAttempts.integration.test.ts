import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getGoalie,
  getSessionPhaseOffsets,
  resolvePerspectiveCourtShot,
} from '@hockey/game-core';
import { buildApp } from '../../src/app.js';
import { createJwt } from '../../src/auth/jwt.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { createTournamentDuelMatch } from '../../src/duel/amateur/routes.js';
import { cancelTournamentDuel } from '../../src/duel/amateur/lifecycle.js';
import { parseTournamentConfig } from '../../src/tournament/config.js';
import {
  applyToTournament,
  createTournamentDraft,
  generateRegularSchedule,
  publishRegularSchedule,
  publishTournament,
  rescheduleTournamentFixture,
  startTournamentPlayoffs,
  type TournamentRulesSnapshot,
} from '../../src/tournament/service.js';
import { openTournamentFixtureSegment } from '../../src/tournament/fixtureLifecycle.js';
import {
  advanceTournamentPlayoffSeries,
  forceTournamentPlayoffSeriesWinner,
} from '../../src/tournament/playoffSeriesLifecycle.js';
import { reconcilePlayoffDayStartingCommunications } from '../../src/tournament/communications.js';
import {
  createTestPool,
  getTestUrls,
  hasIntegrationEnv,
  resetDatabase,
} from '../helpers/testDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');
const SEQUENTIAL_PLAYOFF_SCHEDULE_MIGRATION_URL = new URL(
  '../../db/migrations/090_tournament_sequential_playoff_schedule.sql',
  import.meta.url,
);
const ADMIN_ID = '00000000-0000-4000-8000-000000000a01';
const TEMPLATE_ID = '00000000-0000-4000-8000-000000000a02';
const OFFICIAL_ID = '00000000-0000-4000-8000-000000000a03';
const JWT_SECRET = 'access-secret-at-least-16-chars';
const REFRESH_SECRET = 'refresh-secret-at-least-16-chars';
const DAILY_SEED_SECRET = 'daily-seed-secret-at-least-16!!';
const PLAYER_IDS = [
  '00000000-0000-4000-8000-000000000a11',
  '00000000-0000-4000-8000-000000000a12',
  '00000000-0000-4000-8000-000000000a13',
  '00000000-0000-4000-8000-000000000a14',
] as const;
const EXTRA_PLAYOFF_PLAYER_IDS = [
  '00000000-0000-4000-8000-000000000a15',
  '00000000-0000-4000-8000-000000000a16',
  '00000000-0000-4000-8000-000000000a17',
  '00000000-0000-4000-8000-000000000a18',
] as const;
const EIGHT_PLAYER_IDS = [...PLAYER_IDS, ...EXTRA_PLAYOFF_PLAYER_IDS] as const;

function lifecycleRules(marker = true, readinessMinutes = 5): TournamentRulesSnapshot {
  return {
    config: parseTournamentConfig({
      regularSource: 'head_to_head',
      participantLimit: 4,
      playoffSize: 4,
      timezone: 'Europe/Moscow',
      registrationMode: 'open',
      visibility: 'public',
      entryFeeCoins: 0,
      roundRobinCycles: 1,
      roundsPerDay: 1,
      firstRoundLocalTime: '10:00',
      fixtureWindowMs: 3_600_000,
      roundBreakMs: 0,
      dailyDays: null,
      dailyMetric: null,
      bestDays: null,
    }),
    eligibility: {
      minLevel: null,
      maxLevel: null,
      minGoals: 0,
      minExperience: 0,
      invitedUserIds: [],
      bannedUserIds: [],
    },
    regularDuelTemplateId: TEMPLATE_ID,
    ...(marker ? { duelLifecycleVersion: 2 } : {}),
    playoffRounds: [
      {
        roundNumber: 1,
        winsRequired: 2,
        homeSequence: ['H', 'A', 'H'],
        duelTemplateId: TEMPLATE_ID,
        readinessMinutes,
        plannedStartIntervalMinutes: 20,
        scheduleDays: [
          { localDate: '2030-10-26', firstWaveLocalTime: '20:00', maxResultGames: 2 },
          { localDate: '2030-10-27', firstWaveLocalTime: '20:00', maxResultGames: 1 },
        ],
      },
      {
        roundNumber: 2,
        winsRequired: 1,
        homeSequence: ['H'],
        duelTemplateId: TEMPLATE_ID,
        readinessMinutes: 5,
        plannedStartIntervalMinutes: 20,
        scheduleDays: [{ localDate: '2030-11-02', firstWaveLocalTime: '20:00', maxResultGames: 1 }],
      },
    ],
  };
}

function eightPlayerLifecycleRules(): TournamentRulesSnapshot {
  const rules = lifecycleRules();
  return {
    ...rules,
    config: parseTournamentConfig({
      regularSource: 'head_to_head',
      participantLimit: 8,
      playoffSize: 8,
      timezone: 'Europe/Moscow',
      registrationMode: 'open',
      visibility: 'public',
      entryFeeCoins: 0,
      roundRobinCycles: 1,
      roundsPerDay: 1,
      firstRoundLocalTime: '10:00',
      fixtureWindowMs: 3_600_000,
      roundBreakMs: 0,
      dailyDays: null,
      dailyMetric: null,
      bestDays: null,
    }),
    playoffRounds: [
      ...rules.playoffRounds,
      {
        roundNumber: 3,
        winsRequired: 1,
        homeSequence: ['H'],
        duelTemplateId: TEMPLATE_ID,
        readinessMinutes: 5,
        plannedStartIntervalMinutes: 20,
        scheduleDays: [{ localDate: '2030-11-09', firstWaveLocalTime: '20:00', maxResultGames: 1 }],
      },
    ],
  };
}

async function seed(pool: Pool): Promise<void> {
  await pool.query(
    `insert into users (id, display_name, timezone, role, account_kind)
     values ($1, 'Хоккей-бот', 'Europe/Moscow', 'player', 'official')`,
    [OFFICIAL_ID],
  );
  await pool.query(
    `insert into users (id, display_name, timezone, role, level, lifetime_goals_total, experience)
     values ($1, 'Attempt Admin', 'Europe/Moscow', 'admin', 10, 1000, 1000)`,
    [ADMIN_ID],
  );
  for (const [index, playerId] of EIGHT_PLAYER_IDS.entries()) {
    await pool.query(
      `insert into users
         (id, display_name, timezone, level, lifetime_goals_total, experience)
       values ($1, $2, 'Europe/Moscow', 5, 500, 500)`,
      [playerId, `Attempt Player ${index + 1}`],
    );
  }
  await pool.query(
    `update amateur_duel_template set is_active = false where duel_kind = 'classic'`,
  );
  await pool.query(
    `insert into amateur_duel_template
       (id, title, description, difficulty, duel_kind, duel_variant, starts_at, ends_at,
        total_periods, shots_per_period, period_duration_ms, break_duration_ms, goalie_id,
        period_speed_presets, period_rules)
     values ($1, 'Attempt template', '', 'hard', 'classic', 'classic', $2, $3,
             2, 30, 60000, 30000, 'rookie', $4::jsonb, $5::jsonb)`,
    [
      TEMPLATE_ID,
      new Date('2026-01-01T00:00:00.000Z'),
      new Date('2100-01-01T00:00:00.000Z'),
      JSON.stringify([
        {
          periodNumber: 1,
          goalFrequency: 0.5,
          goalieFrequency: 0.5,
          shooterFrequency: 0.5,
          puckSpeedPerMs: 1,
        },
        {
          periodNumber: 2,
          goalFrequency: 0.5,
          goalieFrequency: 0.5,
          shooterFrequency: 0.5,
          puckSpeedPerMs: 1,
        },
      ]),
      JSON.stringify([
        { periodNumber: 1, mode: 'quota', durationMs: 60_000, shotsLimit: 30 },
        { periodNumber: 2, mode: 'quota', durationMs: 120_000, shotsLimit: 30 },
      ]),
    ],
  );
  await pool.query(
    `insert into game_settings (key, value, label, description)
     values ('tournaments.enabled', 'true'::jsonb, 'Турниры включены', 'attempt lifecycle test')
     on conflict (key) do update set value = excluded.value`,
  );
}

async function createPublished(pool: Pool, slug: string, rules: TournamentRulesSnapshot) {
  const tournament = await createTournamentDraft(pool, {
    slug,
    title: 'Attempt tournament',
    description: '',
    rules,
    createdBy: ADMIN_ID,
    registrationOpensAt: new Date('2020-01-01T00:00:00.000Z'),
    registrationClosesAt: new Date('2030-09-01T00:00:00.000Z'),
    startsAt: new Date('2030-09-02T07:00:00.000Z'),
  });
  await publishTournament(pool, tournament.id, tournament.revision, ADMIN_ID);
  return tournament;
}

async function preparePlayoffs(
  pool: Pool,
  tournamentId: string,
  playerIds: readonly string[] = PLAYER_IDS,
): Promise<void> {
  for (const playerId of playerIds) {
    await pool.query(
      `insert into tournament_participant (tournament_id, user_id, state)
       values ($1, $2, 'approved')`,
      [tournamentId, playerId],
    );
  }
  const participants = await pool.query<{ id: string }>(
    `select id from tournament_participant where tournament_id = $1 order by user_id`,
    [tournamentId],
  );
  const round = await pool.query<{ id: string }>(
    `insert into tournament_round
       (tournament_id, stage, number, starts_at, ends_at, rules_snapshot)
     values ($1, 'regular', 1, $2, $3, '{}'::jsonb) returning id`,
    [tournamentId, new Date('2030-09-02T07:00:00.000Z'), new Date('2030-09-02T08:00:00.000Z')],
  );
  await pool.query(
    `insert into tournament_fixture
       (tournament_id, round_id, fixture_number, home_participant_id, away_participant_id,
        scheduled_starts_at, window_ends_at, status, outcome, winner_participant_id)
     values ($1, $2, 1, $3, $4, $5, $6, 'settled', 'home_win', $3)`,
    [
      tournamentId,
      round.rows[0]!.id,
      participants.rows[0]!.id,
      participants.rows[1]!.id,
      new Date('2030-09-02T07:00:00.000Z'),
      new Date('2030-09-02T08:00:00.000Z'),
    ],
  );
  for (const [index, participant] of participants.rows.entries()) {
    await pool.query(
      `insert into tournament_adjustment
         (tournament_id, participant_id, kind, payload, reason, created_by)
       values ($1, $2, 'points', $3, 'attempt standings seed', $4)`,
      [tournamentId, participant.id, JSON.stringify({ delta: 4 - index }), ADMIN_ID],
    );
  }
  await pool.query(`update tournament set status = 'regular' where id = $1`, [tournamentId]);
}

async function alignAttemptWithTestClock<Fixture extends { fixture_id: string }>(
  pool: Pool,
  fixture: Fixture,
): Promise<Fixture & { scheduled_starts_at: Date }> {
  const scheduledStartsAt = new Date(Date.now() - 60_000);
  const readinessExpiresAt = new Date(scheduledStartsAt.getTime() + 5 * 60_000);
  const hardDeadlineAt = new Date(readinessExpiresAt.getTime() + 20 * 60_000);
  await pool.query(
    `update tournament_fixture_attempt
        set scheduled_starts_at = $2, readiness_expires_at = $3, hard_deadline_at = $4
      where fixture_id = $1 and attempt_number = 1`,
    [fixture.fixture_id, scheduledStartsAt, readinessExpiresAt, hardDeadlineAt],
  );
  await pool.query(
    `update tournament_fixture
        set scheduled_starts_at = $2, window_ends_at = $3
      where id = $1`,
    [fixture.fixture_id, scheduledStartsAt, hardDeadlineAt],
  );
  return { ...fixture, scheduled_starts_at: scheduledStartsAt };
}

async function openFirstPlayoffAttempt(pool: Pool, slug: string) {
  const tournament = await createPublished(pool, slug, lifecycleRules());
  await preparePlayoffs(pool, tournament.id);
  await startTournamentPlayoffs(pool, tournament.id, new Date('2030-09-03T00:00:00.000Z'));
  const fixture = await pool.query<{
    fixture_id: string;
    series_id: string;
    home_participant_id: string;
    home_user_id: string;
    away_participant_id: string;
    away_user_id: string;
    scheduled_starts_at: Date;
  }>(
    `select fixture.id as fixture_id, fixture.series_id,
            fixture.home_participant_id, home.user_id as home_user_id,
            fixture.away_participant_id, away.user_id as away_user_id,
            attempt.scheduled_starts_at
       from tournament_fixture fixture
       join tournament_round round on round.id = fixture.round_id
       join tournament_fixture_attempt attempt on attempt.fixture_id = fixture.id
       join tournament_participant home on home.id = fixture.home_participant_id
       join tournament_participant away on away.id = fixture.away_participant_id
      where fixture.tournament_id = $1 and round.stage = 'playoff' and round.number = 1
        and (fixture.result_snapshot->>'gameNumber')::int = 1
      order by fixture.fixture_number limit 1`,
    [tournament.id],
  );
  const row = await alignAttemptWithTestClock(pool, fixture.rows[0]!);
  const opened = await openTournamentFixtureSegment(
    pool,
    {
      fixtureId: row.fixture_id,
      tournamentId: tournament.id,
      userId: row.home_user_id,
      now: new Date(row.scheduled_starts_at.getTime() + 1),
    },
    createTournamentDuelMatch,
  );
  return { tournamentId: tournament.id, fixture: row, opened };
}

async function openFirstRegularAttempt(pool: Pool, slug: string) {
  const tournament = await createPublished(pool, slug, lifecycleRules());
  for (const playerId of PLAYER_IDS) await applyToTournament(pool, tournament.id, playerId);
  await generateRegularSchedule(pool, tournament.id, tournament.revision);
  await publishRegularSchedule(pool, tournament.id);
  const fixture = await pool.query<{
    fixture_id: string;
    series_id: string | null;
    home_participant_id: string;
    home_user_id: string;
    away_participant_id: string;
    away_user_id: string;
    scheduled_starts_at: Date;
  }>(
    `select fixture.id as fixture_id, fixture.series_id,
            fixture.home_participant_id, home.user_id as home_user_id,
            fixture.away_participant_id, away.user_id as away_user_id,
            attempt.scheduled_starts_at
       from tournament_fixture fixture
       join tournament_round round on round.id = fixture.round_id
       join tournament_fixture_attempt attempt on attempt.fixture_id = fixture.id
       join tournament_participant home on home.id = fixture.home_participant_id
       join tournament_participant away on away.id = fixture.away_participant_id
      where fixture.tournament_id = $1 and round.stage = 'regular'
        and attempt.attempt_number = 1
      order by fixture.fixture_number limit 1`,
    [tournament.id],
  );
  const row = await alignAttemptWithTestClock(pool, fixture.rows[0]!);
  const opened = await openTournamentFixtureSegment(
    pool,
    {
      fixtureId: row.fixture_id,
      tournamentId: tournament.id,
      userId: row.home_user_id,
      now: new Date(row.scheduled_starts_at.getTime() + 1),
    },
    createTournamentDuelMatch,
  );
  return { tournamentId: tournament.id, fixture: row, opened };
}

async function createRegularReplay(pool: Pool, app: FastifyInstance, slug: string) {
  const context = await openFirstRegularAttempt(pool, slug);
  const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
  const homeToken = await jwt.issueAccessToken({ sub: context.fixture.home_user_id });
  for (const userId of [context.fixture.home_user_id, context.fixture.away_user_id]) {
    const token = await jwt.issueAccessToken({ sub: userId });
    const ready = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${context.opened.duelMatchId}/ready`,
      headers: { authorization: `Bearer ${token}` },
      payload: { loadout: {} },
    });
    expect(ready.statusCode).toBe(200);
  }
  await pool.query(
    `update amateur_duel_participant
        set state = 'completed', completed_at = now(), goals = 2, shots_taken = 4,
            active_duration_ms = 90000
      where match_id = $1`,
    [context.opened.duelMatchId],
  );
  const settled = await app.inject({
    method: 'GET',
    url: `/duel/amateur/matches/${context.opened.duelMatchId}`,
    headers: { authorization: `Bearer ${homeToken}` },
  });
  expect(settled.statusCode).toBe(200);
  const replay = await pool.query<{
    attempt_id: string;
    scheduled_starts_at: Date;
    readiness_expires_at: Date;
    hard_deadline_at: Date;
    is_result_bearing: boolean;
    snapshot: Record<string, unknown>;
    initial_settled_at: Date;
    fixture_status: string;
  }>(
    `select replay.id as attempt_id, replay.scheduled_starts_at,
            replay.readiness_expires_at, replay.hard_deadline_at,
            replay.is_result_bearing, replay.result_snapshot as snapshot,
            initial_duel.settled_at as initial_settled_at,
            fixture.status as fixture_status
       from tournament_fixture_attempt replay
       join tournament_fixture fixture on fixture.id = replay.fixture_id
       join tournament_fixture_attempt initial
         on initial.fixture_id = replay.fixture_id and initial.attempt_number = 1
       join amateur_duel_match initial_duel on initial_duel.id = initial.amateur_duel_match_id
      where replay.fixture_id = $1 and replay.attempt_number = 2`,
    [context.fixture.fixture_id],
  );
  return { ...context, homeToken, replay: replay.rows[0]! };
}

async function createPlayoffReplay(pool: Pool, app: FastifyInstance, slug: string) {
  const context = await openFirstPlayoffAttempt(pool, slug);
  const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
  const homeToken = await jwt.issueAccessToken({ sub: context.fixture.home_user_id });
  for (const userId of [context.fixture.home_user_id, context.fixture.away_user_id]) {
    const token = await jwt.issueAccessToken({ sub: userId });
    const ready = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${context.opened.duelMatchId}/ready`,
      headers: { authorization: `Bearer ${token}` },
      payload: { loadout: {} },
    });
    expect(ready.statusCode).toBe(200);
  }
  await pool.query(
    `update amateur_duel_participant
        set state = 'completed', completed_at = now(), goals = 2, shots_taken = 4,
            active_duration_ms = 90000
      where match_id = $1`,
    [context.opened.duelMatchId],
  );
  const settled = await app.inject({
    method: 'GET',
    url: `/duel/amateur/matches/${context.opened.duelMatchId}`,
    headers: { authorization: `Bearer ${homeToken}` },
  });
  expect(settled.statusCode).toBe(200);
  const replay = await pool.query<{
    attempt_id: string;
    scheduled_starts_at: Date;
    readiness_expires_at: Date;
    hard_deadline_at: Date;
    duel_match_id: string | null;
    snapshot: Record<string, unknown>;
  }>(
    `select id as attempt_id, scheduled_starts_at, readiness_expires_at,
            hard_deadline_at, amateur_duel_match_id as duel_match_id,
            result_snapshot as snapshot
       from tournament_fixture_attempt
      where fixture_id = $1 and attempt_number = 2`,
    [context.fixture.fixture_id],
  );
  return { ...context, homeToken, replay: replay.rows[0]! };
}

describe.skipIf(!hasIntegrationEnv)('tournament fixture attempts integration', () => {
  let app: FastifyInstance;
  let pool: Pool;

  beforeAll(async () => {
    const { databaseUrl, redisUrl } = getTestUrls();
    const initPool = createTestPool();
    await resetDatabase(initPool);
    await applyMigrations(initPool, MIGRATIONS_DIR);
    await initPool.query(
      `insert into users (id, display_name, timezone, role, account_kind)
       values ($1, 'Хоккей-бот', 'Europe/Moscow', 'player', 'official')`,
      [OFFICIAL_ID],
    );
    await initPool.end();
    app = await buildApp({
      config: {
        NODE_ENV: 'test',
        HOST: '0.0.0.0',
        PORT: 3000,
        LOG_LEVEL: 'warn',
        DATABASE_URL: databaseUrl,
        REDIS_URL: redisUrl,
        JWT_SECRET,
        REFRESH_SECRET,
        TELEGRAM_BOT_TOKEN: 'test-bot-token',
        DAILY_SEED_SECRET,
        SYSTEM_USER_ID: OFFICIAL_ID,
      },
      pushSchedulerEnabled: false,
      pushWorkerEnabled: false,
    });
    pool = app.pg;
  });

  beforeEach(async () => {
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);
    await seed(pool);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('materializes DST-safe playoff game days and one initial attempt per series', async () => {
    const tournament = await createPublished(pool, 'attempt-playoff-schedule', lifecycleRules());
    await preparePlayoffs(pool, tournament.id);

    await startTournamentPlayoffs(pool, tournament.id, new Date('2030-09-03T00:00:00.000Z'));

    const firstRound = await pool.query<{
      game_number: number;
      scheduled_starts_at: Date;
      hard_deadline_at: Date;
      status: string;
      attempt_number: number;
      kind: string;
      is_result_bearing: boolean;
      snapshot: Record<string, unknown>;
    }>(
      `select (fixture.result_snapshot->>'gameNumber')::int as game_number,
              attempt.scheduled_starts_at, attempt.hard_deadline_at, fixture.status,
              attempt.attempt_number, attempt.kind, attempt.is_result_bearing,
              attempt.result_snapshot as snapshot
         from tournament_fixture fixture
         join tournament_round round on round.id = fixture.round_id
         join tournament_fixture_attempt attempt on attempt.fixture_id = fixture.id
        where fixture.tournament_id = $1 and round.stage = 'playoff' and round.number = 1
        order by game_number, fixture.fixture_number`,
      [tournament.id],
    );
    expect(firstRound.rows).toHaveLength(2);
    expect(
      firstRound.rows.map((row) => `${row.game_number}:${row.scheduled_starts_at.toISOString()}`),
    ).toEqual([
      '1:2030-10-26T17:00:00.000Z',
      '1:2030-10-26T17:00:00.000Z',
    ]);
    expect(firstRound.rows.every((row) => row.attempt_number === 1)).toBe(true);
    expect(firstRound.rows.every((row) => row.kind === 'initial')).toBe(true);
    expect(firstRound.rows.every((row) => row.is_result_bearing)).toBe(true);
    expect(firstRound.rows.filter((row) => row.status === 'conditional')).toHaveLength(0);
    expect(firstRound.rows[0]!.hard_deadline_at.toISOString()).toBe('2030-10-26T17:25:00.000Z');
    expect(firstRound.rows[0]!.snapshot).toMatchObject({
      duelTemplateId: TEMPLATE_ID,
      duelKind: 'classic',
      periodDurationsMs: [60_000, 120_000],
      breakDurationsMs: [30_000],
    });

    const gameDays = await pool.query<{
      stage: string;
      round_number: number;
      day_number: number;
      local_date: string;
      first_game_starts_at: Date;
      max_result_bearing_games: number;
    }>(
      `select round.stage, round.number as round_number, day.day_number,
              day.local_date::text, day.first_game_starts_at, day.max_result_bearing_games
         from tournament_round_game_day day
         join tournament_round round on round.id = day.round_id
        where round.tournament_id = $1
        order by round.number, round.stage, day.day_number`,
      [tournament.id],
    );
    expect(gameDays.rows).toEqual(
      expect.arrayContaining([
        {
          stage: 'playoff',
          round_number: 1,
          day_number: 1,
          local_date: '2030-10-26',
          first_game_starts_at: new Date('2030-10-26T17:00:00.000Z'),
          max_result_bearing_games: 2,
        },
        {
          stage: 'playoff',
          round_number: 1,
          day_number: 2,
          local_date: '2030-10-27',
          first_game_starts_at: new Date('2030-10-27T17:00:00.000Z'),
          max_result_bearing_games: 1,
        },
      ]),
    );
    const fixtureCount = await pool.query<{ fixtures: number; attempts: number }>(
      `select count(distinct fixture.id)::int as fixtures,
              count(attempt.id)::int as attempts
         from tournament_fixture fixture
         left join tournament_fixture_attempt attempt on attempt.fixture_id = fixture.id
        where fixture.tournament_id = $1
          and fixture.series_id is not null`,
      [tournament.id],
    );
    expect(fixtureCount.rows[0]).toEqual({ fixtures: 8, attempts: 4 });
  });

  it('materializes regular attempts only for the explicit lifecycle marker', async () => {
    for (const marker of [true, false]) {
      const tournament = await createPublished(
        pool,
        marker ? 'attempt-regular-v2' : 'attempt-regular-legacy',
        lifecycleRules(marker),
      );
      for (const playerId of PLAYER_IDS) await applyToTournament(pool, tournament.id, playerId);
      await generateRegularSchedule(pool, tournament.id, tournament.revision);

      const counts = await pool.query<{ fixtures: number; attempts: number }>(
        `select count(distinct fixture.id)::int as fixtures, count(attempt.id)::int as attempts
           from tournament_fixture fixture
           left join tournament_fixture_attempt attempt on attempt.fixture_id = fixture.id
          where fixture.tournament_id = $1`,
        [tournament.id],
      );
      expect(counts.rows[0]!.fixtures).toBe(6);
      expect(counts.rows[0]!.attempts).toBe(marker ? 6 : 0);
      if (marker) {
        const attempt = await pool.query<{
          readiness_ms: number;
          deadline_ms: number;
          snapshot: Record<string, unknown>;
        }>(
          `select extract(epoch from (attempt.readiness_expires_at - attempt.scheduled_starts_at)) * 1000
                    as readiness_ms,
                  extract(epoch from (attempt.hard_deadline_at - attempt.scheduled_starts_at)) * 1000
                    as deadline_ms,
                  attempt.result_snapshot as snapshot
             from tournament_fixture_attempt attempt
             join tournament_fixture fixture on fixture.id = attempt.fixture_id
            where fixture.tournament_id = $1 order by fixture.fixture_number limit 1`,
          [tournament.id],
        );
        expect(Number(attempt.rows[0]!.readiness_ms)).toBe(300_000);
        expect(Number(attempt.rows[0]!.deadline_ms)).toBe(510_000);
        expect(attempt.rows[0]!.snapshot).toMatchObject({ duelTemplateId: TEMPLATE_ID });
      }
    }
  });

  it('opens an attempt only inside its immutable window and reuses its duel idempotently', async () => {
    const tournament = await createPublished(pool, 'attempt-open-window', lifecycleRules());
    await preparePlayoffs(pool, tournament.id);
    await startTournamentPlayoffs(pool, tournament.id, new Date('2030-09-03T00:00:00.000Z'));
    const fixture = await pool.query<{
      fixture_id: string;
      home_user_id: string;
      scheduled_starts_at: Date;
      readiness_expires_at: Date;
      hard_deadline_at: Date;
    }>(
      `select fixture.id as fixture_id, home.user_id as home_user_id,
              attempt.scheduled_starts_at, attempt.readiness_expires_at, attempt.hard_deadline_at
         from tournament_fixture fixture
         join tournament_round round on round.id = fixture.round_id
         join tournament_fixture_attempt attempt on attempt.fixture_id = fixture.id
         join tournament_participant home on home.id = fixture.home_participant_id
        where fixture.tournament_id = $1 and round.stage = 'playoff' and round.number = 1
          and (fixture.result_snapshot->>'gameNumber')::int = 1
        order by fixture.fixture_number limit 1`,
      [tournament.id],
    );
    const row = fixture.rows[0]!;
    await expect(
      openTournamentFixtureSegment(
        pool,
        {
          fixtureId: row.fixture_id,
          tournamentId: tournament.id,
          userId: row.home_user_id,
          now: new Date(row.scheduled_starts_at.getTime() - 1),
        },
        createTournamentDuelMatch,
      ),
    ).rejects.toThrow('fixture window is closed');

    const first = await openTournamentFixtureSegment(
      pool,
      {
        fixtureId: row.fixture_id,
        tournamentId: tournament.id,
        userId: row.home_user_id,
        now: new Date(row.scheduled_starts_at.getTime() + 120_000),
      },
      createTournamentDuelMatch,
    );
    const second = await openTournamentFixtureSegment(
      pool,
      {
        fixtureId: row.fixture_id,
        tournamentId: tournament.id,
        userId: row.home_user_id,
        now: new Date(row.scheduled_starts_at.getTime() + 180_000),
      },
      createTournamentDuelMatch,
    );
    expect(second.duelMatchId).toBe(first.duelMatchId);
    expect(second.segmentId).toBe(first.segmentId);

    const persisted = await pool.query<{
      attempt_match_id: string;
      attempt_status: string;
      segment_match_id: string;
      segment_kind: string;
      starts_at: Date;
      ready_expires_at: Date;
      ends_at: Date;
    }>(
      `select attempt.amateur_duel_match_id as attempt_match_id,
              attempt.status as attempt_status, segment.duel_match_id as segment_match_id,
              segment.kind as segment_kind, duel.starts_at, duel.ready_expires_at, duel.ends_at
         from tournament_fixture_attempt attempt
         join tournament_fixture_segment segment
           on segment.fixture_id = attempt.fixture_id and segment.duel_match_id = attempt.amateur_duel_match_id
         join amateur_duel_match duel on duel.id = attempt.amateur_duel_match_id
        where attempt.fixture_id = $1`,
      [row.fixture_id],
    );
    expect(persisted.rows).toEqual([
      {
        attempt_match_id: first.duelMatchId,
        attempt_status: 'ready_check',
        segment_match_id: first.duelMatchId,
        segment_kind: 'regulation',
        starts_at: row.scheduled_starts_at,
        ready_expires_at: row.readiness_expires_at,
        ends_at: row.hard_deadline_at,
      },
    ]);
  });

  it('opens from frozen attempt gameplay rules after its template is edited and deleted', async () => {
    const tournament = await createPublished(
      pool,
      'attempt-frozen-template-rules',
      lifecycleRules(),
    );
    await preparePlayoffs(pool, tournament.id);
    await startTournamentPlayoffs(pool, tournament.id, new Date('2030-09-03T00:00:00.000Z'));
    const fixtureResult = await pool.query<{
      fixture_id: string;
      home_user_id: string;
      scheduled_starts_at: Date;
    }>(
      `select fixture.id as fixture_id, home.user_id as home_user_id,
              attempt.scheduled_starts_at
         from tournament_fixture fixture
         join tournament_round round on round.id = fixture.round_id
         join tournament_fixture_attempt attempt on attempt.fixture_id = fixture.id
         join tournament_participant home on home.id = fixture.home_participant_id
        where fixture.tournament_id = $1 and round.stage = 'playoff' and round.number = 1
          and (fixture.result_snapshot->>'gameNumber')::int = 1
        order by fixture.fixture_number
        limit 1`,
      [tournament.id],
    );
    const fixture = fixtureResult.rows[0]!;
    await pool.query(
      `update amateur_duel_template
          set duel_kind = 'express', duel_variant = 'time_attack', total_periods = 1,
              shots_per_period = 1, period_duration_ms = 1000, break_duration_ms = 0,
              goalie_id = 'brickwall',
              period_speed_presets = $2::jsonb, period_rules = $3::jsonb,
              deleted_at = now()
        where id = $1`,
      [
        TEMPLATE_ID,
        JSON.stringify([
          {
            periodNumber: 1,
            goalFrequency: 1,
            goalieFrequency: 1,
            shooterFrequency: 1,
            puckSpeedPerMs: 2,
          },
        ]),
        JSON.stringify([
          { periodNumber: 1, mode: 'time_attack', durationMs: 1000, shotsLimit: null },
        ]),
      ],
    );

    const opened = await openTournamentFixtureSegment(
      pool,
      {
        fixtureId: fixture.fixture_id,
        tournamentId: tournament.id,
        userId: fixture.home_user_id,
        now: fixture.scheduled_starts_at,
      },
      createTournamentDuelMatch,
    );
    const match = await pool.query<{ rules_snapshot: Record<string, unknown> }>(
      `select rules_snapshot from amateur_duel_match where id = $1`,
      [opened.duelMatchId],
    );
    expect(match.rows[0]!.rules_snapshot).toMatchObject({
      duelKind: 'classic',
      duelVariant: 'classic',
      totalPeriods: 2,
      shotsPerPeriod: 30,
      breakDurationMs: 30_000,
      goalieId: 'rookie',
      periodRules: [
        { periodNumber: 1, mode: 'quota', durationMs: 60_000, shotsLimit: 30 },
        { periodNumber: 2, mode: 'quota', durationMs: 120_000, shotsLimit: 30 },
      ],
      periodSpeedPresets: [
        { periodNumber: 1, puckSpeedPerMs: 1 },
        { periodNumber: 2, puckSpeedPerMs: 1 },
      ],
    });
  });

  it('reconciles an expired unopened attempt instead of creating a late duel', async () => {
    const tournament = await createPublished(pool, 'attempt-open-reconcile', lifecycleRules());
    await preparePlayoffs(pool, tournament.id);
    await startTournamentPlayoffs(pool, tournament.id, new Date('2030-09-03T00:00:00.000Z'));
    const fixture = await pool.query<{
      fixture_id: string;
      home_user_id: string;
      readiness_expires_at: Date;
    }>(
      `select fixture.id as fixture_id, home.user_id as home_user_id,
              attempt.readiness_expires_at
         from tournament_fixture fixture
         join tournament_round round on round.id = fixture.round_id
         join tournament_fixture_attempt attempt on attempt.fixture_id = fixture.id
         join tournament_participant home on home.id = fixture.home_participant_id
        where fixture.tournament_id = $1 and round.stage = 'playoff' and round.number = 1
          and (fixture.result_snapshot->>'gameNumber')::int = 1
        order by fixture.fixture_number limit 1`,
      [tournament.id],
    );
    const row = fixture.rows[0]!;

    const openExpired = () =>
      openTournamentFixtureSegment(
        pool,
        {
          fixtureId: row.fixture_id,
          tournamentId: tournament.id,
          userId: row.home_user_id,
          now: new Date(row.readiness_expires_at.getTime() + 1),
        },
        createTournamentDuelMatch,
      );
    await expect(openExpired()).rejects.toThrow('tournament attempt is not playable');
    await expect(openExpired()).rejects.toThrow('not playable');

    const persisted = await pool.query<{
      attempt_status: string;
      fixture_status: string;
      series_status: string;
      tournament_status: string;
      duel_match_id: string | null;
      incident_count: number;
    }>(
      `select attempt.status as attempt_status, fixture.status as fixture_status,
              series.status as series_status, tournament.status as tournament_status,
              attempt.amateur_duel_match_id as duel_match_id,
              (select count(*)::int from tournament_incident incident
                where incident.fixture_attempt_id = attempt.id
                  and incident.kind = 'both_no_show') as incident_count
         from tournament_fixture_attempt attempt
         join tournament_fixture fixture on fixture.id = attempt.fixture_id
         join tournament_playoff_series series on series.id = fixture.series_id
         join tournament tournament on tournament.id = fixture.tournament_id
        where attempt.fixture_id = $1`,
      [row.fixture_id],
    );
    expect(persisted.rows[0]).toEqual({
      attempt_status: 'needs_reschedule',
      fixture_status: 'paused',
      series_status: 'paused',
      tournament_status: 'playoff',
      duel_match_id: null,
      incident_count: 1,
    });
  });

  it('mirrors ready timestamps from the existing duel endpoint into a tournament attempt', async () => {
    const tournament = await createPublished(pool, 'attempt-ready-mirror', lifecycleRules());
    await preparePlayoffs(pool, tournament.id);
    await startTournamentPlayoffs(pool, tournament.id, new Date('2030-09-03T00:00:00.000Z'));
    const fixture = await pool.query<{
      fixture_id: string;
      home_user_id: string;
      away_user_id: string;
      scheduled_starts_at: Date;
      hard_deadline_at: Date;
      scheduled_starts_at: Date;
    }>(
      `select fixture.id as fixture_id, home.user_id as home_user_id,
              away.user_id as away_user_id, attempt.scheduled_starts_at
         from tournament_fixture fixture
         join tournament_round round on round.id = fixture.round_id
         join tournament_fixture_attempt attempt on attempt.fixture_id = fixture.id
         join tournament_participant home on home.id = fixture.home_participant_id
         join tournament_participant away on away.id = fixture.away_participant_id
        where fixture.tournament_id = $1 and round.stage = 'playoff' and round.number = 1
          and (fixture.result_snapshot->>'gameNumber')::int = 1
        order by fixture.fixture_number limit 1`,
      [tournament.id],
    );
    const row = fixture.rows[0]!;
    await pool.query(
      `insert into push_subscriptions (user_id, endpoint, p256dh, auth)
       values ($1, $2, 'test-p256dh', 'test-auth')`,
      [row.away_user_id, `https://push.example.test/tournament-ready/${row.away_user_id}`],
    );
    const opened = await openTournamentFixtureSegment(
      pool,
      {
        fixtureId: row.fixture_id,
        tournamentId: tournament.id,
        userId: row.home_user_id,
        now: new Date(row.scheduled_starts_at.getTime() + 1),
      },
      createTournamentDuelMatch,
    );
    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    const homeToken = await jwt.issueAccessToken({ sub: row.home_user_id });

    const ready = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${opened.duelMatchId}/ready`,
      headers: { authorization: `Bearer ${homeToken}` },
      payload: { loadout: {} },
    });

    expect(ready.statusCode).toBe(200);
    const persisted = await pool.query<{
      attempt_home_ready_at: Date | null;
      attempt_away_ready_at: Date | null;
      participant_ready_at: Date | null;
    }>(
      `select attempt.home_ready_at as attempt_home_ready_at,
              attempt.away_ready_at as attempt_away_ready_at,
              participant.ready_at as participant_ready_at
         from tournament_fixture_attempt attempt
         join amateur_duel_participant participant
           on participant.match_id = attempt.amateur_duel_match_id
          and participant.user_id = $2
        where attempt.fixture_id = $1`,
      [row.fixture_id, row.home_user_id],
    );
    expect(persisted.rows[0]!.participant_ready_at).not.toBeNull();
    expect(persisted.rows[0]!.attempt_home_ready_at).toEqual(
      persisted.rows[0]!.participant_ready_at,
    );
    expect(persisted.rows[0]!.attempt_away_ready_at).toBeNull();
    const opponentReadyPush = await pool.query<{ event_type: string; event_key: string }>(
      `select event_type, event_key from push_delivery_log
        where user_id = $1 and event_type = 'tournament.opponent_ready'`,
      [row.away_user_id],
    );
    expect(opponentReadyPush.rows).toEqual([
      expect.objectContaining({
        event_type: 'tournament.opponent_ready',
        event_key: expect.stringContaining(opened.duelMatchId),
      }),
    ]);
    const directMessage = await pool.query<{ content: string; metadata: Record<string, unknown> }>(
      `select message.content, message.metadata
         from messages message
         join chats chat on chat.id = message.chat_id and chat.type = 'direct'
         join chat_members recipient
           on recipient.chat_id = chat.id and recipient.user_id = $1
        where message.sender_id = $2
        order by message.created_at desc
        limit 1`,
      [row.away_user_id, OFFICIAL_ID],
    );
    expect(directMessage.rows[0]).toEqual(
      expect.objectContaining({
        content: expect.stringContaining('подтвердил готовность'),
        metadata: expect.objectContaining({
          type: 'tournament_announcement',
          tournamentId: tournament.id,
        }),
      }),
    );
    const unread = await app.inject({
      method: 'GET',
      url: '/chat/unread',
      headers: {
        authorization: `Bearer ${await jwt.issueAccessToken({ sub: row.away_user_id })}`,
      },
    });
    expect(unread.statusCode).toBe(200);
    expect(Object.values(unread.json() as Record<string, number>)).toContain(1);
  });

  it('sets the hard deadline from the second player becoming ready', async () => {
    const tournament = await createPublished(
      pool,
      'attempt-ready-deadline',
      lifecycleRules(true, 120),
    );
    await preparePlayoffs(pool, tournament.id);
    await startTournamentPlayoffs(pool, tournament.id, new Date('2030-09-03T00:00:00.000Z'));
    const fixture = await pool.query<{
      fixture_id: string;
      home_user_id: string;
      away_user_id: string;
      scheduled_starts_at: Date;
      hard_deadline_at: Date;
    }>(
      `select fixture.id as fixture_id, home.user_id as home_user_id,
              away.user_id as away_user_id, attempt.scheduled_starts_at,
              attempt.hard_deadline_at
         from tournament_fixture fixture
         join tournament_round round on round.id = fixture.round_id
         join tournament_fixture_attempt attempt on attempt.fixture_id = fixture.id
         join tournament_participant home on home.id = fixture.home_participant_id
         join tournament_participant away on away.id = fixture.away_participant_id
        where fixture.tournament_id = $1 and round.stage = 'playoff' and round.number = 1
          and (fixture.result_snapshot->>'gameNumber')::int = 1
        order by fixture.fixture_number limit 1`,
      [tournament.id],
    );
    const row = fixture.rows[0]!;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2030-09-03T12:00:00.000Z'));
    const scheduledStartsAt = new Date(Date.now() - 60_000);
    const readinessExpiresAt = new Date(scheduledStartsAt.getTime() + 120 * 60_000);
    const initialHardDeadlineAt = new Date(readinessExpiresAt.getTime() + 20 * 60_000);
    await pool.query(
      `update tournament_fixture_attempt
          set scheduled_starts_at = $2, readiness_expires_at = $3, hard_deadline_at = $4
        where fixture_id = $1`,
      [row.fixture_id, scheduledStartsAt, readinessExpiresAt, initialHardDeadlineAt],
    );
    await pool.query(
      `update tournament_fixture
          set scheduled_starts_at = $2, window_ends_at = $3
        where id = $1`,
      [row.fixture_id, scheduledStartsAt, initialHardDeadlineAt],
    );
    const opened = await openTournamentFixtureSegment(
      pool,
      {
        fixtureId: row.fixture_id,
        tournamentId: tournament.id,
        userId: row.home_user_id,
        now: new Date(scheduledStartsAt.getTime() + 1),
      },
      createTournamentDuelMatch,
    );
    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    const homeToken = await jwt.issueAccessToken({ sub: row.home_user_id });
    const awayToken = await jwt.issueAccessToken({ sub: row.away_user_id });
    try {
      const homeReady = await app.inject({
        method: 'POST',
        url: `/duel/amateur/matches/${opened.duelMatchId}/ready`,
        headers: { authorization: `Bearer ${homeToken}` },
        payload: { loadout: {} },
      });
      expect(homeReady.statusCode).toBe(200);
      vi.setSystemTime(new Date('2030-09-03T12:07:00.000Z'));
      const awayReady = await app.inject({
        method: 'POST',
        url: `/duel/amateur/matches/${opened.duelMatchId}/ready`,
        headers: { authorization: `Bearer ${awayToken}` },
        payload: { loadout: {} },
      });
      expect(awayReady.statusCode).toBe(200);

      const expectedHardDeadlineAt = new Date('2030-09-03T12:27:00.000Z');
      const deadlineRows = await pool.query<{
        hard_deadline_at: Date;
        window_ends_at: Date;
        ends_at: Date;
      }>(
        `select attempt.hard_deadline_at, fixture.window_ends_at, duel.ends_at
           from tournament_fixture_attempt attempt
           join tournament_fixture fixture on fixture.id = attempt.fixture_id
           join amateur_duel_match duel on duel.id = attempt.amateur_duel_match_id
          where attempt.fixture_id = $1`,
        [row.fixture_id],
      );
      expect(deadlineRows.rows[0]).toEqual({
        hard_deadline_at: expectedHardDeadlineAt,
        window_ends_at: expectedHardDeadlineAt,
        ends_at: expectedHardDeadlineAt,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('migration preserves non-pending later-game attempts and their fixture slots', async () => {
    const tournament = await createPublished(pool, 'attempt-migration-preservation', lifecycleRules());
    await preparePlayoffs(pool, tournament.id);
    await startTournamentPlayoffs(pool, tournament.id, new Date('2030-09-03T00:00:00.000Z'));
    const laterFixtures = await pool.query<{ id: string; game_number: number }>(
      `select fixture.id, (fixture.result_snapshot->>'gameNumber')::int as game_number
         from tournament_fixture fixture
         join tournament_round round on round.id = fixture.round_id
        where fixture.tournament_id = $1 and round.stage = 'playoff'
          and (fixture.result_snapshot->>'gameNumber')::int > 1
        order by game_number, fixture.fixture_number
        limit 3`,
      [tournament.id],
    );
    expect(laterFixtures.rows.map((fixture) => fixture.game_number)).toEqual([2, 2, 3]);
    const startsAt = new Date('2030-09-05T07:00:00.000Z');
    const readinessExpiresAt = new Date('2030-09-05T07:05:00.000Z');
    const deadlineAt = new Date('2030-09-05T07:25:00.000Z');
    for (const [index, status] of ['pending', 'active', 'needs_admin_decision'].entries()) {
      const fixture = laterFixtures.rows[index]!;
      await pool.query(
        `insert into tournament_fixture_attempt
           (fixture_id, attempt_number, kind, status, scheduled_starts_at,
            readiness_expires_at, hard_deadline_at, is_result_bearing)
         values ($1, 1, 'initial', $2, $3, $4, $5, true)`,
        [fixture.id, status, startsAt, readinessExpiresAt, deadlineAt],
      );
      await pool.query(
        `update tournament_fixture
            set scheduled_starts_at = $2, window_ends_at = $3
          where id = $1`,
        [fixture.id, startsAt, deadlineAt],
      );
    }

    await pool.query(await readFile(SEQUENTIAL_PLAYOFF_SCHEDULE_MIGRATION_URL, 'utf8'));

    const afterMigration = await pool.query<{
      game_number: number;
      attempt_status: string | null;
      scheduled_starts_at: Date | null;
      window_ends_at: Date | null;
    }>(
      `select (fixture.result_snapshot->>'gameNumber')::int as game_number,
              attempt.status as attempt_status,
              fixture.scheduled_starts_at,
              fixture.window_ends_at
         from tournament_fixture fixture
         left join tournament_fixture_attempt attempt on attempt.fixture_id = fixture.id
        where fixture.id = any($1::uuid[])
        order by (fixture.result_snapshot->>'gameNumber')::int, fixture.id`,
      [laterFixtures.rows.map((fixture) => fixture.id)],
    );
    expect(afterMigration.rows).toHaveLength(3);
    expect(afterMigration.rows).toEqual(expect.arrayContaining([
      {
        game_number: 2,
        attempt_status: null,
        scheduled_starts_at: null,
        window_ends_at: null,
      },
      {
        game_number: 2,
        attempt_status: 'active',
        scheduled_starts_at: startsAt,
        window_ends_at: deadlineAt,
      },
      {
        game_number: 3,
        attempt_status: 'needs_admin_decision',
        scheduled_starts_at: startsAt,
        window_ends_at: deadlineAt,
      },
    ]));
  });

  it('keeps tournament readiness separate from local loadout confirmation', async () => {
    const { fixture, opened } = await openFirstPlayoffAttempt(pool, 'attempt-ready-separate-loadout');
    const items = await pool.query<{ id: string; item_kind: 'stick' | 'skates' | 'nutrition' }>(
      `insert into admin_inventory_items
       (photo_url, title, description, price_rub, item_kind, charges_per_purchase,
          duel_period_cost, power_score, rarity, resource_unit)
       values ('', 'Tournament stick', '', 0, 'stick', 10, 0, 10, 'epic', 'shot'),
              ('', 'Tournament skates', '', 0, 'skates', 10, 1, 10, 'epic', 'period'),
              ('', 'Tournament nutrition', '', 0, 'nutrition', 10, 1, 10, 'epic', 'period')
       returning id, item_kind`,
    );
    const idFor = (kind: 'stick' | 'skates' | 'nutrition') =>
      items.rows.find((item) => item.item_kind === kind)!.id;
    await pool.query(
      `insert into user_inventory_item (user_id, inventory_item_id, charges_available)
       values ($1, $2, 4), ($1, $3, 4), ($1, $4, 4)`,
      [fixture.home_user_id, idFor('stick'), idFor('skates'), idFor('nutrition')],
    );
    await pool.query(
      `insert into user_equipment
         (user_id, equipped_stick_item_id, equipped_skates_item_id, equipped_nutrition_item_id)
       values ($1, $2, $3, $4)`,
      [fixture.home_user_id, idFor('stick'), idFor('skates'), idFor('nutrition')],
    );
    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    const homeToken = await jwt.issueAccessToken({ sub: fixture.home_user_id });

    const ready = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${opened.duelMatchId}/ready`,
      headers: { authorization: `Bearer ${homeToken}` },
      payload: {},
    });

    expect(ready.statusCode).toBe(200);
    expect(ready.json().match.me).toMatchObject({ state: 'ready', loadout: { items: [] } });
    const attempt = await pool.query<{ home_ready_at: Date | null; status: string }>(
      `select home_ready_at, status from tournament_fixture_attempt where fixture_id = $1`,
      [fixture.fixture_id],
    );
    expect(attempt.rows).toEqual([{ home_ready_at: expect.any(Date), status: 'ready_check' }]);

    const awayToken = await jwt.issueAccessToken({ sub: fixture.away_user_id });
    const awayReady = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${opened.duelMatchId}/ready`,
      headers: { authorization: `Bearer ${awayToken}` },
      payload: {},
    });
    expect(awayReady.statusCode).toBe(200);

    const confirmLoadout = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${opened.duelMatchId}/tournament-loadout`,
      headers: { authorization: `Bearer ${homeToken}` },
      payload: { loadout: {} },
    });
    expect(confirmLoadout.statusCode).toBe(200);
    expect(confirmLoadout.json().match.me.loadout.items.map((item: { kind: string }) => item.kind))
      .toEqual(['stick', 'skates', 'nutrition']);
    const repeatedConfirmation = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${opened.duelMatchId}/tournament-loadout`,
      headers: { authorization: `Bearer ${homeToken}` },
      payload: { loadout: {} },
    });
    expect(repeatedConfirmation.statusCode).toBe(200);
    const participant = await pool.query<{
      reserved_inventory_charges: number;
      stick: string | null;
      skates: string | null;
      nutrition: string | null;
    }>(
      `select participant.reserved_inventory_charges,
              equipment.equipped_stick_item_id as stick,
              equipment.equipped_skates_item_id as skates,
              equipment.equipped_nutrition_item_id as nutrition
         from amateur_duel_participant participant
         join user_equipment equipment on equipment.user_id = participant.user_id
        where participant.match_id = $1 and participant.user_id = $2`,
      [opened.duelMatchId, fixture.home_user_id],
    );
    expect(participant.rows).toEqual([{
      reserved_inventory_charges: 2,
      stick: idFor('stick'),
      skates: idFor('skates'),
      nutrition: idFor('nutrition'),
    }]);
    const inventory = await pool.query<{ inventory_item_id: string; charges_available: number; charges_reserved: number }>(
      `select inventory_item_id, charges_available, charges_reserved from user_inventory_item
        where user_id = $1 order by inventory_item_id`,
      [fixture.home_user_id],
    );
    expect(inventory.rows).toEqual(
      [
        { inventory_item_id: idFor('stick'), charges_available: 4, charges_reserved: 0 },
        { inventory_item_id: idFor('skates'), charges_available: 3, charges_reserved: 1 },
        { inventory_item_id: idFor('nutrition'), charges_available: 3, charges_reserved: 1 },
      ].sort((left, right) => left.inventory_item_id.localeCompare(right.inventory_item_id)),
    );

    const started = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${opened.duelMatchId}/period/start`,
      headers: { authorization: `Bearer ${homeToken}` },
      payload: {},
    });
    expect(started.statusCode).toBe(200);
    const repeatedStart = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${opened.duelMatchId}/period/start`,
      headers: { authorization: `Bearer ${homeToken}` },
      payload: {},
    });
    expect(repeatedStart.statusCode).toBe(200);
  });

  it('preserves a pre-092 active tournament full-match reserve through start and terminal cleanup', async () => {
    const { fixture, opened } = await openFirstPlayoffAttempt(pool, 'attempt-legacy-loadout');
    const item = await pool.query<{ id: string }>(
      `insert into admin_inventory_items
         (photo_url, title, description, price_rub, item_kind, charges_per_purchase,
          duel_period_cost, power_score, rarity, resource_unit, effect_fatigue_speed_multiplier)
       values ('', 'Legacy skates', '', 0, 'skates', 3, 1, 10, 'epic', 'period', 0.8)
       returning id`,
    );
    const skatesId = item.rows[0]!.id;
    await pool.query(
      `insert into user_inventory_item (user_id, inventory_item_id, charges_available)
       values ($1, $2, 3)`,
      [fixture.home_user_id, skatesId],
    );
    await pool.query(
      `insert into user_equipment (user_id, equipped_skates_item_id) values ($1, $2)`,
      [fixture.home_user_id, skatesId],
    );
    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    for (const userId of [fixture.home_user_id, fixture.away_user_id]) {
      const token = await jwt.issueAccessToken({ sub: userId });
      const ready = await app.inject({
        method: 'POST',
        url: `/duel/amateur/matches/${opened.duelMatchId}/ready`,
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });
      expect(ready.statusCode).toBe(200);
    }
    const homeToken = await jwt.issueAccessToken({ sub: fixture.home_user_id });
    const boundarySetup = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${opened.duelMatchId}/tournament-loadout`,
      headers: { authorization: `Bearer ${homeToken}` },
      payload: { loadout: {} },
    });
    expect(boundarySetup.statusCode).toBe(200);
    await pool.query(
      `update user_inventory_item
          set charges_available = charges_available - 1,
              charges_reserved = charges_reserved + 1
        where user_id = $1 and inventory_item_id = $2`,
      [fixture.home_user_id, skatesId],
    );
    await pool.query(
      `update amateur_duel_participant
          set loadout_snapshot = jsonb_set(loadout_snapshot, '{items,0,chargesReserved}', '2'::jsonb),
              reserved_inventory_charges = 2,
              tournament_loadout_period = null,
              tournament_loadout_version = 0,
              tournament_loadout_confirmed_at = null
        where match_id = $1 and user_id = $2`,
      [opened.duelMatchId, fixture.home_user_id],
    );
    await pool.query(
      `update amateur_duel_match
          set rules_snapshot = rules_snapshot - 'tournamentLoadoutLifecycleVersion'
        where id = $1`,
      [opened.duelMatchId],
    );
    const legacyBefore = await pool.query<{
      loadout_snapshot: unknown;
      inventory_effects_snapshot: unknown;
    }>(
      `select loadout_snapshot, inventory_effects_snapshot
         from amateur_duel_participant
        where match_id = $1 and user_id = $2`,
      [opened.duelMatchId, fixture.home_user_id],
    );

    const forbiddenConfirmation = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${opened.duelMatchId}/tournament-loadout`,
      headers: { authorization: `Bearer ${homeToken}` },
      payload: { loadout: {} },
    });
    expect(forbiddenConfirmation.statusCode).toBe(409);

    const started = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${opened.duelMatchId}/period/start`,
      headers: { authorization: `Bearer ${homeToken}` },
      payload: {},
    });
    expect(started.statusCode).toBe(200);
    const afterStart = await pool.query<{
      charges_available: number;
      charges_reserved: number;
      reserved_inventory_charges: number;
      consumed_inventory_charges: number;
      tournament_loadout_period: number | null;
      inventory_report: Array<{ consumed: Array<{ title: string; charges: number }> }>;
    }>(
      `select inventory.charges_available, inventory.charges_reserved,
              participant.reserved_inventory_charges, participant.consumed_inventory_charges,
              participant.tournament_loadout_period, participant.inventory_report
         from amateur_duel_participant participant
         join user_inventory_item inventory
           on inventory.user_id = participant.user_id and inventory.inventory_item_id = $3
        where participant.match_id = $1 and participant.user_id = $2`,
      [opened.duelMatchId, fixture.home_user_id, skatesId],
    );
    expect(afterStart.rows[0]).toMatchObject({
      charges_available: 1,
      charges_reserved: 1,
      reserved_inventory_charges: 2,
      consumed_inventory_charges: 1,
      tournament_loadout_period: null,
    });
    expect(afterStart.rows[0]!.inventory_report.flatMap((entry) => entry.consumed)).toMatchObject([
      { title: 'Legacy skates', charges: 1 },
    ]);

    const terminalClient = await pool.connect();
    try {
      await terminalClient.query('begin');
      expect(
        await cancelTournamentDuel(terminalClient, {
          duelMatchId: opened.duelMatchId,
          reason: 'test_legacy_loadout_cleanup',
        }),
      ).toBe(true);
      await terminalClient.query('commit');
    } finally {
      await terminalClient.query('rollback').catch(() => undefined);
      terminalClient.release();
    }
    const afterTerminal = await pool.query<{
      charges_available: number;
      charges_reserved: number;
      reserved_inventory_charges: number;
      consumed_inventory_charges: number;
      tournament_loadout_period: number | null;
      tournament_loadout_version: number;
      tournament_loadout_confirmed_at: Date | null;
      loadout_snapshot: unknown;
      inventory_effects_snapshot: unknown;
      inventory_report: Array<{ consumed: Array<{ title: string; charges: number }> }>;
    }>(
      `select inventory.charges_available, inventory.charges_reserved,
              participant.reserved_inventory_charges, participant.consumed_inventory_charges,
              participant.tournament_loadout_period, participant.tournament_loadout_version,
              participant.tournament_loadout_confirmed_at, participant.loadout_snapshot,
              participant.inventory_effects_snapshot, participant.inventory_report
         from amateur_duel_participant participant
         join user_inventory_item inventory
           on inventory.user_id = participant.user_id and inventory.inventory_item_id = $3
        where participant.match_id = $1 and participant.user_id = $2`,
      [opened.duelMatchId, fixture.home_user_id, skatesId],
    );
    expect(afterTerminal.rows[0]).toMatchObject({
      charges_available: 2,
      charges_reserved: 0,
      reserved_inventory_charges: 2,
      consumed_inventory_charges: 2,
      tournament_loadout_period: null,
      tournament_loadout_version: 0,
      tournament_loadout_confirmed_at: null,
      loadout_snapshot: legacyBefore.rows[0]!.loadout_snapshot,
      inventory_effects_snapshot: legacyBefore.rows[0]!.inventory_effects_snapshot,
    });
    expect(afterTerminal.rows[0]!.inventory_report.flatMap((entry) => entry.consumed)).toMatchObject([
      { title: 'Legacy skates', charges: 1 },
    ]);
  });

  it('returns the current active tournament state when readiness is retried after activation', async () => {
    const { fixture, opened } = await openFirstPlayoffAttempt(pool, 'attempt-ready-retry-active');
    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    const homeToken = await jwt.issueAccessToken({ sub: fixture.home_user_id });
    const awayToken = await jwt.issueAccessToken({ sub: fixture.away_user_id });
    const firstHomeReady = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${opened.duelMatchId}/ready`,
      headers: { authorization: `Bearer ${homeToken}` },
      payload: {},
    });
    expect(firstHomeReady.statusCode).toBe(200);
    const activated = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${opened.duelMatchId}/ready`,
      headers: { authorization: `Bearer ${awayToken}` },
      payload: {},
    });
    expect(activated.statusCode).toBe(200);
    const beforeRetry = await pool.query<{
      accepted_at: Date;
      ready_at: Date;
      updated_at: Date;
      home_ready_at: Date;
      inventory_events: number;
    }>(
      `select match.accepted_at, participant.ready_at, participant.updated_at,
              attempt.home_ready_at,
              (select count(*)::int from event_log event
                where event.user_id = participant.user_id
                  and event.type = 'amateur_duel_inventory_reserved') as inventory_events
         from amateur_duel_match match
         join amateur_duel_participant participant
           on participant.match_id = match.id and participant.user_id = $2
         join tournament_fixture_segment segment on segment.duel_match_id = match.id
         join tournament_fixture_attempt attempt on attempt.fixture_id = segment.fixture_id
        where match.id = $1`,
      [opened.duelMatchId, fixture.home_user_id],
    );

    const retried = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${opened.duelMatchId}/ready`,
      headers: { authorization: `Bearer ${homeToken}` },
      payload: {},
    });
    expect(retried.statusCode).toBe(200);
    expect(retried.json().match).toMatchObject({
      id: opened.duelMatchId,
      status: 'active',
      me: { state: 'accepted' },
    });
    const afterRetry = await pool.query<{
      accepted_at: Date;
      ready_at: Date;
      updated_at: Date;
      home_ready_at: Date;
      inventory_events: number;
    }>(
      `select match.accepted_at, participant.ready_at, participant.updated_at,
              attempt.home_ready_at,
              (select count(*)::int from event_log event
                where event.user_id = participant.user_id
                  and event.type = 'amateur_duel_inventory_reserved') as inventory_events
         from amateur_duel_match match
         join amateur_duel_participant participant
           on participant.match_id = match.id and participant.user_id = $2
         join tournament_fixture_segment segment on segment.duel_match_id = match.id
         join tournament_fixture_attempt attempt on attempt.fixture_id = segment.fixture_id
        where match.id = $1`,
      [opened.duelMatchId, fixture.home_user_id],
    );
    expect(afterRetry.rows).toEqual(beforeRetry.rows);
  });

  it('clears a confirmed zero-reserve tournament boundary during terminal cleanup', async () => {
    const { fixture, opened } = await openFirstPlayoffAttempt(pool, 'attempt-zero-reserve-cleanup');
    const item = await pool.query<{ id: string }>(
      `insert into admin_inventory_items
         (photo_url, title, description, price_rub, item_kind, charges_per_purchase,
          duel_period_cost, power_score, rarity, resource_unit)
       values ('', 'Zero-reserve stick', '', 0, 'stick', 3, 0, 10, 'epic', 'shot')
       returning id`,
    );
    const stickId = item.rows[0]!.id;
    await pool.query(
      `insert into user_inventory_item (user_id, inventory_item_id, charges_available)
       values ($1, $2, 3)`,
      [fixture.home_user_id, stickId],
    );
    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    for (const userId of [fixture.home_user_id, fixture.away_user_id]) {
      const token = await jwt.issueAccessToken({ sub: userId });
      const ready = await app.inject({
        method: 'POST',
        url: `/duel/amateur/matches/${opened.duelMatchId}/ready`,
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });
      expect(ready.statusCode).toBe(200);
    }
    const homeToken = await jwt.issueAccessToken({ sub: fixture.home_user_id });
    const confirmed = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${opened.duelMatchId}/tournament-loadout`,
      headers: { authorization: `Bearer ${homeToken}` },
      payload: { loadout: { stick: stickId, skates: null, nutrition: null } },
    });
    expect(confirmed.statusCode).toBe(200);
    const beforeTerminal = await pool.query<{
      tournament_loadout_period: number | null;
      tournament_loadout_confirmed_at: Date | null;
      reserved_inventory_charges: number;
    }>(
      `select tournament_loadout_period, tournament_loadout_confirmed_at,
              reserved_inventory_charges
         from amateur_duel_participant
        where match_id = $1 and user_id = $2`,
      [opened.duelMatchId, fixture.home_user_id],
    );
    expect(beforeTerminal.rows[0]).toMatchObject({
      tournament_loadout_period: 1,
      tournament_loadout_confirmed_at: expect.any(Date),
      reserved_inventory_charges: 0,
    });

    const terminalClient = await pool.connect();
    try {
      await terminalClient.query('begin');
      expect(
        await cancelTournamentDuel(terminalClient, {
          duelMatchId: opened.duelMatchId,
          reason: 'test_zero_reserve_cleanup',
        }),
      ).toBe(true);
      await terminalClient.query('commit');
    } finally {
      await terminalClient.query('rollback').catch(() => undefined);
      terminalClient.release();
    }
    const afterTerminal = await pool.query<{
      tournament_loadout_period: number | null;
      tournament_loadout_confirmed_at: Date | null;
      reserved_inventory_charges: number;
      charges_available: number;
      charges_reserved: number;
    }>(
      `select participant.tournament_loadout_period,
              participant.tournament_loadout_confirmed_at,
              participant.reserved_inventory_charges,
              inventory.charges_available, inventory.charges_reserved
         from amateur_duel_participant participant
         join user_inventory_item inventory
           on inventory.user_id = participant.user_id and inventory.inventory_item_id = $3
        where participant.match_id = $1 and participant.user_id = $2`,
      [opened.duelMatchId, fixture.home_user_id, stickId],
    );
    expect(afterTerminal.rows).toEqual([{
      tournament_loadout_period: null,
      tournament_loadout_confirmed_at: null,
      reserved_inventory_charges: 0,
      charges_available: 3,
      charges_reserved: 0,
    }]);
  });

  it('versions tournament loadout at each period boundary without releasing consumed charges', async () => {
    await pool.query(
      `update amateur_duel_template
          set shots_per_period = 1,
              period_rules = $2::jsonb
        where id = $1`,
      [
        TEMPLATE_ID,
        JSON.stringify([
          { periodNumber: 1, mode: 'quota', durationMs: 60_000, shotsLimit: 1 },
          { periodNumber: 2, mode: 'quota', durationMs: 60_000, shotsLimit: 1 },
        ]),
      ],
    );
    const { fixture, opened } = await openFirstPlayoffAttempt(pool, 'attempt-loadout-boundaries');
    const items = await pool.query<{
      id: string;
      item_kind: 'stick' | 'skates' | 'nutrition';
      title: string;
    }>(
      `insert into admin_inventory_items
         (photo_url, title, description, price_rub, item_kind, charges_per_purchase,
          duel_period_cost, power_score, rarity, resource_unit, effect_shot_zone_multiplier)
       values ('', 'A stick', '', 0, 'stick', 10, 0, 10, 'epic', 'shot', 1.5),
              ('', 'A skates', '', 0, 'skates', 10, 1, 10, 'epic', 'period', 1),
              ('', 'A nutrition', '', 0, 'nutrition', 10, 1, 10, 'epic', 'period', 1),
              ('', 'B stick', '', 0, 'stick', 10, 0, 10, 'epic', 'shot', 1.25),
              ('', 'B skates', '', 0, 'skates', 10, 1, 10, 'epic', 'period', 1),
              ('', 'B nutrition', '', 0, 'nutrition', 10, 1, 10, 'epic', 'period', 1)
       returning id, item_kind, title`,
    );
    const itemId = (title: string) => items.rows.find((item) => item.title === title)!.id;
    await pool.query(
      `insert into user_inventory_item (user_id, inventory_item_id, charges_available)
       values ($1, $2, 1), ($1, $3, 1), ($1, $4, 1),
              ($1, $5, 2), ($1, $6, 2), ($1, $7, 2)`,
      [
        fixture.home_user_id,
        itemId('A stick'),
        itemId('A skates'),
        itemId('A nutrition'),
        itemId('B stick'),
        itemId('B skates'),
        itemId('B nutrition'),
      ],
    );
    await pool.query(
      `insert into user_equipment
         (user_id, equipped_stick_item_id, equipped_skates_item_id, equipped_nutrition_item_id)
       values ($1, $2, $3, $4)`,
      [
        fixture.home_user_id,
        itemId('A stick'),
        itemId('A skates'),
        itemId('A nutrition'),
      ],
    );
    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    const homeToken = await jwt.issueAccessToken({ sub: fixture.home_user_id });
    for (const userId of [fixture.home_user_id, fixture.away_user_id]) {
      const token = await jwt.issueAccessToken({ sub: userId });
      const ready = await app.inject({
        method: 'POST',
        url: `/duel/amateur/matches/${opened.duelMatchId}/ready`,
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });
      expect(ready.statusCode).toBe(200);
    }

    const confirmDefaults = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${opened.duelMatchId}/tournament-loadout`,
      headers: { authorization: `Bearer ${homeToken}` },
      payload: { loadout: {} },
    });
    expect(confirmDefaults.statusCode).toBe(200);
    expect(
      confirmDefaults.json().match.me.loadout.items.map((item: { title: string }) => item.title),
    ).toEqual(['A stick', 'A skates', 'A nutrition']);

    const firstStart = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${opened.duelMatchId}/period/start`,
      headers: { authorization: `Bearer ${homeToken}` },
      payload: {},
    });
    expect(firstStart.statusCode).toBe(200);
    expect(firstStart.json().match.stick_effects).toEqual({
      shotZoneMultiplier: 1.5,
      rewardMultiplier: 1,
      streakGrowthMultiplier: 1,
    });
    const firstShot = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${opened.duelMatchId}/shot`,
      headers: { authorization: `Bearer ${homeToken}` },
      payload: { shot_index: 1, input: { tapTime: 0 }, claimed_result: 'miss' },
    });
    expect(firstShot.statusCode).toBe(200);
    const storedFirstShot = await pool.query<{
      seed: string;
      input_payload: {
        tapTime: number;
        puckSpeedPerMs: number;
        shooterFrequency: number;
        goalieFrequency: number;
        goalFrequency: number;
      };
      server_result: 'goal' | 'save' | 'miss';
    }>(
      `select seed, input_payload, server_result
         from shot_session
        where amateur_duel_match_id = $1 and user_id = $2 and period_number = 1 and shot_index = 1`,
      [opened.duelMatchId, fixture.home_user_id],
    );
    const stored = storedFirstShot.rows[0]!;
    const clientResult = resolvePerspectiveCourtShot(
      stored.input_payload,
      getGoalie('rookie'),
      stored.seed,
      1,
      firstStart.json().match.stick_effects,
      getSessionPhaseOffsets(firstStart.json().match.match_seed),
    );
    expect(stored.server_result).toBe(clientResult.type);
    await pool.query(
      `update amateur_duel_participant
          set break_started_at = now() - interval '31 seconds'
        where match_id = $1 and user_id = $2`,
      [opened.duelMatchId, fixture.home_user_id],
    );
    const afterBreak = await app.inject({
      method: 'GET',
      url: `/duel/amateur/matches/${opened.duelMatchId}`,
      headers: { authorization: `Bearer ${homeToken}` },
    });
    expect(afterBreak.statusCode).toBe(200);
    expect(afterBreak.json().match.me.state).toBe('accepted');
    const boundaryAfterBreak = await pool.query<{
      current_period: number;
      tournament_loadout_period: number | null;
      tournament_loadout_version: number;
      titles: string[];
      inventory_report: unknown[];
    }>(
      `select participant.current_period,
              participant.tournament_loadout_period,
              participant.tournament_loadout_version,
              participant.inventory_report,
              array(
                select item->>'title'
                  from jsonb_array_elements(participant.loadout_snapshot->'items') item
              ) as titles
         from amateur_duel_participant participant
        where participant.match_id = $1 and participant.user_id = $2`,
      [opened.duelMatchId, fixture.home_user_id],
    );
    expect(boundaryAfterBreak.rows[0]).toMatchObject({
      current_period: 1,
      tournament_loadout_period: 1,
      tournament_loadout_version: 1,
      titles: ['A stick', 'A skates', 'A nutrition'],
    });
    expect(boundaryAfterBreak.rows[0]!.inventory_report).toHaveLength(2);
    const reportAfterFirstPeriod = boundaryAfterBreak.rows[0]!.inventory_report;
    const carried = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${opened.duelMatchId}/tournament-loadout`,
      headers: { authorization: `Bearer ${homeToken}` },
      payload: { loadout: {} },
    });
    expect(carried.statusCode).toBe(200);
    expect(carried.json().match.me.loadout.items).toEqual([]);

    const selectB = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${opened.duelMatchId}/tournament-loadout`,
      headers: { authorization: `Bearer ${homeToken}` },
      payload: {
        loadout: {
          stick: itemId('B stick'),
          skates: itemId('B skates'),
          nutrition: itemId('B nutrition'),
        },
      },
    });
    expect(selectB.statusCode).toBe(200);
    expect(selectB.json().match.me.loadout.items.map((item: { title: string }) => item.title)).toEqual([
      'B stick',
      'B skates',
      'B nutrition',
    ]);
    const clearB = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${opened.duelMatchId}/tournament-loadout`,
      headers: { authorization: `Bearer ${homeToken}` },
      payload: { loadout: { stick: null, skates: null, nutrition: null } },
    });
    expect(clearB.statusCode).toBe(200);
    expect(clearB.json().match.me.loadout.items).toEqual([]);
    const selectBAgain = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${opened.duelMatchId}/tournament-loadout`,
      headers: { authorization: `Bearer ${homeToken}` },
      payload: {
        loadout: {
          stick: itemId('B stick'),
          skates: itemId('B skates'),
          nutrition: itemId('B nutrition'),
        },
      },
    });
    expect(selectBAgain.statusCode).toBe(200);
    const repeatedB = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${opened.duelMatchId}/tournament-loadout`,
      headers: { authorization: `Bearer ${homeToken}` },
      payload: {
        loadout: {
          stick: itemId('B stick'),
          skates: itemId('B skates'),
          nutrition: itemId('B nutrition'),
        },
      },
    });
    expect(repeatedB.statusCode).toBe(200);
    expect(repeatedB.json().match.me).toMatchObject({
      tournament_loadout_period: 2,
      tournament_loadout_version: 5,
    });

    const profile = await pool.query<{
      stick: string | null;
      skates: string | null;
      nutrition: string | null;
    }>(
      `select equipped_stick_item_id as stick,
              equipped_skates_item_id as skates,
              equipped_nutrition_item_id as nutrition
         from user_equipment where user_id = $1`,
      [fixture.home_user_id],
    );
    expect(profile.rows).toEqual([
      {
        stick: itemId('A stick'),
        skates: itemId('A skates'),
        nutrition: itemId('A nutrition'),
      },
    ]);
    const accounting = await pool.query<{
      title: string;
      charges_available: number;
      charges_reserved: number;
    }>(
      `select item.title, inventory.charges_available, inventory.charges_reserved
         from user_inventory_item inventory
         join admin_inventory_items item on item.id = inventory.inventory_item_id
        where inventory.user_id = $1 and item.title like any(array['A %', 'B %'])
        order by item.title`,
      [fixture.home_user_id],
    );
    expect(accounting.rows).toEqual([
      { title: 'A nutrition', charges_available: 0, charges_reserved: 0 },
      { title: 'A skates', charges_available: 0, charges_reserved: 0 },
      { title: 'A stick', charges_available: 0, charges_reserved: 0 },
      { title: 'B nutrition', charges_available: 1, charges_reserved: 1 },
      { title: 'B skates', charges_available: 1, charges_reserved: 1 },
      { title: 'B stick', charges_available: 2, charges_reserved: 0 },
    ]);
    const participant = await pool.query<{
      reserved_inventory_charges: number;
      consumed_inventory_charges: number;
      inventory_report: Array<{ periodNumber: number; consumed: Array<{ title: string }> }>;
    }>(
      `select reserved_inventory_charges, consumed_inventory_charges, inventory_report
         from amateur_duel_participant where match_id = $1 and user_id = $2`,
      [opened.duelMatchId, fixture.home_user_id],
    );
    expect(participant.rows[0]).toMatchObject({
      reserved_inventory_charges: 4,
      consumed_inventory_charges: 3,
    });
    expect(participant.rows[0]!.inventory_report).toEqual(reportAfterFirstPeriod);
    const available = accounting.rows.reduce((sum, item) => sum + item.charges_available, 0);
    const reserved = accounting.rows.reduce((sum, item) => sum + item.charges_reserved, 0);
    expect(available + reserved + participant.rows[0]!.consumed_inventory_charges).toBe(9);

    const terminalClient = await pool.connect();
    try {
      await terminalClient.query('begin');
      expect(
        await cancelTournamentDuel(terminalClient, {
          duelMatchId: opened.duelMatchId,
          reason: 'test_pending_boundary_cleanup',
        }),
      ).toBe(true);
      await terminalClient.query('commit');
    } finally {
      await terminalClient.query('rollback').catch(() => undefined);
      terminalClient.release();
    }
    const afterTerminal = await pool.query<{
      reserved_inventory_charges: number;
      consumed_inventory_charges: number;
      inventory_report: unknown[];
      b_reserved: number;
      b_available: number;
    }>(
      `select participant.reserved_inventory_charges,
              participant.consumed_inventory_charges,
              participant.inventory_report,
              inventory.charges_reserved as b_reserved,
              inventory.charges_available as b_available
         from amateur_duel_participant participant
         join user_inventory_item inventory
           on inventory.user_id = participant.user_id and inventory.inventory_item_id = $3
        where participant.match_id = $1 and participant.user_id = $2`,
      [opened.duelMatchId, fixture.home_user_id, itemId('B skates')],
    );
    expect(afterTerminal.rows[0]).toMatchObject({
      reserved_inventory_charges: 2,
      consumed_inventory_charges: 3,
      b_reserved: 0,
      b_available: 2,
    });
    expect(afterTerminal.rows[0]!.inventory_report).toEqual(reportAfterFirstPeriod);
  });

  it('debits dynamic tournament resources once when the same shot is retried', async () => {
    const { fixture, opened } = await openFirstPlayoffAttempt(pool, 'attempt-dynamic-resource-retry');
    const items = await pool.query<{
      id: string;
      title: string;
    }>(
      `insert into admin_inventory_items
         (photo_url, title, description, price_rub, item_kind, charges_per_purchase,
          duel_period_cost, power_score, rarity, resource_unit)
       values ('', 'Dynamic stick', '', 0, 'stick', 3, 0, 10, 'epic', 'shot'),
              ('', 'Dynamic skates', '', 0, 'skates', 10, 0, 10, 'epic', 'distance'),
              ('', 'Dynamic nutrition', '', 0, 'nutrition', 10000, 0, 10, 'epic', 'energy_ms')
       returning id, title`,
    );
    const itemId = (title: string) => items.rows.find((item) => item.title === title)!.id;
    await pool.query(
      `insert into user_inventory_item (user_id, inventory_item_id, charges_available)
       values ($1, $2, 3), ($1, $3, 10), ($1, $4, 10000)`,
      [
        fixture.home_user_id,
        itemId('Dynamic stick'),
        itemId('Dynamic skates'),
        itemId('Dynamic nutrition'),
      ],
    );
    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    for (const userId of [fixture.home_user_id, fixture.away_user_id]) {
      const token = await jwt.issueAccessToken({ sub: userId });
      const ready = await app.inject({
        method: 'POST',
        url: `/duel/amateur/matches/${opened.duelMatchId}/ready`,
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });
      expect(ready.statusCode).toBe(200);
    }
    const homeToken = await jwt.issueAccessToken({ sub: fixture.home_user_id });
    const confirmed = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${opened.duelMatchId}/tournament-loadout`,
      headers: { authorization: `Bearer ${homeToken}` },
      payload: {
        loadout: {
          stick: itemId('Dynamic stick'),
          skates: itemId('Dynamic skates'),
          nutrition: itemId('Dynamic nutrition'),
        },
      },
    });
    expect(confirmed.statusCode).toBe(200);
    const started = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${opened.duelMatchId}/period/start`,
      headers: { authorization: `Bearer ${homeToken}` },
      payload: {},
    });
    expect(started.statusCode).toBe(200);
    await pool.query(
      `update amateur_duel_participant
          set period_started_at = now() - interval '2000 milliseconds'
        where match_id = $1 and user_id = $2`,
      [opened.duelMatchId, fixture.home_user_id],
    );

    const shotPayload = {
      shot_index: 1,
      input: { tapTime: 2000 },
      claimed_result: 'miss',
    };
    const first = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${opened.duelMatchId}/shot`,
      headers: { authorization: `Bearer ${homeToken}` },
      payload: shotPayload,
    });
    expect(first.statusCode).toBe(200);

    const accountingAfterFirst = await pool.query<{
      title: string;
      charges_available: number;
      charges_reserved: number;
    }>(
      `select item.title, inventory.charges_available, inventory.charges_reserved
         from user_inventory_item inventory
         join admin_inventory_items item on item.id = inventory.inventory_item_id
        where inventory.user_id = $1 and item.title like 'Dynamic %'
        order by item.title`,
      [fixture.home_user_id],
    );
    expect(accountingAfterFirst.rows).toEqual([
      { title: 'Dynamic nutrition', charges_available: 8000, charges_reserved: 0 },
      { title: 'Dynamic skates', charges_available: 8, charges_reserved: 0 },
      { title: 'Dynamic stick', charges_available: 2, charges_reserved: 0 },
    ]);
    const participantAfterFirst = await pool.query<{
      consumed_inventory_charges: number;
      inventory_report: Array<{
        consumed: Array<{ title: string; charges: number }>;
      }>;
    }>(
      `select consumed_inventory_charges, inventory_report
         from amateur_duel_participant
        where match_id = $1 and user_id = $2`,
      [opened.duelMatchId, fixture.home_user_id],
    );
    const consumedAfterFirst = participantAfterFirst.rows[0]!.inventory_report
      .flatMap((entry) => entry.consumed)
      .map((item) => ({ title: item.title, charges: item.charges }))
      .sort((left, right) => left.title.localeCompare(right.title));
    expect(consumedAfterFirst).toEqual([
      { title: 'Dynamic nutrition', charges: 2000 },
      { title: 'Dynamic skates', charges: 2 },
      { title: 'Dynamic stick', charges: 1 },
    ]);
    expect(participantAfterFirst.rows[0]!.consumed_inventory_charges).toBe(2003);

    const retried = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${opened.duelMatchId}/shot`,
      headers: { authorization: `Bearer ${homeToken}` },
      payload: shotPayload,
    });
    expect(retried.statusCode).toBe(409);
    expect(retried.json().error.message).toContain('shot_index mismatch');

    const accountingAfterRetry = await pool.query<{
      title: string;
      charges_available: number;
      charges_reserved: number;
    }>(
      `select item.title, inventory.charges_available, inventory.charges_reserved
         from user_inventory_item inventory
         join admin_inventory_items item on item.id = inventory.inventory_item_id
        where inventory.user_id = $1 and item.title like 'Dynamic %'
        order by item.title`,
      [fixture.home_user_id],
    );
    expect(accountingAfterRetry.rows).toEqual(accountingAfterFirst.rows);
    const afterRetry = await pool.query<{
      consumed_inventory_charges: number;
      inventory_report: unknown;
      shot_count: number;
    }>(
      `select participant.consumed_inventory_charges,
              participant.inventory_report,
              (select count(*)::int
                 from shot_session shot
                where shot.amateur_duel_match_id = participant.match_id
                  and shot.user_id = participant.user_id) as shot_count
         from amateur_duel_participant participant
        where participant.match_id = $1 and participant.user_id = $2`,
      [opened.duelMatchId, fixture.home_user_id],
    );
    expect(afterRetry.rows[0]).toEqual({
      consumed_inventory_charges: 2003,
      inventory_report: participantAfterFirst.rows[0]!.inventory_report,
      shot_count: 1,
    });
    const initialByTitle = new Map([
      ['Dynamic nutrition', 10000],
      ['Dynamic skates', 10],
      ['Dynamic stick', 3],
    ]);
    const consumedByTitle = new Map(consumedAfterFirst.map((item) => [item.title, item.charges]));
    for (const row of accountingAfterRetry.rows) {
      expect(row.charges_available + row.charges_reserved + consumedByTitle.get(row.title)!).toBe(
        initialByTitle.get(row.title),
      );
    }
  });

  it('inherits the latest tournament-local selection in the next game of the same series', async () => {
    const { fixture, opened } = await openFirstPlayoffAttempt(pool, 'attempt-loadout-next-game');
    const stick = await pool.query<{ id: string }>(
      `insert into admin_inventory_items
         (photo_url, title, description, price_rub, item_kind, charges_per_purchase,
          duel_period_cost, power_score, rarity, resource_unit)
       values ('', 'Series-only stick', '', 0, 'stick', 10, 0, 10, 'epic', 'shot')
       returning id`,
    );
    const stickId = stick.rows[0]!.id;
    await pool.query(
      `insert into user_inventory_item (user_id, inventory_item_id, charges_available)
       values ($1, $2, 5)`,
      [fixture.home_user_id, stickId],
    );
    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    for (const userId of [fixture.home_user_id, fixture.away_user_id]) {
      const token = await jwt.issueAccessToken({ sub: userId });
      const ready = await app.inject({
        method: 'POST',
        url: `/duel/amateur/matches/${opened.duelMatchId}/ready`,
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });
      expect(ready.statusCode).toBe(200);
    }
    const homeToken = await jwt.issueAccessToken({ sub: fixture.home_user_id });
    const firstConfirmed = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${opened.duelMatchId}/tournament-loadout`,
      headers: { authorization: `Bearer ${homeToken}` },
      payload: { loadout: { stick: stickId, skates: null, nutrition: null } },
    });
    expect(firstConfirmed.statusCode).toBe(200);

    const fixtureContext = await pool.query<{
      tournament_id: string;
      round_id: string;
      series_id: string;
      home_participant_id: string;
      away_participant_id: string;
      arena_theme_id: string;
      arena_snapshot: Record<string, unknown>;
    }>(
      `select fixture.tournament_id, fixture.round_id, fixture.series_id,
              fixture.home_participant_id, fixture.away_participant_id,
              duel.arena_theme_id, duel.arena_snapshot
         from tournament_fixture fixture
         join tournament_fixture_segment segment on segment.fixture_id = fixture.id
         join amateur_duel_match duel on duel.id = segment.duel_match_id
        where fixture.id = $1`,
      [fixture.fixture_id],
    );
    const context = fixtureContext.rows[0]!;
    const now = new Date();
    const secondClient = await pool.connect();
    let secondMatchId: string;
    try {
      await secondClient.query('begin');
      const created = await createTournamentDuelMatch(
        secondClient,
        {
          templateId: TEMPLATE_ID,
          homeUserId: fixture.home_user_id,
          awayUserId: fixture.away_user_id,
          startsAt: new Date(now.getTime() - 1_000),
          endsAt: new Date(now.getTime() + 60 * 60_000),
          readyExpiresAt: new Date(now.getTime() + 5 * 60_000),
          autoContinue: true,
          now,
          venue: {
            mode: 'home_selected',
            homeUserId: fixture.home_user_id,
            arenaThemeId: context.arena_theme_id,
            arena: context.arena_snapshot as Parameters<
              typeof createTournamentDuelMatch
            >[1]['venue']['arena'],
          },
        },
        DAILY_SEED_SECRET,
      );
      secondMatchId = created.matchId;
      const nextFixture = await secondClient.query<{ id: string }>(
        `insert into tournament_fixture
           (tournament_id, round_id, series_id, fixture_number,
            home_participant_id, away_participant_id, scheduled_starts_at,
            window_ends_at, status, result_snapshot)
         select $1, $2, $3, max(fixture_number) + 1, $4, $5, $6, $7, 'active',
                '{"gameNumber":2}'::jsonb
           from tournament_fixture where tournament_id = $1
         returning id`,
        [
          context.tournament_id,
          context.round_id,
          context.series_id,
          context.home_participant_id,
          context.away_participant_id,
          now,
          new Date(now.getTime() + 60 * 60_000),
        ],
      );
      await secondClient.query(
        `insert into tournament_fixture_segment
           (fixture_id, sequence_number, kind, duel_match_id, status, rules_snapshot)
         values ($1, 1, 'regulation', $2, 'active', '{}'::jsonb)`,
        [nextFixture.rows[0]!.id, secondMatchId],
      );
      await secondClient.query('commit');
    } finally {
      await secondClient.query('rollback').catch(() => undefined);
      secondClient.release();
    }

    const beforeConfirmation = await app.inject({
      method: 'GET',
      url: `/duel/amateur/matches/${secondMatchId!}`,
      headers: { authorization: `Bearer ${homeToken}` },
    });
    expect(beforeConfirmation.statusCode).toBe(200);
    expect(beforeConfirmation.json().match.me.loadout.items).toMatchObject([
      { id: stickId, kind: 'stick', title: 'Series-only stick' },
    ]);

    const carried = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${secondMatchId!}/tournament-loadout`,
      headers: { authorization: `Bearer ${homeToken}` },
      payload: { loadout: {} },
    });
    expect(carried.statusCode).toBe(200);
    expect(carried.json().match.me.loadout.items).toMatchObject([
      { id: stickId, kind: 'stick', title: 'Series-only stick' },
    ]);
    const profile = await pool.query(`select 1 from user_equipment where user_id = $1`, [
      fixture.home_user_id,
    ]);
    expect(profile.rowCount).toBe(0);
  });

  it('marks the linked tournament attempt active after both players become ready', async () => {
    const { fixture, opened } = await openFirstPlayoffAttempt(pool, 'attempt-ready-active');
    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    for (const userId of [fixture.home_user_id, fixture.away_user_id]) {
      const token = await jwt.issueAccessToken({ sub: userId });
      const ready = await app.inject({
        method: 'POST',
        url: `/duel/amateur/matches/${opened.duelMatchId}/ready`,
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });
      expect(ready.statusCode).toBe(200);
    }

    const attempt = await pool.query<{
      status: string;
      home_ready_at: Date | null;
      away_ready_at: Date | null;
    }>(
      `select status, home_ready_at, away_ready_at
         from tournament_fixture_attempt
        where fixture_id = $1`,
      [fixture.fixture_id],
    );
    expect(attempt.rows[0]!.status).toBe('active');
    expect(attempt.rows[0]!.home_ready_at).not.toBeNull();
    expect(attempt.rows[0]!.away_ready_at).not.toBeNull();
  });

  it('settles a single-ready readiness expiry as one idempotent technical result', async () => {
    const { fixture, opened } = await openFirstPlayoffAttempt(pool, 'attempt-single-ready-expiry');
    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    const homeToken = await jwt.issueAccessToken({ sub: fixture.home_user_id });
    const firstReady = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${opened.duelMatchId}/ready`,
      headers: { authorization: `Bearer ${homeToken}` },
      payload: { loadout: {} },
    });
    expect(firstReady.statusCode).toBe(200);
    const now = new Date();
    const scheduledStartsAt = new Date(now.getTime() - 300_000);
    const readinessExpiredAt = new Date(now.getTime() - 1_000);
    const hardDeadlineAt = new Date(now.getTime() + 600_000);
    await pool.query(
      `update tournament_fixture_attempt
          set scheduled_starts_at = $2, readiness_expires_at = $3, hard_deadline_at = $4
        where fixture_id = $1`,
      [fixture.fixture_id, scheduledStartsAt, readinessExpiredAt, hardDeadlineAt],
    );
    await pool.query(
      `update amateur_duel_match
          set starts_at = $2, ready_expires_at = $3, ends_at = $4
        where id = $1`,
      [opened.duelMatchId, scheduledStartsAt, readinessExpiredAt, hardDeadlineAt],
    );
    await pool.query(
      `update tournament_fixture set scheduled_starts_at = $2, window_ends_at = $3 where id = $1`,
      [fixture.fixture_id, scheduledStartsAt, hardDeadlineAt],
    );

    for (let request = 0; request < 2; request += 1) {
      const state = await app.inject({
        method: 'GET',
        url: `/duel/amateur/matches/${opened.duelMatchId}`,
        headers: { authorization: `Bearer ${homeToken}` },
      });
      expect(state.statusCode).toBe(200);
    }

    const persisted = await pool.query<{
      attempt_status: string;
      attempt_outcome: string | null;
      attempt_winner: string | null;
      fixture_status: string;
      fixture_outcome: string | null;
      fixture_winner: string | null;
      home_score: number;
      away_score: number;
      tournament_status: string;
      series_wins: number;
      duel_status: string;
      settled_reason: string | null;
      adjustment_count: number;
      rating_count: number;
      shot_count: number;
    }>(
      `select attempt.status as attempt_status, attempt.outcome as attempt_outcome,
              attempt.winner_participant_id as attempt_winner,
              fixture.status as fixture_status, fixture.outcome as fixture_outcome,
              fixture.winner_participant_id as fixture_winner,
              fixture.home_score, fixture.away_score, tournament.status as tournament_status,
              (series.higher_seed_wins + series.lower_seed_wins)::int as series_wins,
              duel.status as duel_status, duel.settled_reason,
              (select count(*)::int from tournament_adjustment adjustment
                where adjustment.fixture_id = fixture.id
                  and adjustment.reason = 'tournament_attempt_away_no_show') as adjustment_count,
              (select count(*)::int from amateur_duel_rating) as rating_count,
              (select count(*)::int from shot_session
                where amateur_duel_match_id = duel.id) as shot_count
         from tournament_fixture_attempt attempt
         join tournament_fixture fixture on fixture.id = attempt.fixture_id
         join tournament tournament on tournament.id = fixture.tournament_id
         join tournament_playoff_series series on series.id = fixture.series_id
         join amateur_duel_match duel on duel.id = attempt.amateur_duel_match_id
        where attempt.fixture_id = $1`,
      [fixture.fixture_id],
    );
    expect(persisted.rows[0]).toEqual({
      attempt_status: 'technical_result',
      attempt_outcome: 'away_no_show',
      attempt_winner: fixture.home_participant_id,
      fixture_status: 'settled',
      fixture_outcome: 'home_win',
      fixture_winner: fixture.home_participant_id,
      home_score: 0,
      away_score: 0,
      tournament_status: 'playoff',
      series_wins: 1,
      duel_status: 'cancelled',
      settled_reason: 'tournament_attempt_away_no_show',
      adjustment_count: 1,
      rating_count: 0,
      shot_count: 0,
    });
  });

  it('commits late ready reconciliation before returning its terminal conflict', async () => {
    const { fixture, opened } = await openFirstPlayoffAttempt(
      pool,
      'attempt-late-ready-reconciliation',
    );
    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    const homeToken = await jwt.issueAccessToken({ sub: fixture.home_user_id });
    const awayToken = await jwt.issueAccessToken({ sub: fixture.away_user_id });
    const firstReady = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${opened.duelMatchId}/ready`,
      headers: { authorization: `Bearer ${homeToken}` },
      payload: { loadout: {} },
    });
    expect(firstReady.statusCode).toBe(200);

    const now = new Date();
    const scheduledStartsAt = new Date(now.getTime() - 300_000);
    const readinessExpiredAt = new Date(now.getTime() - 1_000);
    const hardDeadlineAt = new Date(now.getTime() + 600_000);
    await pool.query(
      `update tournament_fixture_attempt
          set scheduled_starts_at = $2, readiness_expires_at = $3, hard_deadline_at = $4
        where fixture_id = $1`,
      [fixture.fixture_id, scheduledStartsAt, readinessExpiredAt, hardDeadlineAt],
    );
    await pool.query(
      `update amateur_duel_match
          set starts_at = $2, ready_expires_at = $3, ends_at = $4
        where id = $1`,
      [opened.duelMatchId, scheduledStartsAt, readinessExpiredAt, hardDeadlineAt],
    );

    const lateReady = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${opened.duelMatchId}/ready`,
      headers: { authorization: `Bearer ${awayToken}` },
      payload: { loadout: {} },
    });
    expect(lateReady.statusCode).toBe(409);

    const persisted = await pool.query<{
      attempt_status: string;
      attempt_outcome: string | null;
      fixture_status: string;
      fixture_winner: string | null;
      series_wins: number;
      duel_status: string;
      adjustment_count: number;
    }>(
      `select attempt.status as attempt_status, attempt.outcome as attempt_outcome,
              fixture.status as fixture_status,
              fixture.winner_participant_id as fixture_winner,
              (series.higher_seed_wins + series.lower_seed_wins)::int as series_wins,
              duel.status as duel_status,
              (select count(*)::int from tournament_adjustment adjustment
                where adjustment.fixture_id = fixture.id
                  and adjustment.reason = 'tournament_attempt_away_no_show') as adjustment_count
         from tournament_fixture_attempt attempt
         join tournament_fixture fixture on fixture.id = attempt.fixture_id
         join tournament_playoff_series series on series.id = fixture.series_id
         join amateur_duel_match duel on duel.id = attempt.amateur_duel_match_id
        where attempt.fixture_id = $1`,
      [fixture.fixture_id],
    );
    expect(persisted.rows[0]).toEqual({
      attempt_status: 'technical_result',
      attempt_outcome: 'away_no_show',
      fixture_status: 'settled',
      fixture_winner: fixture.home_participant_id,
      series_wins: 1,
      duel_status: 'cancelled',
      adjustment_count: 1,
    });
  });

  it('pauses only the fixture and series once when neither player becomes ready', async () => {
    const { fixture, opened } = await openFirstPlayoffAttempt(pool, 'attempt-both-no-show');
    const now = new Date();
    const scheduledStartsAt = new Date(now.getTime() - 300_000);
    const readinessExpiredAt = new Date(now.getTime() - 1_000);
    const hardDeadlineAt = new Date(now.getTime() + 600_000);
    await pool.query(
      `update tournament_fixture_attempt
          set scheduled_starts_at = $2, readiness_expires_at = $3, hard_deadline_at = $4
        where fixture_id = $1`,
      [fixture.fixture_id, scheduledStartsAt, readinessExpiredAt, hardDeadlineAt],
    );
    await pool.query(
      `update amateur_duel_match
          set starts_at = $2, ready_expires_at = $3, ends_at = $4
        where id = $1`,
      [opened.duelMatchId, scheduledStartsAt, readinessExpiredAt, hardDeadlineAt],
    );
    await pool.query(
      `update tournament_fixture set scheduled_starts_at = $2, window_ends_at = $3 where id = $1`,
      [fixture.fixture_id, scheduledStartsAt, hardDeadlineAt],
    );
    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    const homeToken = await jwt.issueAccessToken({ sub: fixture.home_user_id });

    for (let request = 0; request < 2; request += 1) {
      const state = await app.inject({
        method: 'GET',
        url: `/duel/amateur/matches/${opened.duelMatchId}`,
        headers: { authorization: `Bearer ${homeToken}` },
      });
      expect(state.statusCode).toBe(200);
    }

    const persisted = await pool.query<{
      attempt_status: string;
      attempt_outcome: string | null;
      fixture_status: string;
      series_status: string;
      tournament_status: string;
      duel_status: string;
      settled_reason: string | null;
      incident_count: number;
    }>(
      `select attempt.status as attempt_status, attempt.outcome as attempt_outcome,
              fixture.status as fixture_status, series.status as series_status,
              tournament.status as tournament_status, duel.status as duel_status,
              duel.settled_reason,
              (select count(*)::int from tournament_incident incident
                where incident.fixture_attempt_id = attempt.id
                  and incident.kind = 'both_no_show' and incident.status = 'open') as incident_count
         from tournament_fixture_attempt attempt
         join tournament_fixture fixture on fixture.id = attempt.fixture_id
         join tournament_playoff_series series on series.id = fixture.series_id
         join tournament tournament on tournament.id = fixture.tournament_id
         join amateur_duel_match duel on duel.id = attempt.amateur_duel_match_id
        where attempt.fixture_id = $1`,
      [fixture.fixture_id],
    );
    expect(persisted.rows[0]).toEqual({
      attempt_status: 'needs_reschedule',
      attempt_outcome: 'both_no_show',
      fixture_status: 'paused',
      series_status: 'paused',
      tournament_status: 'playoff',
      duel_status: 'cancelled',
      settled_reason: 'tournament_attempt_both_no_show',
      incident_count: 1,
    });
  });

  it('reschedules a paused attempt after both players miss readiness', async () => {
    const { tournamentId, fixture, opened } = await openFirstPlayoffAttempt(
      pool,
      'attempt-both-no-show-reschedule',
    );
    const now = new Date();
    const scheduledStartsAt = new Date(now.getTime() - 300_000);
    const readinessExpiredAt = new Date(now.getTime() - 1_000);
    const hardDeadlineAt = new Date(now.getTime() + 600_000);
    await pool.query(
      `update tournament_fixture_attempt
          set scheduled_starts_at = $2, readiness_expires_at = $3, hard_deadline_at = $4
        where fixture_id = $1`,
      [fixture.fixture_id, scheduledStartsAt, readinessExpiredAt, hardDeadlineAt],
    );
    await pool.query(
      `update amateur_duel_match
          set starts_at = $2, ready_expires_at = $3, ends_at = $4
        where id = $1`,
      [opened.duelMatchId, scheduledStartsAt, readinessExpiredAt, hardDeadlineAt],
    );
    await pool.query(
      `update tournament_fixture set scheduled_starts_at = $2, window_ends_at = $3 where id = $1`,
      [fixture.fixture_id, scheduledStartsAt, hardDeadlineAt],
    );
    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    const homeToken = await jwt.issueAccessToken({ sub: fixture.home_user_id });
    const state = await app.inject({
      method: 'GET',
      url: `/duel/amateur/matches/${opened.duelMatchId}`,
      headers: { authorization: `Bearer ${homeToken}` },
    });
    expect(state.statusCode).toBe(200);

    const newStartsAt = new Date(now.getTime() + 3_600_000);
    const newEndsAt = new Date(newStartsAt.getTime() + 900_000);
    await rescheduleTournamentFixture(pool, {
      tournamentId,
      fixtureId: fixture.fixture_id,
      startsAt: newStartsAt,
      endsAt: newEndsAt,
      reason: 'integration reschedule after both no show',
      adminUserId: ADMIN_ID,
    });

    const persisted = await pool.query<{
      attempt_status: string;
      attempt_outcome: string | null;
      attempt_duel_id: string | null;
      home_ready_at: Date | null;
      away_ready_at: Date | null;
      fixture_status: string;
      series_status: string;
      duel_status: string;
      incident_status: string;
    }>(
      `select attempt.status as attempt_status, attempt.outcome as attempt_outcome,
              attempt.amateur_duel_match_id as attempt_duel_id,
              attempt.home_ready_at, attempt.away_ready_at,
              fixture.status as fixture_status, series.status as series_status,
              duel.status as duel_status, incident.status as incident_status
         from tournament_fixture_attempt attempt
         join tournament_fixture fixture on fixture.id = attempt.fixture_id
         join tournament_playoff_series series on series.id = fixture.series_id
         join amateur_duel_match duel on duel.id = $2
         join tournament_incident incident on incident.fixture_attempt_id = attempt.id
        where attempt.fixture_id = $1`,
      [fixture.fixture_id, opened.duelMatchId],
    );
    expect(persisted.rows[0]).toEqual({
      attempt_status: 'pending',
      attempt_outcome: null,
      attempt_duel_id: null,
      home_ready_at: null,
      away_ready_at: null,
      fixture_status: 'scheduled',
      series_status: 'scheduled',
      duel_status: 'cancelled',
      incident_status: 'resolved',
    });
  });

  it('awards one technical win at the hard deadline when only one player completed', async () => {
    const { fixture, opened } = await openFirstPlayoffAttempt(
      pool,
      'attempt-one-completed-deadline',
    );
    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    const homeToken = await jwt.issueAccessToken({ sub: fixture.home_user_id });
    for (const userId of [fixture.home_user_id, fixture.away_user_id]) {
      const token = await jwt.issueAccessToken({ sub: userId });
      const ready = await app.inject({
        method: 'POST',
        url: `/duel/amateur/matches/${opened.duelMatchId}/ready`,
        headers: { authorization: `Bearer ${token}` },
        payload: { loadout: {} },
      });
      expect(ready.statusCode).toBe(200);
    }
    const now = new Date();
    const scheduledStartsAt = new Date(now.getTime() - 600_000);
    const readinessExpiresAt = new Date(now.getTime() - 540_000);
    const hardDeadlineAt = new Date(now.getTime() - 1_000);
    await pool.query(
      `update tournament_fixture_attempt
          set scheduled_starts_at = $2, readiness_expires_at = $3, hard_deadline_at = $4
        where fixture_id = $1`,
      [fixture.fixture_id, scheduledStartsAt, readinessExpiresAt, hardDeadlineAt],
    );
    await pool.query(
      `update tournament_fixture set scheduled_starts_at = $2, window_ends_at = $3 where id = $1`,
      [fixture.fixture_id, scheduledStartsAt, hardDeadlineAt],
    );
    await pool.query(`update amateur_duel_match set starts_at = $2, ends_at = $3 where id = $1`, [
      opened.duelMatchId,
      scheduledStartsAt,
      hardDeadlineAt,
    ]);
    await pool.query(
      `update amateur_duel_participant
          set state = 'completed', completed_at = $3
        where match_id = $1 and user_id = $2`,
      [opened.duelMatchId, fixture.home_user_id, hardDeadlineAt],
    );

    for (let request = 0; request < 2; request += 1) {
      const state = await app.inject({
        method: 'GET',
        url: `/duel/amateur/matches/${opened.duelMatchId}`,
        headers: { authorization: `Bearer ${homeToken}` },
      });
      expect(state.statusCode).toBe(200);
    }

    const persisted = await pool.query<{
      attempt_status: string;
      attempt_outcome: string | null;
      attempt_winner: string | null;
      fixture_status: string;
      fixture_outcome: string | null;
      fixture_winner: string | null;
      series_wins: number;
      duel_status: string;
      settled_reason: string | null;
      adjustment_count: number;
    }>(
      `select attempt.status as attempt_status, attempt.outcome as attempt_outcome,
              attempt.winner_participant_id as attempt_winner,
              fixture.status as fixture_status, fixture.outcome as fixture_outcome,
              fixture.winner_participant_id as fixture_winner,
              (series.higher_seed_wins + series.lower_seed_wins)::int as series_wins,
              duel.status as duel_status, duel.settled_reason,
              (select count(*)::int from tournament_adjustment adjustment
                where adjustment.fixture_id = fixture.id
                  and adjustment.reason = 'tournament_attempt_away_incomplete') as adjustment_count
         from tournament_fixture_attempt attempt
         join tournament_fixture fixture on fixture.id = attempt.fixture_id
         join tournament_playoff_series series on series.id = fixture.series_id
         join amateur_duel_match duel on duel.id = attempt.amateur_duel_match_id
        where attempt.fixture_id = $1`,
      [fixture.fixture_id],
    );
    expect(persisted.rows[0]).toEqual({
      attempt_status: 'technical_result',
      attempt_outcome: 'home_win',
      attempt_winner: fixture.home_participant_id,
      fixture_status: 'settled',
      fixture_outcome: 'home_win',
      fixture_winner: fixture.home_participant_id,
      series_wins: 1,
      duel_status: 'cancelled',
      settled_reason: 'tournament_attempt_away_incomplete',
      adjustment_count: 1,
    });
  });

  it('opens one admin incident when neither player completed by the hard deadline', async () => {
    const { fixture, opened } = await openFirstPlayoffAttempt(
      pool,
      'attempt-both-incomplete-deadline',
    );
    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    const homeToken = await jwt.issueAccessToken({ sub: fixture.home_user_id });
    for (const userId of [fixture.home_user_id, fixture.away_user_id]) {
      const token = await jwt.issueAccessToken({ sub: userId });
      const ready = await app.inject({
        method: 'POST',
        url: `/duel/amateur/matches/${opened.duelMatchId}/ready`,
        headers: { authorization: `Bearer ${token}` },
        payload: { loadout: {} },
      });
      expect(ready.statusCode).toBe(200);
    }
    const now = new Date();
    const scheduledStartsAt = new Date(now.getTime() - 600_000);
    const readinessExpiresAt = new Date(now.getTime() - 540_000);
    const hardDeadlineAt = new Date(now.getTime() - 1_000);
    await pool.query(
      `update tournament_fixture_attempt
          set scheduled_starts_at = $2, readiness_expires_at = $3, hard_deadline_at = $4
        where fixture_id = $1`,
      [fixture.fixture_id, scheduledStartsAt, readinessExpiresAt, hardDeadlineAt],
    );
    await pool.query(
      `update tournament_fixture set scheduled_starts_at = $2, window_ends_at = $3 where id = $1`,
      [fixture.fixture_id, scheduledStartsAt, hardDeadlineAt],
    );
    await pool.query(`update amateur_duel_match set starts_at = $2, ends_at = $3 where id = $1`, [
      opened.duelMatchId,
      scheduledStartsAt,
      hardDeadlineAt,
    ]);

    for (let request = 0; request < 2; request += 1) {
      const state = await app.inject({
        method: 'GET',
        url: `/duel/amateur/matches/${opened.duelMatchId}`,
        headers: { authorization: `Bearer ${homeToken}` },
      });
      expect(state.statusCode).toBe(200);
    }

    const persisted = await pool.query<{
      attempt_status: string;
      attempt_outcome: string | null;
      fixture_status: string;
      series_status: string;
      tournament_status: string;
      duel_status: string;
      settled_reason: string | null;
      incident_count: number;
    }>(
      `select attempt.status as attempt_status, attempt.outcome as attempt_outcome,
              fixture.status as fixture_status, series.status as series_status,
              tournament.status as tournament_status, duel.status as duel_status,
              duel.settled_reason,
              (select count(*)::int from tournament_incident incident
                where incident.fixture_attempt_id = attempt.id
                  and incident.kind = 'both_incomplete' and incident.status = 'open') as incident_count
         from tournament_fixture_attempt attempt
         join tournament_fixture fixture on fixture.id = attempt.fixture_id
         join tournament_playoff_series series on series.id = fixture.series_id
         join tournament tournament on tournament.id = fixture.tournament_id
         join amateur_duel_match duel on duel.id = attempt.amateur_duel_match_id
        where attempt.fixture_id = $1`,
      [fixture.fixture_id],
    );
    expect(persisted.rows[0]).toEqual({
      attempt_status: 'needs_admin_decision',
      attempt_outcome: 'both_incomplete',
      fixture_status: 'paused',
      series_status: 'paused',
      tournament_status: 'playoff',
      duel_status: 'cancelled',
      settled_reason: 'tournament_attempt_both_incomplete',
      incident_count: 1,
    });
  });

  it('settles an earned attempt from factual duel metrics exactly once', async () => {
    const { fixture, opened } = await openFirstPlayoffAttempt(pool, 'attempt-earned-winner');
    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    const homeToken = await jwt.issueAccessToken({ sub: fixture.home_user_id });
    for (const userId of [fixture.home_user_id, fixture.away_user_id]) {
      const token = await jwt.issueAccessToken({ sub: userId });
      const ready = await app.inject({
        method: 'POST',
        url: `/duel/amateur/matches/${opened.duelMatchId}/ready`,
        headers: { authorization: `Bearer ${token}` },
        payload: { loadout: {} },
      });
      expect(ready.statusCode).toBe(200);
    }
    await pool.query(
      `update amateur_duel_participant
          set state = 'completed', completed_at = now(),
              goals = case when user_id = $2 then 3 else 2 end,
              shots_taken = case when user_id = $2 then 5 else 4 end,
              active_duration_ms = case when user_id = $2 then 90000 else 110000 end
        where match_id = $1`,
      [opened.duelMatchId, fixture.home_user_id],
    );

    for (let request = 0; request < 2; request += 1) {
      const state = await app.inject({
        method: 'GET',
        url: `/duel/amateur/matches/${opened.duelMatchId}`,
        headers: { authorization: `Bearer ${homeToken}` },
      });
      expect(state.statusCode).toBe(200);
    }

    const persisted = await pool.query<{
      attempt_status: string;
      attempt_outcome: string | null;
      attempt_winner: string | null;
      home_score: number | null;
      away_score: number | null;
      home_accuracy: string | null;
      away_accuracy: string | null;
      home_active_time_ms: string | null;
      away_active_time_ms: string | null;
      snapshot: Record<string, unknown>;
      fixture_status: string;
      fixture_outcome: string | null;
      fixture_home_score: number;
      fixture_away_score: number;
      series_wins: number;
      segment_count: number;
      settled_segment_count: number;
    }>(
      `select attempt.status as attempt_status, attempt.outcome as attempt_outcome,
              attempt.winner_participant_id as attempt_winner,
              attempt.home_score, attempt.away_score,
              attempt.home_accuracy, attempt.away_accuracy,
              attempt.home_active_time_ms, attempt.away_active_time_ms,
              attempt.result_snapshot as snapshot,
              fixture.status as fixture_status, fixture.outcome as fixture_outcome,
              fixture.home_score as fixture_home_score,
              fixture.away_score as fixture_away_score,
              (series.higher_seed_wins + series.lower_seed_wins)::int as series_wins,
              (select count(*)::int from tournament_fixture_segment segment
                where segment.fixture_id = fixture.id) as segment_count,
              (select count(*)::int from tournament_fixture_segment segment
                where segment.fixture_id = fixture.id and segment.status = 'settled'
                  and segment.kind = 'regulation') as settled_segment_count
         from tournament_fixture_attempt attempt
         join tournament_fixture fixture on fixture.id = attempt.fixture_id
         join tournament_playoff_series series on series.id = fixture.series_id
        where attempt.fixture_id = $1`,
      [fixture.fixture_id],
    );
    const row = persisted.rows[0]!;
    expect(row).toMatchObject({
      attempt_status: 'settled',
      attempt_outcome: 'home_win',
      attempt_winner: fixture.home_participant_id,
      home_score: 3,
      away_score: 2,
      fixture_status: 'settled',
      fixture_outcome: 'home_win',
      fixture_home_score: 3,
      fixture_away_score: 2,
      series_wins: 1,
      segment_count: 1,
      settled_segment_count: 1,
    });
    expect(Number(row.home_accuracy)).toBe(60);
    expect(Number(row.away_accuracy)).toBe(50);
    expect(Number(row.home_active_time_ms)).toBe(90_000);
    expect(Number(row.away_active_time_ms)).toBe(110_000);
    expect(row.snapshot).toMatchObject({ homeShots: 5, awayShots: 4 });
  });

  it('does not settle an earned attempt from partial metrics after an early forfeit', async () => {
    const { fixture, opened } = await openFirstPlayoffAttempt(
      pool,
      'attempt-early-forfeit-partial-score',
    );
    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    const homeToken = await jwt.issueAccessToken({ sub: fixture.home_user_id });
    for (const userId of [fixture.home_user_id, fixture.away_user_id]) {
      const token = await jwt.issueAccessToken({ sub: userId });
      const ready = await app.inject({
        method: 'POST',
        url: `/duel/amateur/matches/${opened.duelMatchId}/ready`,
        headers: { authorization: `Bearer ${token}` },
        payload: { loadout: {} },
      });
      expect(ready.statusCode).toBe(200);
    }
    await pool.query(
      `update amateur_duel_participant
          set state = case when user_id = $2 then 'completed' else 'forfeit' end,
              completed_at = case when user_id = $2 then now() else null end,
              goals = case when user_id = $2 then 1 else 5 end,
              shots_taken = case when user_id = $2 then 2 else 5 end,
              active_duration_ms = case when user_id = $2 then 90000 else 30000 end
        where match_id = $1`,
      [opened.duelMatchId, fixture.home_user_id],
    );

    const state = await app.inject({
      method: 'GET',
      url: `/duel/amateur/matches/${opened.duelMatchId}`,
      headers: { authorization: `Bearer ${homeToken}` },
    });
    expect(state.statusCode).toBe(200);

    const persisted = await pool.query<{
      duel_status: string;
      attempt_status: string;
      attempt_winner: string | null;
      fixture_status: string;
      fixture_winner: string | null;
      series_wins: number;
    }>(
      `select duel.status as duel_status, attempt.status as attempt_status,
              attempt.winner_participant_id as attempt_winner,
              fixture.status as fixture_status,
              fixture.winner_participant_id as fixture_winner,
              (series.higher_seed_wins + series.lower_seed_wins)::int as series_wins
         from tournament_fixture_attempt attempt
         join tournament_fixture fixture on fixture.id = attempt.fixture_id
         join tournament_playoff_series series on series.id = fixture.series_id
         join amateur_duel_match duel on duel.id = attempt.amateur_duel_match_id
        where attempt.fixture_id = $1`,
      [fixture.fixture_id],
    );
    expect(persisted.rows[0]).toEqual({
      duel_status: 'active',
      attempt_status: 'active',
      attempt_winner: null,
      fixture_status: 'active',
      fixture_winner: null,
      series_wins: 0,
    });
  });

  it('keeps an Express rounded-accuracy replay as a draw in the linked duel', async () => {
    await pool.query(
      `update amateur_duel_template set is_active = false where duel_kind = 'express'`,
    );
    await pool.query(`update amateur_duel_template set duel_kind = 'express' where id = $1`, [
      TEMPLATE_ID,
    ]);
    const { fixture, opened } = await openFirstPlayoffAttempt(
      pool,
      'attempt-express-rounded-accuracy-replay',
    );
    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    const homeToken = await jwt.issueAccessToken({ sub: fixture.home_user_id });
    for (const userId of [fixture.home_user_id, fixture.away_user_id]) {
      const token = await jwt.issueAccessToken({ sub: userId });
      const ready = await app.inject({
        method: 'POST',
        url: `/duel/amateur/matches/${opened.duelMatchId}/ready`,
        headers: { authorization: `Bearer ${token}` },
        payload: { loadout: {} },
      });
      expect(ready.statusCode).toBe(200);
    }
    await pool.query(
      `update amateur_duel_participant
          set state = 'completed', completed_at = now(), goals = 30,
              shots_taken = case when user_id = $2 then 1000 else 1001 end,
              active_duration_ms = 90000
        where match_id = $1`,
      [opened.duelMatchId, fixture.home_user_id],
    );

    const state = await app.inject({
      method: 'GET',
      url: `/duel/amateur/matches/${opened.duelMatchId}`,
      headers: { authorization: `Bearer ${homeToken}` },
    });
    expect(state.statusCode).toBe(200);

    const persisted = await pool.query<{
      duel_status: string;
      duel_outcome: string | null;
      duel_winner: string | null;
      home_points: number;
      away_points: number;
      attempt_status: string;
      attempt_outcome: string | null;
      attempt_winner: string | null;
    }>(
      `select duel.status as duel_status, duel.outcome as duel_outcome,
              duel.winner_user_id as duel_winner,
              home_duel.result_points as home_points,
              away_duel.result_points as away_points,
              attempt.status as attempt_status, attempt.outcome as attempt_outcome,
              attempt.winner_participant_id as attempt_winner
         from tournament_fixture_attempt attempt
         join tournament_fixture fixture on fixture.id = attempt.fixture_id
         join amateur_duel_match duel on duel.id = attempt.amateur_duel_match_id
         join amateur_duel_participant home_duel
           on home_duel.match_id = duel.id and home_duel.user_id = $2
         join amateur_duel_participant away_duel
           on away_duel.match_id = duel.id and away_duel.user_id = $3
        where fixture.id = $1 and attempt.attempt_number = 1`,
      [fixture.fixture_id, fixture.home_user_id, fixture.away_user_id],
    );
    expect(persisted.rows[0]).toEqual({
      duel_status: 'settled',
      duel_outcome: 'draw',
      duel_winner: null,
      home_points: 1,
      away_points: 1,
      attempt_status: 'settled',
      attempt_outcome: 'replay',
      attempt_winner: null,
    });
  });

  it('creates and opens a regular replay with an immediate three-minute manual readiness window', async () => {
    const context = await createRegularReplay(pool, app, 'attempt-regular-replay-manual');
    expect(context.fixture.series_id).toBeNull();
    expect(context.replay.scheduled_starts_at.toISOString()).toBe(
      context.replay.initial_settled_at.toISOString(),
    );
    expect(
      context.replay.readiness_expires_at.getTime() - context.replay.scheduled_starts_at.getTime(),
    ).toBe(180_000);
    expect(
      context.replay.hard_deadline_at.getTime() - context.replay.scheduled_starts_at.getTime(),
    ).toBe(390_000);
    expect(context.replay.is_result_bearing).toBe(false);
    expect(context.replay.snapshot).toMatchObject({ readinessMode: 'manual_replay' });
    expect(context.replay.fixture_status).toBe('scheduled');

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(context.replay.scheduled_starts_at);
    try {
      const opened = await app.inject({
        method: 'POST',
        url: `/tournaments/${context.tournamentId}/fixtures/${context.fixture.fixture_id}/segments/open`,
        headers: { authorization: `Bearer ${context.homeToken}` },
      });
      expect(opened.statusCode).toBe(200);
    } finally {
      vi.useRealTimers();
    }

    const lifecycle = await pool.query<{
      attempt_status: string;
      home_ready_at: Date | null;
      away_ready_at: Date | null;
      duel_status: string;
      duel_ready_expires_at: Date;
      duel_ends_at: Date;
      participant_states: string[];
    }>(
      `select attempt.status as attempt_status, attempt.home_ready_at, attempt.away_ready_at,
              duel.status as duel_status, duel.ready_expires_at as duel_ready_expires_at,
              duel.ends_at as duel_ends_at,
              array_agg(participant.state order by participant.side) as participant_states
         from tournament_fixture_attempt attempt
         join amateur_duel_match duel on duel.id = attempt.amateur_duel_match_id
         join amateur_duel_participant participant on participant.match_id = duel.id
        where attempt.id = $1
        group by attempt.id, duel.id`,
      [context.replay.attempt_id],
    );
    expect(lifecycle.rows[0]).toMatchObject({
      attempt_status: 'ready_check',
      home_ready_at: null,
      away_ready_at: null,
      duel_status: 'ready_check',
      participant_states: ['loadout_pending', 'loadout_pending'],
    });
    expect(lifecycle.rows[0]!.duel_ready_expires_at.toISOString()).toBe(
      context.replay.readiness_expires_at.toISOString(),
    );
    expect(lifecycle.rows[0]!.duel_ends_at.toISOString()).toBe(
      context.replay.hard_deadline_at.toISOString(),
    );
  });

  it('settles a one-ready regular replay expiry as one technical result', async () => {
    const context = await createRegularReplay(pool, app, 'attempt-regular-replay-one-ready');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(context.replay.scheduled_starts_at);
    try {
      const opened = await app.inject({
        method: 'POST',
        url: `/tournaments/${context.tournamentId}/fixtures/${context.fixture.fixture_id}/segments/open`,
        headers: { authorization: `Bearer ${context.homeToken}` },
      });
      expect(opened.statusCode).toBe(200);
      const ready = await app.inject({
        method: 'POST',
        url: `/duel/amateur/matches/${opened.json().duelMatchId}/ready`,
        headers: { authorization: `Bearer ${context.homeToken}` },
        payload: { loadout: {} },
      });
      expect(ready.statusCode).toBe(200);

      vi.setSystemTime(new Date(context.replay.readiness_expires_at.getTime() + 1));
      for (let request = 0; request < 2; request += 1) {
        const state = await app.inject({
          method: 'GET',
          url: `/duel/amateur/matches/${opened.json().duelMatchId}`,
          headers: { authorization: `Bearer ${context.homeToken}` },
        });
        expect(state.statusCode).toBe(200);
      }
    } finally {
      vi.useRealTimers();
    }

    const persisted = await pool.query<{
      attempt_status: string;
      attempt_outcome: string | null;
      attempt_winner: string | null;
      fixture_status: string;
      fixture_winner: string | null;
      tournament_status: string;
      duel_status: string;
      settled_reason: string | null;
      adjustment_count: number;
      incident_count: number;
    }>(
      `select attempt.status as attempt_status, attempt.outcome as attempt_outcome,
              attempt.winner_participant_id as attempt_winner,
              fixture.status as fixture_status,
              fixture.winner_participant_id as fixture_winner,
              tournament.status as tournament_status,
              duel.status as duel_status, duel.settled_reason,
              (select count(*)::int from tournament_adjustment adjustment
                where adjustment.fixture_id = fixture.id
                  and adjustment.reason = 'tournament_attempt_away_no_show') as adjustment_count,
              (select count(*)::int from tournament_incident incident
                where incident.fixture_attempt_id = attempt.id) as incident_count
         from tournament_fixture_attempt attempt
         join tournament_fixture fixture on fixture.id = attempt.fixture_id
         join tournament tournament on tournament.id = fixture.tournament_id
         join amateur_duel_match duel on duel.id = attempt.amateur_duel_match_id
        where attempt.id = $1`,
      [context.replay.attempt_id],
    );
    expect(persisted.rows[0]).toEqual({
      attempt_status: 'technical_result',
      attempt_outcome: 'away_no_show',
      attempt_winner: context.fixture.home_participant_id,
      fixture_status: 'settled',
      fixture_winner: context.fixture.home_participant_id,
      tournament_status: 'regular',
      duel_status: 'cancelled',
      settled_reason: 'tournament_attempt_away_no_show',
      adjustment_count: 1,
      incident_count: 0,
    });
  });

  it('pauses an opened no-ready regular replay once with its dedicated incident', async () => {
    const context = await createRegularReplay(pool, app, 'attempt-regular-replay-neither-ready');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(context.replay.scheduled_starts_at);
    try {
      const opened = await app.inject({
        method: 'POST',
        url: `/tournaments/${context.tournamentId}/fixtures/${context.fixture.fixture_id}/segments/open`,
        headers: { authorization: `Bearer ${context.homeToken}` },
      });
      expect(opened.statusCode).toBe(200);

      vi.setSystemTime(new Date(context.replay.readiness_expires_at.getTime() + 1));
      for (let request = 0; request < 2; request += 1) {
        const state = await app.inject({
          method: 'GET',
          url: `/duel/amateur/matches/${opened.json().duelMatchId}`,
          headers: { authorization: `Bearer ${context.homeToken}` },
        });
        expect(state.statusCode).toBe(200);
      }
    } finally {
      vi.useRealTimers();
    }

    const persisted = await pool.query<{
      attempt_status: string;
      attempt_outcome: string | null;
      fixture_status: string;
      tournament_status: string;
      duel_status: string;
      settled_reason: string | null;
      regular_incident_count: number;
      both_no_show_count: number;
    }>(
      `select attempt.status as attempt_status, attempt.outcome as attempt_outcome,
              fixture.status as fixture_status, tournament.status as tournament_status,
              duel.status as duel_status, duel.settled_reason,
              (select count(*)::int from tournament_incident incident
                where incident.fixture_attempt_id = attempt.id
                  and incident.kind = 'regular_replay_readiness_unresolved')
                as regular_incident_count,
              (select count(*)::int from tournament_incident incident
                where incident.fixture_attempt_id = attempt.id
                  and incident.kind = 'both_no_show') as both_no_show_count
         from tournament_fixture_attempt attempt
         join tournament_fixture fixture on fixture.id = attempt.fixture_id
         join tournament tournament on tournament.id = fixture.tournament_id
         join amateur_duel_match duel on duel.id = attempt.amateur_duel_match_id
        where attempt.id = $1`,
      [context.replay.attempt_id],
    );
    expect(persisted.rows[0]).toEqual({
      attempt_status: 'needs_admin_decision',
      attempt_outcome: null,
      fixture_status: 'paused',
      tournament_status: 'regular',
      duel_status: 'cancelled',
      settled_reason: 'regular_replay_readiness_unresolved',
      regular_incident_count: 1,
      both_no_show_count: 0,
    });
  });

  it('reconciles an unopened no-ready regular replay idempotently without a generic no-show', async () => {
    const context = await createRegularReplay(pool, app, 'attempt-regular-replay-unopened');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(context.replay.readiness_expires_at.getTime() + 1));
    try {
      for (let request = 0; request < 2; request += 1) {
        const opened = await app.inject({
          method: 'POST',
          url: `/tournaments/${context.tournamentId}/fixtures/${context.fixture.fixture_id}/segments/open`,
          headers: { authorization: `Bearer ${context.homeToken}` },
        });
        expect(opened.statusCode).toBe(409);
      }
    } finally {
      vi.useRealTimers();
    }

    const persisted = await pool.query<{
      attempt_status: string;
      attempt_outcome: string | null;
      duel_match_id: string | null;
      fixture_status: string;
      regular_incident_count: number;
      both_no_show_count: number;
    }>(
      `select attempt.status as attempt_status, attempt.outcome as attempt_outcome,
              attempt.amateur_duel_match_id as duel_match_id,
              fixture.status as fixture_status,
              (select count(*)::int from tournament_incident incident
                where incident.fixture_attempt_id = attempt.id
                  and incident.kind = 'regular_replay_readiness_unresolved')
                as regular_incident_count,
              (select count(*)::int from tournament_incident incident
                where incident.fixture_attempt_id = attempt.id
                  and incident.kind = 'both_no_show') as both_no_show_count
         from tournament_fixture_attempt attempt
         join tournament_fixture fixture on fixture.id = attempt.fixture_id
        where attempt.id = $1`,
      [context.replay.attempt_id],
    );
    expect(persisted.rows[0]).toEqual({
      attempt_status: 'needs_admin_decision',
      attempt_outcome: null,
      duel_match_id: null,
      fixture_status: 'paused',
      regular_incident_count: 1,
      both_no_show_count: 0,
    });
  });

  it('puts a playoff replay behind the normal break without double-counting the result', async () => {
    const { fixture, opened } = await openFirstPlayoffAttempt(pool, 'attempt-playoff-replay');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(fixture.scheduled_starts_at.getTime() + 1));
    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    const homeToken = await jwt.issueAccessToken({ sub: fixture.home_user_id });
    try {
    for (const userId of [fixture.home_user_id, fixture.away_user_id]) {
      const token = await jwt.issueAccessToken({ sub: userId });
      const ready = await app.inject({
        method: 'POST',
        url: `/duel/amateur/matches/${opened.duelMatchId}/ready`,
        headers: { authorization: `Bearer ${token}` },
        payload: { loadout: {} },
      });
      expect(ready.statusCode).toBe(200);
    }
    await pool.query(
      `update amateur_duel_participant
          set state = 'completed', completed_at = now(), goals = 2, shots_taken = 4,
              active_duration_ms = 90000
        where match_id = $1`,
      [opened.duelMatchId],
    );
    for (let request = 0; request < 2; request += 1) {
      const state = await app.inject({
        method: 'GET',
        url: `/duel/amateur/matches/${opened.duelMatchId}`,
        headers: { authorization: `Bearer ${homeToken}` },
      });
      expect(state.statusCode).toBe(200);
    }

    const attempts = await pool.query<{
      attempt_number: number;
      kind: string;
      status: string;
      outcome: string | null;
      home_score: number | null;
      away_score: number | null;
      scheduled_starts_at: Date;
      is_result_bearing: boolean;
      round_game_day_id: string | null;
      snapshot: Record<string, unknown>;
    }>(
      `select attempt_number, kind, status, outcome, home_score, away_score,
              scheduled_starts_at, is_result_bearing, round_game_day_id,
              result_snapshot as snapshot
         from tournament_fixture_attempt
        where fixture_id = $1
        order by attempt_number`,
      [fixture.fixture_id],
    );
    expect(attempts.rows).toHaveLength(2);
    expect(attempts.rows[0]).toMatchObject({
      attempt_number: 1,
      kind: 'initial',
      status: 'settled',
      outcome: 'replay',
      home_score: 2,
      away_score: 2,
      is_result_bearing: true,
    });
    expect(attempts.rows[0]!.snapshot).toMatchObject({ homeShots: 4, awayShots: 4 });
    expect(attempts.rows[1]).toMatchObject({
      attempt_number: 2,
      kind: 'replay',
      status: 'pending',
      outcome: null,
      home_score: null,
      away_score: null,
      is_result_bearing: false,
      round_game_day_id: null,
    });
    expect(attempts.rows[1]!.snapshot).toMatchObject({
      duelTemplateId: TEMPLATE_ID,
      readinessMode: 'manual',
    });

    const lifecycle = await pool.query<{
      duel_settled_at: Date;
      fixture_status: string;
      fixture_home_score: number;
      fixture_away_score: number;
      series_wins: number;
      segment_count: number;
      overtime_count: number;
    }>(
      `select duel.settled_at as duel_settled_at, fixture.status as fixture_status,
              fixture.home_score as fixture_home_score,
              fixture.away_score as fixture_away_score,
              (series.higher_seed_wins + series.lower_seed_wins)::int as series_wins,
              (select count(*)::int from tournament_fixture_segment segment
                where segment.fixture_id = fixture.id) as segment_count,
              (select count(*)::int from tournament_fixture_segment segment
                where segment.fixture_id = fixture.id and segment.kind <> 'regulation') as overtime_count
         from tournament_fixture fixture
         join tournament_playoff_series series on series.id = fixture.series_id
         join amateur_duel_match duel on duel.id = $2
        where fixture.id = $1`,
      [fixture.fixture_id, opened.duelMatchId],
    );
    expect(
      attempts.rows[1]!.scheduled_starts_at.getTime() -
        lifecycle.rows[0]!.duel_settled_at.getTime(),
    ).toBe(5 * 60_000);
    expect(lifecycle.rows[0]).toMatchObject({
      fixture_status: 'scheduled',
      fixture_home_score: 0,
      fixture_away_score: 0,
      series_wins: 0,
      segment_count: 1,
      overtime_count: 0,
    });
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns a participant-safe attempt state with series progress and terminal winners', async () => {
    const context = await openFirstPlayoffAttempt(pool, 'attempt-player-state');
    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    const homeToken = await jwt.issueAccessToken({ sub: context.fixture.home_user_id });
    const awayToken = await jwt.issueAccessToken({ sub: context.fixture.away_user_id });

    for (const [userId, token] of [
      [context.fixture.home_user_id, homeToken],
      [context.fixture.away_user_id, awayToken],
    ] as const) {
      const ready = await app.inject({
        method: 'POST',
        url: `/duel/amateur/matches/${context.opened.duelMatchId}/ready`,
        headers: { authorization: `Bearer ${token}` },
        payload: { loadout: {} },
      });
      expect(ready.statusCode, userId).toBe(200);
    }

    const opponentPeriodStartedAt = new Date('2030-10-26T17:01:00.000Z');
    await pool.query(
      `update amateur_duel_participant
          set state = 'period_active', current_period = 1, period_started_at = $3,
              goals = 99, shots_taken = 100
        where match_id = $1 and user_id = $2`,
      [context.opened.duelMatchId, context.fixture.away_user_id, opponentPeriodStartedAt],
    );

    const active = await app.inject({
      method: 'GET',
      url: `/tournaments/${context.tournamentId}/fixtures/${context.fixture.fixture_id}/attempt`,
      headers: { authorization: `Bearer ${homeToken}` },
    });
    expect(active.statusCode).toBe(200);
    expect(active.json()).toMatchObject({
      attempt: {
        number: 1,
        kind: 'initial',
        status: 'active',
        myReady: true,
        opponentReady: true,
        duelMatchId: context.opened.duelMatchId,
        result: null,
      },
      opponentProgress: {
        state: 'period_active',
        currentPeriod: 1,
        periodEndsAt: '2030-10-26T17:02:00.000Z',
      },
      series: {
        winsRequired: 2,
        myWins: 0,
        opponentWins: 0,
        higherSeedWins: 0,
        lowerSeedWins: 0,
        status: 'scheduled',
        winnerUserId: null,
      },
      tournament: { status: 'playoff', winnerUserId: null },
    });
    expect(active.json().opponentProgress).not.toHaveProperty('goals');
    expect(active.json().opponentProgress).not.toHaveProperty('shots');

    await pool.query(
      `update tournament_fixture_attempt
          set status = 'settled', winner_participant_id = $2, outcome = 'home_win',
              home_score = 4, away_score = 2, home_accuracy = 55.25,
              away_accuracy = 50.00, home_active_time_ms = 90000,
              away_active_time_ms = 95000, settled_at = now()
        where fixture_id = $1`,
      [context.fixture.fixture_id, context.fixture.home_participant_id],
    );
    await pool.query(
      `update tournament_playoff_series
          set status = 'completed', higher_seed_wins = 2, lower_seed_wins = 1,
              winner_participant_id = $2
        where id = $1`,
      [context.fixture.series_id, context.fixture.home_participant_id],
    );
    await pool.query(`update tournament set status = 'completed' where id = $1`, [
      context.tournamentId,
    ]);

    const terminal = await app.inject({
      method: 'GET',
      url: `/tournaments/${context.tournamentId}/fixtures/${context.fixture.fixture_id}/attempt`,
      headers: { authorization: `Bearer ${awayToken}` },
    });
    expect(terminal.statusCode).toBe(200);
    expect(terminal.json()).toMatchObject({
      attempt: {
        status: 'settled',
        result: {
          outcome: 'home_win',
          winnerUserId: context.fixture.home_user_id,
          myScore: 2,
          opponentScore: 4,
          myAccuracy: 50,
          opponentAccuracy: 55.25,
          myActiveTimeMs: 95000,
          opponentActiveTimeMs: 90000,
        },
      },
      series: {
        winsRequired: 2,
        myWins: 1,
        opponentWins: 2,
        higherSeedWins: 2,
        lowerSeedWins: 1,
        status: 'completed',
        winnerUserId: context.fixture.home_user_id,
      },
      tournament: {
        status: 'completed',
        winnerUserId: context.fixture.home_user_id,
      },
    });
  });

  it('lazily settles an expired one-ready attempt before returning player state', async () => {
    const context = await openFirstPlayoffAttempt(pool, 'attempt-player-state-reconcile');
    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    const homeToken = await jwt.issueAccessToken({ sub: context.fixture.home_user_id });
    const ready = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${context.opened.duelMatchId}/ready`,
      headers: { authorization: `Bearer ${homeToken}` },
      payload: { loadout: {} },
    });
    expect(ready.statusCode).toBe(200);
    const deadline = await pool.query<{ readiness_expires_at: Date }>(
      `select readiness_expires_at from tournament_fixture_attempt where fixture_id = $1`,
      [context.fixture.fixture_id],
    );

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(deadline.rows[0]!.readiness_expires_at.getTime() + 1));
    try {
      const reconciliationToken = await jwt.issueAccessToken({
        sub: context.fixture.home_user_id,
      });
      const state = await app.inject({
        method: 'GET',
        url: `/tournaments/${context.tournamentId}/fixtures/${context.fixture.fixture_id}/attempt`,
        headers: { authorization: `Bearer ${reconciliationToken}` },
      });
      expect(state.statusCode).toBe(200);
      expect(state.json()).toMatchObject({
        attempt: {
          status: 'technical_result',
          result: {
            outcome: 'away_no_show',
            winnerUserId: context.fixture.home_user_id,
          },
        },
        series: { myWins: 1, opponentWins: 0 },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels the only materialized attempt when a playoff series is won', async () => {
    const context = await openFirstPlayoffAttempt(pool, 'attempt-series-cleanup');
    const client = await pool.connect();
    try {
      await client.query('begin');
      await advanceTournamentPlayoffSeries(client, {
        seriesId: context.fixture.series_id,
        winnerParticipantId: context.fixture.home_participant_id,
        settledAt: new Date('2030-10-26T18:00:00.000Z'),
      });
      await advanceTournamentPlayoffSeries(client, {
        seriesId: context.fixture.series_id,
        winnerParticipantId: context.fixture.home_participant_id,
        settledAt: new Date('2030-10-26T18:00:00.000Z'),
      });
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }

    const attempts = await pool.query<{
      status: string;
      duel_status: string | null;
      fixture_status: string;
    }>(
      `select attempt.status, duel.status as duel_status, fixture.status as fixture_status
         from tournament_fixture_attempt attempt
         join tournament_fixture fixture on fixture.id = attempt.fixture_id
         left join amateur_duel_match duel on duel.id = attempt.amateur_duel_match_id
        where fixture.series_id = $1
        order by fixture.fixture_number, attempt.attempt_number`,
      [context.fixture.series_id],
    );
    expect(attempts.rows).toHaveLength(1);
    expect(attempts.rows.every((row) => row.status === 'cancelled')).toBe(true);
    expect(attempts.rows.every((row) => row.fixture_status === 'cancelled')).toBe(true);
    expect(attempts.rows.find((row) => row.duel_status !== null)?.duel_status).toBe('cancelled');
  });

  it('moves a settled series game through its break into a fresh ready check exactly once', async () => {
    const context = await openFirstPlayoffAttempt(pool, 'attempt-series-break-ready-check');
    await pool.query(
      `update tournament_round_game_day day
          set first_game_starts_at = $2::timestamptz + (day.day_number - 1) * interval '1 day'
         from tournament_fixture fixture
        where fixture.id = $1 and day.round_id = fixture.round_id`,
      [context.fixture.fixture_id, context.fixture.scheduled_starts_at],
    );
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(context.fixture.scheduled_starts_at.getTime() + 1));
    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    const homeToken = await jwt.issueAccessToken({ sub: context.fixture.home_user_id });
    const awayToken = await jwt.issueAccessToken({ sub: context.fixture.away_user_id });
    try {
    for (const token of [homeToken, awayToken]) {
      const ready = await app.inject({
        method: 'POST',
        url: `/duel/amateur/matches/${context.opened.duelMatchId}/ready`,
        headers: { authorization: `Bearer ${token}` },
        payload: { loadout: {} },
      });
      expect(ready.statusCode).toBe(200);
    }
    await pool.query(
      `update amateur_duel_participant
          set state = 'completed', completed_at = now(), current_period = 2,
              period_started_at = null,
              goals = case when user_id = $2 then 3 else 1 end,
              shots_taken = 5, active_duration_ms = 90000
        where match_id = $1`,
      [context.opened.duelMatchId, context.fixture.home_user_id],
    );
    const settled = await app.inject({
      method: 'GET',
      url: `/duel/amateur/matches/${context.opened.duelMatchId}`,
      headers: { authorization: `Bearer ${homeToken}` },
    });
    expect(settled.statusCode).toBe(200);

    const duringBreak = await app.inject({
      method: 'GET',
      url: `/tournaments/${context.tournamentId}/fixtures/${context.fixture.fixture_id}/attempt`,
      headers: { authorization: `Bearer ${homeToken}` },
    });
    expect(duringBreak.statusCode).toBe(200);
    expect(duringBreak.json().nextGame).toMatchObject({ available: false });
    const nextFixtureId = duringBreak.json().nextGame.fixtureId as string;
    const breakEndsAt = new Date(duringBreak.json().nextGame.breakEndsAt as string);

    const beforeBreak = await app.inject({
      method: 'POST',
      url: `/tournaments/${context.tournamentId}/fixtures/${nextFixtureId}/segments/open`,
      headers: { authorization: `Bearer ${homeToken}` },
    });
    expect(beforeBreak.statusCode).toBe(409);

    vi.setSystemTime(new Date(breakEndsAt.getTime() + 1));
      const opened = await app.inject({
        method: 'POST',
        url: `/tournaments/${context.tournamentId}/fixtures/${nextFixtureId}/segments/open`,
        headers: { authorization: `Bearer ${homeToken}` },
      });
      expect(opened.statusCode).toBe(200);
      const openedAgain = await app.inject({
        method: 'POST',
        url: `/tournaments/${context.tournamentId}/fixtures/${nextFixtureId}/segments/open`,
        headers: { authorization: `Bearer ${homeToken}` },
      });
      expect(openedAgain.statusCode).toBe(200);
      expect(openedAgain.json()).toEqual(opened.json());

      const nextDuelMatchId = opened.json().duelMatchId as string;
      for (const token of [homeToken, homeToken, awayToken]) {
        const ready = await app.inject({
          method: 'POST',
          url: `/duel/amateur/matches/${nextDuelMatchId}/ready`,
          headers: { authorization: `Bearer ${token}` },
          payload: { loadout: {} },
        });
        expect(ready.statusCode).toBe(200);
      }
      const nextState = await app.inject({
        method: 'GET',
        url: `/tournaments/${context.tournamentId}/fixtures/${nextFixtureId}/attempt`,
        headers: { authorization: `Bearer ${homeToken}` },
      });
      expect(nextState.statusCode).toBe(200);
      expect(nextState.json().attempt).toMatchObject({
        status: 'active',
        myReady: true,
        opponentReady: true,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('assigns each materialized series game to the configured game day capacity', async () => {
    const context = await openFirstPlayoffAttempt(pool, 'attempt-series-game-day-capacity');
    const settledAt = new Date('2030-10-26T18:00:00.000Z');
    await pool.query(
      `update tournament_fixture_attempt
          set status = 'technical_result', settled_at = $2
        where fixture_id = $1`,
      [context.fixture.fixture_id, settledAt],
    );
    await pool.query(
      `update tournament_fixture set status = 'settled', settled_at = $2 where id = $1`,
      [context.fixture.fixture_id, settledAt],
    );
    const client = await pool.connect();
    try {
      await client.query('begin');
      await advanceTournamentPlayoffSeries(client, {
        seriesId: context.fixture.series_id,
        winnerParticipantId: context.fixture.home_participant_id,
        settledAt,
      });
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }

    const secondGame = await pool.query<{
      fixture_id: string;
      day_number: number;
      starts_at: Date;
    }>(
      `select fixture.id as fixture_id, day.day_number, attempt.scheduled_starts_at as starts_at
         from tournament_fixture fixture
         join tournament_fixture_attempt attempt on attempt.fixture_id = fixture.id
         join tournament_round_game_day day on day.id = attempt.round_game_day_id
        where fixture.series_id = $1
          and (fixture.result_snapshot->>'gameNumber')::int = 2`,
      [context.fixture.series_id],
    );
    expect(secondGame.rows[0]).toEqual({
      fixture_id: expect.any(String),
      day_number: 1,
      starts_at: new Date('2030-10-26T18:05:00.000Z'),
    });

    await pool.query(
      `update tournament_fixture_attempt
          set status = 'technical_result', settled_at = $2
        where fixture_id = $1`,
      [secondGame.rows[0]!.fixture_id, new Date('2030-10-26T18:30:00.000Z')],
    );
    await pool.query(
      `update tournament_fixture
          set status = 'settled', settled_at = $2
        where id = $1`,
      [secondGame.rows[0]!.fixture_id, new Date('2030-10-26T18:30:00.000Z')],
    );
    const secondClient = await pool.connect();
    try {
      await secondClient.query('begin');
      await advanceTournamentPlayoffSeries(secondClient, {
        seriesId: context.fixture.series_id,
        winnerParticipantId: context.fixture.away_participant_id,
        settledAt: new Date('2030-10-26T18:30:00.000Z'),
      });
      await secondClient.query('commit');
    } catch (error) {
      await secondClient.query('rollback');
      throw error;
    } finally {
      secondClient.release();
    }
    const thirdGame = await pool.query<{ day_number: number; starts_at: Date }>(
      `select day.day_number, attempt.scheduled_starts_at as starts_at
         from tournament_fixture fixture
         join tournament_fixture_attempt attempt on attempt.fixture_id = fixture.id
         join tournament_round_game_day day on day.id = attempt.round_game_day_id
        where fixture.series_id = $1
          and (fixture.result_snapshot->>'gameNumber')::int = 3`,
      [context.fixture.series_id],
    );
    expect(thirdGame.rows[0]).toEqual({
      day_number: 2,
      starts_at: new Date('2030-10-27T17:00:00.000Z'),
    });
  });

  it('does not materialize a result-bearing game without a remaining game day', async () => {
    const context = await openFirstPlayoffAttempt(pool, 'attempt-series-no-game-day');
    await pool.query(
      `update tournament_round_game_day day
          set max_result_bearing_games = 1
         from tournament_fixture fixture
        where fixture.id = $1 and day.round_id = fixture.round_id and day.day_number = 1`,
      [context.fixture.fixture_id],
    );
    await pool.query(
      `delete from tournament_round_game_day day
       using tournament_fixture fixture
       where fixture.id = $1 and day.round_id = fixture.round_id and day.day_number > 1`,
      [context.fixture.fixture_id],
    );
    const settledAt = new Date('2030-10-26T18:00:00.000Z');
    await pool.query(
      `update tournament_fixture_attempt
          set status = 'technical_result', settled_at = $2
        where fixture_id = $1`,
      [context.fixture.fixture_id, settledAt],
    );
    await pool.query(
      `update tournament_fixture set status = 'settled', settled_at = $2 where id = $1`,
      [context.fixture.fixture_id, settledAt],
    );
    const client = await pool.connect();
    try {
      await client.query('begin');
      await advanceTournamentPlayoffSeries(client, {
        seriesId: context.fixture.series_id,
        winnerParticipantId: context.fixture.home_participant_id,
        settledAt,
      });
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
    const nextAttempt = await pool.query<{ attempts: number }>(
      `select count(*)::int as attempts
         from tournament_fixture fixture
         join tournament_fixture_attempt attempt on attempt.fixture_id = fixture.id
        where fixture.series_id = $1
          and (fixture.result_snapshot->>'gameNumber')::int = 2`,
      [context.fixture.series_id],
    );
    expect(nextAttempt.rows[0]).toEqual({ attempts: 0 });
  });

  it('delays the next round only when its configured start has passed', async () => {
    const tournament = await createPublished(pool, 'attempt-delayed-next-round', lifecycleRules());
    await preparePlayoffs(pool, tournament.id);
    await startTournamentPlayoffs(pool, tournament.id, new Date('2030-09-03T00:00:00.000Z'));
    const settledAt = new Date('2030-11-05T12:00:00.000Z');
    const configuredStart = new Date('2030-11-02T17:00:00.000Z');
    await pool.query(
      `update tournament_round
          set starts_at = $2
        where tournament_id = $1 and stage = 'playoff' and number = 2`,
      [tournament.id, configuredStart],
    );
    await pool.query(
      `update tournament_round_game_day day
          set first_game_starts_at = $2
         from tournament_round round
        where round.id = day.round_id
          and round.tournament_id = $1 and round.stage = 'playoff' and round.number = 2`,
      [tournament.id, configuredStart],
    );
    const semifinals = await pool.query<{
      series_id: string;
      fixture_id: string;
      winner_participant_id: string;
    }>(
      `select series.id as series_id, fixture.id as fixture_id,
              series.higher_seed_participant_id as winner_participant_id
         from tournament_playoff_series series
         join tournament_round round on round.id = series.round_id
         join tournament_fixture fixture on fixture.series_id = series.id
        where round.tournament_id = $1 and round.stage = 'playoff' and round.number = 1
          and (fixture.result_snapshot->>'gameNumber')::int = 1
        order by series.bracket_position`,
      [tournament.id],
    );
    const client = await pool.connect();
    try {
      await client.query('begin');
      for (const semifinal of semifinals.rows) {
        await client.query(
          `update tournament_fixture_attempt
              set status = 'technical_result', settled_at = $2
            where fixture_id = $1 and attempt_number = 1`,
          [semifinal.fixture_id, settledAt],
        );
        await client.query(
          `update tournament_fixture set status = 'settled', settled_at = $2 where id = $1`,
          [semifinal.fixture_id, settledAt],
        );
        await advanceTournamentPlayoffSeries(client, {
          seriesId: semifinal.series_id,
          winnerParticipantId: semifinal.winner_participant_id,
          settledAt,
        });
        await advanceTournamentPlayoffSeries(client, {
          seriesId: semifinal.series_id,
          winnerParticipantId: semifinal.winner_participant_id,
          settledAt,
        });
      }
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
    const finalSchedule = await pool.query<{
      round_starts_at: Date;
      local_date: string;
      day_starts_at: Date;
      fixture_starts_at: Date;
      attempt_starts_at: Date;
    }>(
      `select round.starts_at as round_starts_at, day.local_date::text as local_date,
              day.first_game_starts_at as day_starts_at,
              fixture.scheduled_starts_at as fixture_starts_at,
              attempt.scheduled_starts_at as attempt_starts_at
         from tournament_round round
         join tournament_round_game_day day on day.round_id = round.id
         join tournament_fixture fixture on fixture.round_id = round.id
         join tournament_fixture_attempt attempt on attempt.fixture_id = fixture.id
        where round.tournament_id = $1 and round.stage = 'playoff' and round.number = 2
          and (fixture.result_snapshot->>'gameNumber')::int = 1`,
      [tournament.id],
    );
    const expectedStart = new Date(settledAt.getTime() + 30 * 60_000);
    expect(finalSchedule.rows[0]).toEqual({
      round_starts_at: expectedStart,
      local_date: '2030-11-05',
      day_starts_at: expectedStart,
      fixture_starts_at: expectedStart,
      attempt_starts_at: expectedStart,
    });
  });

  it('waits for every source series before delaying an eight-player semifinal round', async () => {
    const tournament = await createPublished(
      pool,
      'attempt-delayed-eight-player-semifinals',
      eightPlayerLifecycleRules(),
    );
    await preparePlayoffs(pool, tournament.id, EIGHT_PLAYER_IDS);
    await startTournamentPlayoffs(pool, tournament.id, new Date('2030-09-03T00:00:00.000Z'));
    const configuredStart = new Date('2030-11-02T17:00:00.000Z');
    await pool.query(
      `update tournament_round
          set starts_at = $2
        where tournament_id = $1 and stage = 'playoff' and number = 2`,
      [tournament.id, configuredStart],
    );
    await pool.query(
      `update tournament_round_game_day day
          set first_game_starts_at = $2
         from tournament_round round
        where round.id = day.round_id
          and round.tournament_id = $1 and round.stage = 'playoff' and round.number = 2`,
      [tournament.id, configuredStart],
    );
    const quarterfinals = await pool.query<{
      series_id: string;
      winner_participant_id: string;
    }>(
      `select series.id as series_id, series.higher_seed_participant_id as winner_participant_id
         from tournament_playoff_series series
         join tournament_round round on round.id = series.round_id
         join tournament_fixture fixture on fixture.series_id = series.id
        where round.tournament_id = $1 and round.stage = 'playoff' and round.number = 1
          and (fixture.result_snapshot->>'gameNumber')::int = 1
        order by series.bracket_position`,
      [tournament.id],
    );
    expect(quarterfinals.rows).toHaveLength(4);
    const firstSettlement = new Date('2030-11-05T12:00:00.000Z');
    const finalSettlement = new Date('2030-11-05T12:10:00.000Z');
    const client = await pool.connect();
    try {
      await client.query('begin');
      for (const quarterfinal of quarterfinals.rows.slice(0, 2)) {
        await forceTournamentPlayoffSeriesWinner(client, {
          seriesId: quarterfinal.series_id,
          winnerParticipantId: quarterfinal.winner_participant_id,
          settledAt: firstSettlement,
        });
      }
      const beforeAllSources = await client.query<{ starts_at: Date }>(
        `select starts_at from tournament_round
          where tournament_id = $1 and stage = 'playoff' and number = 2`,
        [tournament.id],
      );
      expect(beforeAllSources.rows[0]!.starts_at).toEqual(configuredStart);
      for (const quarterfinal of quarterfinals.rows.slice(2)) {
        await forceTournamentPlayoffSeriesWinner(client, {
          seriesId: quarterfinal.series_id,
          winnerParticipantId: quarterfinal.winner_participant_id,
          settledAt: finalSettlement,
        });
      }
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
    const semifinalSchedule = await pool.query<{
      round_starts_at: Date;
      local_date: string;
      day_starts_at: Date;
      fixture_starts_at: Date;
      attempt_starts_at: Date;
    }>(
      `select round.starts_at as round_starts_at, day.local_date::text as local_date,
              day.first_game_starts_at as day_starts_at,
              fixture.scheduled_starts_at as fixture_starts_at,
              attempt.scheduled_starts_at as attempt_starts_at
         from tournament_round round
         join tournament_round_game_day day on day.round_id = round.id
         join tournament_fixture fixture on fixture.round_id = round.id
         join tournament_fixture_attempt attempt on attempt.fixture_id = fixture.id
        where round.tournament_id = $1 and round.stage = 'playoff' and round.number = 2
          and (fixture.result_snapshot->>'gameNumber')::int = 1
        order by fixture.fixture_number`,
      [tournament.id],
    );
    const expectedStart = new Date('2030-11-05T12:40:00.000Z');
    expect(semifinalSchedule.rows).toEqual([
      {
        round_starts_at: expectedStart,
        local_date: '2030-11-05',
        day_starts_at: expectedStart,
        fixture_starts_at: expectedStart,
        attempt_starts_at: expectedStart,
      },
      {
        round_starts_at: expectedStart,
        local_date: '2030-11-05',
        day_starts_at: expectedStart,
        fixture_starts_at: expectedStart,
        attempt_starts_at: expectedStart,
      },
    ]);
  });

  it('forces a series winner only after a second admin confirmation and preserves factual score', async () => {
    const context = await openFirstPlayoffAttempt(pool, 'attempt-admin-series-winner');
    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    const adminToken = await jwt.issueAccessToken({ sub: ADMIN_ID });
    const requested = await app.inject({
      method: 'POST',
      url: `/admin/tournaments/${context.tournamentId}/series/${context.fixture.series_id}/winner-decisions`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        winnerParticipantId: context.fixture.home_participant_id,
        reason: 'Соперник не может продолжить серию',
        idempotencyKey: 'admin-series-winner-request-1',
      },
    });
    expect(requested.statusCode).toBe(201);
    expect(requested.json()).toMatchObject({
      status: 'pending',
      winnerParticipantId: context.fixture.home_participant_id,
      factualScore: { higherSeedWins: 0, lowerSeedWins: 0 },
    });

    const beforeConfirmation = await pool.query<{
      series_status: string;
      attempt_status: string;
    }>(
      `select series.status as series_status, attempt.status as attempt_status
         from tournament_playoff_series series
         join tournament_fixture fixture on fixture.series_id = series.id
         join tournament_fixture_attempt attempt on attempt.fixture_id = fixture.id
        where series.id = $1 and attempt.amateur_duel_match_id is not null`,
      [context.fixture.series_id],
    );
    expect(beforeConfirmation.rows[0]).toEqual({
      series_status: 'scheduled',
      attempt_status: 'ready_check',
    });

    const confirmed = await app.inject({
      method: 'POST',
      url: `/admin/tournaments/${context.tournamentId}/series/${context.fixture.series_id}/winner-decisions/${requested.json().id}/confirm`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(confirmed.statusCode).toBe(200);
    expect(confirmed.json()).toMatchObject({
      status: 'confirmed',
      winnerParticipantId: context.fixture.home_participant_id,
      factualScore: { higherSeedWins: 0, lowerSeedWins: 0 },
    });
    const repeated = await app.inject({
      method: 'POST',
      url: `/admin/tournaments/${context.tournamentId}/series/${context.fixture.series_id}/winner-decisions/${requested.json().id}/confirm`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(repeated.statusCode).toBe(200);
    expect(repeated.json()).toEqual(confirmed.json());

    const persisted = await pool.query<{
      status: string;
      winner_participant_id: string;
      higher_seed_wins: number;
      lower_seed_wins: number;
      open_attempts: number;
      adjustment_count: number;
      reason: string;
    }>(
      `select series.status, series.winner_participant_id,
              series.higher_seed_wins, series.lower_seed_wins,
              (select count(*)::int
                 from tournament_fixture_attempt attempt
                 join tournament_fixture fixture on fixture.id = attempt.fixture_id
                where fixture.series_id = series.id
                  and attempt.status <> 'cancelled') as open_attempts,
              (select count(*)::int from tournament_adjustment adjustment
                where adjustment.tournament_id = series.tournament_id
                  and adjustment.kind = 'incident_resolution'
                  and adjustment.payload->>'seriesDecisionId' = $2::text) as adjustment_count,
              decision.reason
         from tournament_playoff_series series
         join tournament_series_admin_decision decision on decision.series_id = series.id
        where series.id = $1 and decision.id = $2::uuid`,
      [context.fixture.series_id, requested.json().id],
    );
    expect(persisted.rows[0]).toEqual({
      status: 'completed',
      winner_participant_id: context.fixture.home_participant_id,
      higher_seed_wins: 0,
      lower_seed_wins: 0,
      open_attempts: 0,
      adjustment_count: 1,
      reason: 'Соперник не может продолжить серию',
    });
  });

  it('blocks player proposals and rescheduling after playoff readiness has begun', async () => {
    const context = await openFirstPlayoffAttempt(pool, 'attempt-admin-reschedule');
    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    const adminToken = await jwt.issueAccessToken({ sub: ADMIN_ID });
    const homeToken = await jwt.issueAccessToken({ sub: context.fixture.home_user_id });
    const startsAt = new Date(context.fixture.scheduled_starts_at.getTime() + 3_600_000);
    const endsAt = new Date(startsAt.getTime() + 20 * 60_000);

    const playerProposal = await app.inject({
      method: 'POST',
      url: `/tournaments/fixtures/${context.fixture.fixture_id}/live/proposals`,
      headers: { authorization: `Bearer ${homeToken}` },
      payload: { proposedAt: new Date(startsAt.getTime() + 60_000).toISOString() },
    });
    expect(playerProposal.statusCode).toBe(409);
    expect(playerProposal.json()).toMatchObject({
      error: {
        code: 'conflict',
        message: 'Время турнирной игры назначает администратор',
      },
    });

    const activeReschedule = await app.inject({
      method: 'PATCH',
      url: `/admin/tournaments/${context.tournamentId}/fixtures/${context.fixture.fixture_id}/schedule`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        reason: 'Нельзя переносить после начала готовности',
      },
    });
    expect(activeReschedule.statusCode).toBe(409);
  });

  it('notifies only the fixture participants on a normal playoff reschedule, then reminds them at T-30', async () => {
    const tournament = await createPublished(pool, 'attempt-reschedule-notifications', lifecycleRules());
    await preparePlayoffs(pool, tournament.id);
    await startTournamentPlayoffs(pool, tournament.id, new Date('2030-09-03T00:00:00.000Z'));
    const fixture = await pool.query<{
      fixture_id: string;
      home_user_id: string;
      away_user_id: string;
      scheduled_starts_at: Date;
      hard_deadline_at: Date;
    }>(
      `select fixture.id as fixture_id, home.user_id as home_user_id, away.user_id as away_user_id,
              attempt.scheduled_starts_at, attempt.hard_deadline_at
         from tournament_fixture fixture
         join tournament_round round on round.id = fixture.round_id
         join tournament_fixture_attempt attempt on attempt.fixture_id = fixture.id
         join tournament_participant home on home.id = fixture.home_participant_id
         join tournament_participant away on away.id = fixture.away_participant_id
        where fixture.tournament_id = $1 and round.stage = 'playoff'
          and (fixture.result_snapshot->>'gameNumber')::int = 1
        order by fixture.fixture_number
        limit 1`,
      [tournament.id],
    );
    const row = fixture.rows[0]!;
    for (const userId of PLAYER_IDS) {
      await pool.query(
        `insert into push_subscriptions (user_id, endpoint, p256dh, auth)
         values ($1, $2, 'test-p256dh', 'test-auth')`,
        [userId, `https://push.example.test/reschedule/${userId}`],
      );
    }
    const startsAt = new Date('2031-01-15T12:00:00.000Z');
    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    const adminToken = await jwt.issueAccessToken({ sub: ADMIN_ID });

    const response = await app.inject({
      method: 'PATCH',
      url: `/admin/tournaments/${tournament.id}/fixtures/${row.fixture_id}/schedule`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        startsAt: startsAt.toISOString(),
        endsAt: new Date(
          startsAt.getTime() + (row.hard_deadline_at.getTime() - row.scheduled_starts_at.getTime()),
        ).toISOString(),
        reason: 'Переносим матч на согласованное время',
      },
    });

    expect(response.statusCode, JSON.stringify(response.json())).toBe(200);
    expect(
      (
        await pool.query<{ user_id: string; event_type: string }>(
          `select user_id, event_type from push_delivery_log order by event_type, user_id`,
        )
      ).rows,
    ).toEqual(
      [row.home_user_id, row.away_user_id]
        .sort()
        .map((user_id) => ({ user_id, event_type: 'tournament.rescheduled' })),
    );

    await expect(
      reconcilePlayoffDayStartingCommunications(pool, {
        now: new Date(startsAt.getTime() - 30 * 60_000),
        systemUserId: OFFICIAL_ID,
        publisher: { publish: async () => undefined },
      }),
    ).resolves.toEqual({ considered: 2 });
    expect(
      (
        await pool.query<{ user_id: string; event_key: string }>(
          `select user_id, event_key from push_delivery_log
            where event_type = 'tournament.series_next_game'
            order by user_id`,
        )
      ).rows,
    ).toEqual(
      [row.home_user_id, row.away_user_id]
        .sort()
        .map((user_id) => ({
          user_id,
          event_key: expect.stringContaining(`${tournament.id}:playoff-day-starting:`),
        })),
    );
  });

  it('sends one combined notice to the fixture participants when a playoff match moves inside T-30', async () => {
    const tournament = await createPublished(pool, 'attempt-reschedule-combined-notice', lifecycleRules());
    await preparePlayoffs(pool, tournament.id);
    await startTournamentPlayoffs(pool, tournament.id, new Date('2030-09-03T00:00:00.000Z'));
    const fixture = await pool.query<{
      fixture_id: string;
      home_user_id: string;
      away_user_id: string;
      scheduled_starts_at: Date;
      hard_deadline_at: Date;
    }>(
      `select fixture.id as fixture_id, home.user_id as home_user_id, away.user_id as away_user_id,
              attempt.scheduled_starts_at, attempt.hard_deadline_at
         from tournament_fixture fixture
         join tournament_round round on round.id = fixture.round_id
         join tournament_fixture_attempt attempt on attempt.fixture_id = fixture.id
         join tournament_participant home on home.id = fixture.home_participant_id
         join tournament_participant away on away.id = fixture.away_participant_id
        where fixture.tournament_id = $1 and round.stage = 'playoff'
          and (fixture.result_snapshot->>'gameNumber')::int = 1
        order by fixture.fixture_number
        limit 1`,
      [tournament.id],
    );
    const row = fixture.rows[0]!;
    for (const userId of PLAYER_IDS) {
      await pool.query(
        `insert into push_subscriptions (user_id, endpoint, p256dh, auth)
         values ($1, $2, 'test-p256dh', 'test-auth')`,
        [userId, `https://push.example.test/reschedule-combined/${userId}`],
      );
    }
    const startsAt = new Date(Date.now() + 10 * 60_000);
    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    const adminToken = await jwt.issueAccessToken({ sub: ADMIN_ID });

    const response = await app.inject({
      method: 'PATCH',
      url: `/admin/tournaments/${tournament.id}/fixtures/${row.fixture_id}/schedule`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        startsAt: startsAt.toISOString(),
        endsAt: new Date(
          startsAt.getTime() + (row.hard_deadline_at.getTime() - row.scheduled_starts_at.getTime()),
        ).toISOString(),
        reason: 'Матч переносится, начинаем почти сразу',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(
      (
        await pool.query<{ user_id: string; event_type: string; event_key: string }>(
          `select user_id, event_type, event_key from push_delivery_log order by user_id`,
        )
      ).rows,
    ).toEqual(
      [row.home_user_id, row.away_user_id]
        .sort()
        .map((user_id) => ({
          user_id,
          event_type: 'tournament.series_next_game',
          event_key: expect.stringContaining(`${tournament.id}:playoff-day-starting:`),
        })),
    );
  });

  it('delivers neither a push nor a DM when a T-30 reschedule has no system user', async () => {
    const tournament = await createPublished(pool, 'attempt-reschedule-without-system-user', lifecycleRules());
    await preparePlayoffs(pool, tournament.id);
    await startTournamentPlayoffs(pool, tournament.id, new Date('2030-09-03T00:00:00.000Z'));
    const fixture = await pool.query<{
      fixture_id: string;
      home_user_id: string;
      away_user_id: string;
      scheduled_starts_at: Date;
      hard_deadline_at: Date;
    }>(
      `select fixture.id as fixture_id, home.user_id as home_user_id, away.user_id as away_user_id,
              attempt.scheduled_starts_at, attempt.hard_deadline_at
         from tournament_fixture fixture
         join tournament_round round on round.id = fixture.round_id
         join tournament_fixture_attempt attempt on attempt.fixture_id = fixture.id
         join tournament_participant home on home.id = fixture.home_participant_id
         join tournament_participant away on away.id = fixture.away_participant_id
        where fixture.tournament_id = $1 and round.stage = 'playoff'
          and (fixture.result_snapshot->>'gameNumber')::int = 1
        order by fixture.fixture_number
        limit 1`,
      [tournament.id],
    );
    const row = fixture.rows[0]!;
    for (const userId of [row.home_user_id, row.away_user_id]) {
      await pool.query(
        `insert into push_subscriptions (user_id, endpoint, p256dh, auth)
         values ($1, $2, 'test-p256dh', 'test-auth')`,
        [userId, `https://push.example.test/no-system-user/${userId}`],
      );
    }
    const { databaseUrl, redisUrl } = getTestUrls();
    const appWithoutSystemUser = await buildApp({
      config: {
        NODE_ENV: 'test', HOST: '0.0.0.0', PORT: 3000, LOG_LEVEL: 'warn',
        DATABASE_URL: databaseUrl, REDIS_URL: redisUrl,
        JWT_SECRET, REFRESH_SECRET, TELEGRAM_BOT_TOKEN: 'test-bot-token', DAILY_SEED_SECRET,
      },
      pushSchedulerEnabled: false,
      pushWorkerEnabled: false,
    });
    try {
      const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
      const adminToken = await jwt.issueAccessToken({ sub: ADMIN_ID });
      const startsAt = new Date(Date.now() + 10 * 60_000);
      const response = await appWithoutSystemUser.inject({
        method: 'PATCH',
        url: `/admin/tournaments/${tournament.id}/fixtures/${row.fixture_id}/schedule`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          startsAt: startsAt.toISOString(),
          endsAt: new Date(
            startsAt.getTime() + (row.hard_deadline_at.getTime() - row.scheduled_starts_at.getTime()),
          ).toISOString(),
          reason: 'Матч переносится, но системный аккаунт не настроен',
        },
      });
      expect(response.statusCode, JSON.stringify(response.json())).toBe(200);
      expect((await pool.query(`select id from push_delivery_log`)).rows).toEqual([]);
      expect((await pool.query(`select id from chats where type = 'direct'`)).rows).toEqual([]);
      expect((await pool.query(`select id from messages`)).rows).toEqual([]);
    } finally {
      await appWithoutSystemUser.close();
    }
  });

  it('keeps attempt state consistent when an admin resolves a tournament no-show', async () => {
    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    const adminToken = await jwt.issueAccessToken({ sub: ADMIN_ID });
    const single = await openFirstPlayoffAttempt(pool, 'attempt-admin-single-no-show');
    const awarded = await app.inject({
      method: 'POST',
      url: `/admin/tournaments/${single.tournamentId}/fixtures/${single.fixture.fixture_id}/no-show`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { absent: 'away', reason: 'Гость не подтвердил готовность' },
    });
    expect(awarded.statusCode).toBe(200);
    const awardedState = await pool.query<{
      attempt_status: string;
      attempt_outcome: string;
      duel_status: string;
      higher_seed_wins: number;
      lower_seed_wins: number;
    }>(
      `select attempt.status as attempt_status, attempt.outcome as attempt_outcome,
              duel.status as duel_status, series.higher_seed_wins, series.lower_seed_wins
         from tournament_fixture_attempt attempt
         join tournament_fixture fixture on fixture.id = attempt.fixture_id
         join tournament_playoff_series series on series.id = fixture.series_id
         join amateur_duel_match duel on duel.id = attempt.amateur_duel_match_id
        where attempt.fixture_id = $1`,
      [single.fixture.fixture_id],
    );
    expect(awardedState.rows[0]).toEqual({
      attempt_status: 'technical_result',
      attempt_outcome: 'away_no_show',
      duel_status: 'cancelled',
      higher_seed_wins: 1,
      lower_seed_wins: 0,
    });

    const both = await openFirstPlayoffAttempt(pool, 'attempt-admin-both-no-show');
    const paused = await app.inject({
      method: 'POST',
      url: `/admin/tournaments/${both.tournamentId}/fixtures/${both.fixture.fixture_id}/no-show`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { absent: 'both', reason: 'Оба игрока не вышли на связь' },
    });
    expect(paused.statusCode).toBe(200);
    const pausedState = await pool.query<{
      attempt_status: string;
      attempt_outcome: string;
      fixture_status: string;
      series_status: string;
      tournament_status: string;
      incidents: number;
    }>(
      `select attempt.status as attempt_status, attempt.outcome as attempt_outcome,
              fixture.status as fixture_status, series.status as series_status,
              tournament.status as tournament_status,
              (select count(*)::int from tournament_incident incident
                where incident.fixture_attempt_id = attempt.id
                  and incident.kind = 'both_no_show') as incidents
         from tournament_fixture_attempt attempt
         join tournament_fixture fixture on fixture.id = attempt.fixture_id
         join tournament_playoff_series series on series.id = fixture.series_id
         join tournament tournament on tournament.id = fixture.tournament_id
        where attempt.fixture_id = $1`,
      [both.fixture.fixture_id],
    );
    expect(pausedState.rows[0]).toEqual({
      attempt_status: 'needs_admin_decision',
      attempt_outcome: 'both_no_show',
      fixture_status: 'paused',
      series_status: 'paused',
      tournament_status: 'playoff',
      incidents: 1,
    });
  });

  it('records only materialized technical attempts after disqualification', async () => {
    const context = await openFirstPlayoffAttempt(pool, 'attempt-admin-disqualification');
    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    const adminToken = await jwt.issueAccessToken({ sub: ADMIN_ID });
    const response = await app.inject({
      method: 'POST',
      url: `/admin/tournaments/${context.tournamentId}/participants/${context.fixture.away_participant_id}/disqualify`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { reason: 'Игрок снят с турнира администратором' },
    });
    expect(response.statusCode).toBe(200);

    const attempts = await pool.query<{
      attempt_number: number;
      status: string;
      outcome: string;
      winner_participant_id: string | null;
    }>(
      `select attempt.attempt_number, attempt.status, attempt.outcome,
              attempt.winner_participant_id
         from tournament_fixture_attempt attempt
         join tournament_fixture fixture on fixture.id = attempt.fixture_id
        where fixture.series_id = $1
        order by fixture.fixture_number`,
      [context.fixture.series_id],
    );
    expect(attempts.rows).toEqual([
      {
        attempt_number: 1,
        status: 'technical_result',
        outcome: 'away_no_show',
        winner_participant_id: context.fixture.home_participant_id,
      },
      {
        attempt_number: 1,
        status: 'technical_result',
        outcome: 'home_no_show',
        winner_participant_id: context.fixture.home_participant_id,
      },
    ]);
  });
});
