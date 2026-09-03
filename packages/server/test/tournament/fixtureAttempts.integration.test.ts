import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createJwt } from '../../src/auth/jwt.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { createTournamentDuelMatch } from '../../src/duel/amateur/routes.js';
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
import { advanceTournamentPlayoffSeries } from '../../src/tournament/playoffSeriesLifecycle.js';
import {
  createTestPool,
  getTestUrls,
  hasIntegrationEnv,
  resetDatabase,
} from '../helpers/testDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');
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
  for (const [index, playerId] of PLAYER_IDS.entries()) {
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

async function preparePlayoffs(pool: Pool, tournamentId: string): Promise<void> {
  for (const playerId of PLAYER_IDS) {
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
  const row = fixture.rows[0]!;
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
  const row = fixture.rows[0]!;
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

  it('materializes DST-safe playoff game days and one initial attempt for every fixture', async () => {
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
    expect(firstRound.rows).toHaveLength(6);
    expect(
      firstRound.rows.map((row) => `${row.game_number}:${row.scheduled_starts_at.toISOString()}`),
    ).toEqual([
      '1:2030-10-26T17:00:00.000Z',
      '1:2030-10-26T17:00:00.000Z',
      '2:2030-10-26T17:20:00.000Z',
      '2:2030-10-26T17:20:00.000Z',
      '3:2030-10-27T17:00:00.000Z',
      '3:2030-10-27T17:00:00.000Z',
    ]);
    expect(firstRound.rows.every((row) => row.attempt_number === 1)).toBe(true);
    expect(firstRound.rows.every((row) => row.kind === 'initial')).toBe(true);
    expect(firstRound.rows.every((row) => row.is_result_bearing)).toBe(true);
    expect(firstRound.rows.filter((row) => row.status === 'conditional')).toHaveLength(2);
    expect(firstRound.rows[0]!.hard_deadline_at.toISOString()).toBe('2030-10-26T17:08:30.000Z');
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
    expect(fixtureCount.rows[0]).toEqual({ fixtures: 8, attempts: 8 });
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

  it('keeps the immutable attempt hard deadline when both players become ready', async () => {
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
    const scheduledStartsAt = new Date(Date.now() - 60_000);
    const readinessExpiresAt = new Date(scheduledStartsAt.getTime() + 120 * 60_000);
    const hardDeadlineAt = new Date(readinessExpiresAt.getTime() + 210_000);
    await pool.query(
      `update tournament_fixture_attempt
          set scheduled_starts_at = $2, readiness_expires_at = $3, hard_deadline_at = $4
        where fixture_id = $1`,
      [row.fixture_id, scheduledStartsAt, readinessExpiresAt, hardDeadlineAt],
    );
    await pool.query(
      `update tournament_fixture
          set scheduled_starts_at = $2, window_ends_at = $3
        where id = $1`,
      [row.fixture_id, scheduledStartsAt, hardDeadlineAt],
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
    for (const token of [homeToken, awayToken]) {
      const ready = await app.inject({
        method: 'POST',
        url: `/duel/amateur/matches/${opened.duelMatchId}/ready`,
        headers: { authorization: `Bearer ${token}` },
        payload: { loadout: {} },
      });
      expect(ready.statusCode).toBe(200);
    }

    const duel = await pool.query<{ status: string; ends_at: Date }>(
      `select status, ends_at from amateur_duel_match where id = $1`,
      [opened.duelMatchId],
    );
    expect(duel.rows[0]).toEqual({ status: 'active', ends_at: hardDeadlineAt });
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
        payload: { loadout: {} },
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

  it('creates one auto-continue playoff replay without overtime or double-counting tied scores', async () => {
    const { fixture, opened } = await openFirstPlayoffAttempt(pool, 'attempt-playoff-replay');
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
      readinessMode: 'auto_continue',
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
    ).toBe(10_000);
    expect(lifecycle.rows[0]).toMatchObject({
      fixture_status: 'scheduled',
      fixture_home_score: 0,
      fixture_away_score: 0,
      series_wins: 0,
      segment_count: 1,
      overtime_count: 0,
    });
  });

  it('late-opens a playoff auto-continue replay idempotently before its hard deadline', async () => {
    const { tournamentId, fixture, opened } = await openFirstPlayoffAttempt(
      pool,
      'attempt-playoff-replay-auto-continue',
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
          set state = 'completed', completed_at = now(), goals = 2, shots_taken = 4,
              active_duration_ms = 90000
        where match_id = $1`,
      [opened.duelMatchId],
    );
    const settled = await app.inject({
      method: 'GET',
      url: `/duel/amateur/matches/${opened.duelMatchId}`,
      headers: { authorization: `Bearer ${homeToken}` },
    });
    expect(settled.statusCode).toBe(200);

    const replay = await pool.query<{
      scheduled_starts_at: Date;
      readiness_expires_at: Date;
      hard_deadline_at: Date;
    }>(
      `select scheduled_starts_at, readiness_expires_at, hard_deadline_at
         from tournament_fixture_attempt
        where fixture_id = $1 and attempt_number = 2`,
      [fixture.fixture_id],
    );
    const replayAttempt = replay.rows[0]!;
    const lateOpenAt = new Date(replayAttempt.readiness_expires_at.getTime() + 1_000);
    expect(lateOpenAt.getTime()).toBeLessThan(replayAttempt.hard_deadline_at.getTime());

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(lateOpenAt);
    try {
      const responses = [];
      for (let request = 0; request < 2; request += 1) {
        const replayOpen = await app.inject({
          method: 'POST',
          url: `/tournaments/${tournamentId}/fixtures/${fixture.fixture_id}/segments/open`,
          headers: { authorization: `Bearer ${homeToken}` },
        });
        expect(replayOpen.statusCode).toBe(200);
        responses.push(replayOpen.json());
      }
      expect(responses[0]).toMatchObject({
        fixtureId: fixture.fixture_id,
        kind: 'regulation',
        sequenceNumber: 2,
      });
      expect(responses[1]).toEqual(responses[0]);
    } finally {
      vi.useRealTimers();
    }

    const lifecycle = await pool.query<{
      attempt_status: string;
      home_ready_at: Date | null;
      away_ready_at: Date | null;
      duel_status: string;
      duel_ends_at: Date;
      participant_states: string[];
      segment_count: number;
      regulation_count: number;
      active_segment_count: number;
      incident_count: number;
    }>(
      `select attempt.status as attempt_status, attempt.home_ready_at, attempt.away_ready_at,
              duel.status as duel_status, duel.ends_at as duel_ends_at,
              array_agg(participant.state order by participant.side) as participant_states,
              (select count(*)::int from tournament_fixture_segment segment
                where segment.fixture_id = fixture.id) as segment_count,
              (select count(*)::int from tournament_fixture_segment segment
                where segment.fixture_id = fixture.id and segment.kind = 'regulation')
                as regulation_count,
              (select count(*)::int from tournament_fixture_segment segment
                where segment.fixture_id = fixture.id and segment.status = 'active')
                as active_segment_count,
              (select count(*)::int from tournament_incident incident
                where incident.fixture_attempt_id = attempt.id) as incident_count
         from tournament_fixture_attempt attempt
         join tournament_fixture fixture on fixture.id = attempt.fixture_id
         join amateur_duel_match duel on duel.id = attempt.amateur_duel_match_id
         join amateur_duel_participant participant on participant.match_id = duel.id
        where attempt.fixture_id = $1 and attempt.attempt_number = 2
        group by attempt.id, duel.id, fixture.id`,
      [fixture.fixture_id],
    );
    expect(lifecycle.rows[0]).toMatchObject({
      attempt_status: 'active',
      duel_status: 'active',
      participant_states: ['accepted', 'accepted'],
      segment_count: 2,
      regulation_count: 2,
      active_segment_count: 1,
      incident_count: 0,
    });
    expect(lifecycle.rows[0]!.home_ready_at?.toISOString()).toBe(lateOpenAt.toISOString());
    expect(lifecycle.rows[0]!.away_ready_at?.toISOString()).toBe(lateOpenAt.toISOString());
    expect(lifecycle.rows[0]!.duel_ends_at.toISOString()).toBe(
      replayAttempt.hard_deadline_at.toISOString(),
    );
  });

  it('expires an unopened playoff auto-continue replay idempotently at its hard deadline', async () => {
    const context = await createPlayoffReplay(
      pool,
      app,
      'attempt-playoff-replay-unopened-deadline',
    );
    expect(context.replay.duel_match_id).toBeNull();
    expect(context.replay.snapshot).toMatchObject({ readinessMode: 'auto_continue' });

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(context.replay.hard_deadline_at);
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
      series_status: string;
      tournament_status: string;
      both_incomplete_count: number;
      both_no_show_count: number;
    }>(
      `select attempt.status as attempt_status, attempt.outcome as attempt_outcome,
              attempt.amateur_duel_match_id as duel_match_id,
              fixture.status as fixture_status, series.status as series_status,
              tournament.status as tournament_status,
              (select count(*)::int from tournament_incident incident
                where incident.fixture_attempt_id = attempt.id
                  and incident.kind = 'both_incomplete') as both_incomplete_count,
              (select count(*)::int from tournament_incident incident
                where incident.fixture_attempt_id = attempt.id
                  and incident.kind = 'both_no_show') as both_no_show_count
         from tournament_fixture_attempt attempt
         join tournament_fixture fixture on fixture.id = attempt.fixture_id
         join tournament_playoff_series series on series.id = fixture.series_id
         join tournament tournament on tournament.id = fixture.tournament_id
        where attempt.id = $1`,
      [context.replay.attempt_id],
    );
    expect(persisted.rows[0]).toEqual({
      attempt_status: 'needs_admin_decision',
      attempt_outcome: 'both_incomplete',
      duel_match_id: null,
      fixture_status: 'paused',
      series_status: 'paused',
      tournament_status: 'playoff',
      both_incomplete_count: 1,
      both_no_show_count: 0,
    });
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

  it('cancels every remaining open attempt when a playoff series is won', async () => {
    const context = await openFirstPlayoffAttempt(pool, 'attempt-series-cleanup');
    const client = await pool.connect();
    try {
      await client.query('begin');
      await advanceTournamentPlayoffSeries(client, {
        seriesId: context.fixture.series_id,
        winnerParticipantId: context.fixture.home_participant_id,
      });
      await advanceTournamentPlayoffSeries(client, {
        seriesId: context.fixture.series_id,
        winnerParticipantId: context.fixture.home_participant_id,
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
    expect(attempts.rows).toHaveLength(3);
    expect(attempts.rows.every((row) => row.status === 'cancelled')).toBe(true);
    expect(attempts.rows.every((row) => row.fixture_status === 'cancelled')).toBe(true);
    expect(attempts.rows.find((row) => row.duel_status !== null)?.duel_status).toBe('cancelled');
  });

  it('offers the next game only after both earned results and starts it when both choose now', async () => {
    const context = await openFirstPlayoffAttempt(pool, 'attempt-next-game-choice');
    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    const homeToken = await jwt.issueAccessToken({ sub: context.fixture.home_user_id });
    const awayToken = await jwt.issueAccessToken({ sub: context.fixture.away_user_id });
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
          set state = case when user_id = $2 then 'completed' else 'period_active' end,
              completed_at = case when user_id = $2 then now() else null end,
              current_period = case when user_id = $2 then 2 else 1 end,
              period_started_at = case when user_id = $2 then null else now() end,
              goals = case when user_id = $2 then 3 else 1 end,
              shots_taken = 5, active_duration_ms = 90000
        where match_id = $1`,
      [context.opened.duelMatchId, context.fixture.home_user_id],
    );
    const waiting = await app.inject({
      method: 'GET',
      url: `/tournaments/${context.tournamentId}/fixtures/${context.fixture.fixture_id}/attempt`,
      headers: { authorization: `Bearer ${homeToken}` },
    });
    expect(waiting.statusCode).toBe(200);
    expect(waiting.json().nextGameChoice).toBeNull();
    expect(waiting.json().opponentProgress).toMatchObject({
      state: 'period_active',
      currentPeriod: 1,
    });

    await pool.query(
      `update amateur_duel_participant
          set state = 'completed', completed_at = now(), current_period = 2,
              period_started_at = null, goals = case when user_id = $2 then 3 else 1 end,
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
    const choiceState = await app.inject({
      method: 'GET',
      url: `/tournaments/${context.tournamentId}/fixtures/${context.fixture.fixture_id}/attempt`,
      headers: { authorization: `Bearer ${homeToken}` },
    });
    expect(choiceState.statusCode).toBe(200);
    expect(choiceState.json().nextGameChoice).toMatchObject({
      myChoice: null,
      opponentChoice: null,
      canChoose: true,
      startsImmediately: false,
    });
    const nextFixtureId = choiceState.json().nextGameChoice.nextFixtureId as string;

    const homeChoice = await app.inject({
      method: 'POST',
      url: `/tournaments/${context.tournamentId}/fixtures/${context.fixture.fixture_id}/attempt/next-game-choice`,
      headers: { authorization: `Bearer ${homeToken}` },
      payload: { choice: 'immediate' },
    });
    expect(homeChoice.statusCode).toBe(200);
    expect(homeChoice.json()).toMatchObject({
      myChoice: 'immediate',
      opponentChoice: null,
      startsImmediately: false,
    });
    const awayChoice = await app.inject({
      method: 'POST',
      url: `/tournaments/${context.tournamentId}/fixtures/${context.fixture.fixture_id}/attempt/next-game-choice`,
      headers: { authorization: `Bearer ${awayToken}` },
      payload: { choice: 'immediate' },
    });
    expect(awayChoice.statusCode).toBe(200);
    expect(awayChoice.json()).toMatchObject({
      myChoice: 'immediate',
      opponentChoice: 'immediate',
      startsImmediately: true,
      nextFixtureId,
    });

    const nextAttempt = await pool.query<{
      status: string;
      scheduled_starts_at: Date;
      readiness_expires_at: Date;
      hard_deadline_at: Date;
      readiness_mode: string;
      fixture_starts_at: Date;
    }>(
      `select attempt.status, attempt.scheduled_starts_at, attempt.readiness_expires_at,
              attempt.hard_deadline_at,
              attempt.result_snapshot->>'readinessMode' as readiness_mode,
              fixture.scheduled_starts_at as fixture_starts_at
         from tournament_fixture_attempt attempt
         join tournament_fixture fixture on fixture.id = attempt.fixture_id
        where fixture.id = $1`,
      [nextFixtureId],
    );
    expect(nextAttempt.rows[0]).toMatchObject({
      status: 'pending',
      readiness_mode: 'next_game_auto_continue',
    });
    expect(nextAttempt.rows[0]!.fixture_starts_at.toISOString()).toBe(
      nextAttempt.rows[0]!.scheduled_starts_at.toISOString(),
    );
    expect(nextAttempt.rows[0]!.readiness_expires_at.getTime()).toBeGreaterThan(
      nextAttempt.rows[0]!.scheduled_starts_at.getTime(),
    );
    expect(
      nextAttempt.rows[0]!.readiness_expires_at.getTime() -
        nextAttempt.rows[0]!.scheduled_starts_at.getTime(),
    ).toBe(60_000);
    expect(nextAttempt.rows[0]!.hard_deadline_at.getTime()).toBeGreaterThan(
      nextAttempt.rows[0]!.readiness_expires_at.getTime(),
    );

    const openedNext = await app.inject({
      method: 'POST',
      url: `/tournaments/${context.tournamentId}/fixtures/${nextFixtureId}/segments/open`,
      headers: { authorization: `Bearer ${homeToken}` },
    });
    expect(openedNext.statusCode).toBe(200);
    const activeNext = await pool.query<{
      attempt_status: string;
      duel_status: string;
      ready_players: number;
    }>(
      `select attempt.status as attempt_status, duel.status as duel_status,
              count(*) filter (where participant.ready_at is not null)::int as ready_players
         from tournament_fixture_attempt attempt
         join amateur_duel_match duel on duel.id = attempt.amateur_duel_match_id
         join amateur_duel_participant participant on participant.match_id = duel.id
        where attempt.fixture_id = $1
        group by attempt.id, duel.id`,
      [nextFixtureId],
    );
    expect(activeNext.rows[0]).toEqual({
      attempt_status: 'active',
      duel_status: 'active',
      ready_players: 2,
    });
    const lateChange = await app.inject({
      method: 'POST',
      url: `/tournaments/${context.tournamentId}/fixtures/${context.fixture.fixture_id}/attempt/next-game-choice`,
      headers: { authorization: `Bearer ${awayToken}` },
      payload: { choice: 'scheduled' },
    });
    expect(lateChange.statusCode).toBe(409);
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

  it('keeps an admin reschedule aligned with a pending attempt and blocks player time proposals', async () => {
    const context = await openFirstPlayoffAttempt(pool, 'attempt-admin-reschedule');
    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    const adminToken = await jwt.issueAccessToken({ sub: ADMIN_ID });
    const homeToken = await jwt.issueAccessToken({ sub: context.fixture.home_user_id });
    const pending = await pool.query<{
      fixture_id: string;
      scheduled_starts_at: Date;
      readiness_expires_at: Date;
      hard_deadline_at: Date;
    }>(
      `select fixture.id as fixture_id, attempt.scheduled_starts_at,
              attempt.readiness_expires_at, attempt.hard_deadline_at
         from tournament_fixture fixture
         join tournament_fixture_attempt attempt on attempt.fixture_id = fixture.id
        where fixture.series_id = $1 and attempt.status = 'pending'
        order by fixture.fixture_number
        limit 1`,
      [context.fixture.series_id],
    );
    const original = pending.rows[0]!;
    const startsAt = new Date(original.scheduled_starts_at.getTime() + 3_600_000);
    const endsAt = new Date(original.hard_deadline_at.getTime() + 3_600_000);
    const rescheduled = await app.inject({
      method: 'PATCH',
      url: `/admin/tournaments/${context.tournamentId}/fixtures/${original.fixture_id}/schedule`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        reason: 'Перенос по решению администратора',
      },
    });
    expect(rescheduled.statusCode).toBe(200);
    const aligned = await pool.query<{
      fixture_starts_at: Date;
      fixture_ends_at: Date;
      attempt_starts_at: Date;
      attempt_readiness_at: Date;
      attempt_deadline_at: Date;
    }>(
      `select fixture.scheduled_starts_at as fixture_starts_at,
              fixture.window_ends_at as fixture_ends_at,
              attempt.scheduled_starts_at as attempt_starts_at,
              attempt.readiness_expires_at as attempt_readiness_at,
              attempt.hard_deadline_at as attempt_deadline_at
         from tournament_fixture fixture
         join tournament_fixture_attempt attempt on attempt.fixture_id = fixture.id
        where fixture.id = $1`,
      [original.fixture_id],
    );
    expect(aligned.rows[0]!.fixture_starts_at.toISOString()).toBe(startsAt.toISOString());
    expect(aligned.rows[0]!.fixture_ends_at.toISOString()).toBe(endsAt.toISOString());
    expect(aligned.rows[0]!.attempt_starts_at.toISOString()).toBe(startsAt.toISOString());
    expect(aligned.rows[0]!.attempt_deadline_at.toISOString()).toBe(endsAt.toISOString());
    expect(
      aligned.rows[0]!.attempt_readiness_at.getTime() -
        aligned.rows[0]!.attempt_starts_at.getTime(),
    ).toBe(original.readiness_expires_at.getTime() - original.scheduled_starts_at.getTime());

    const playerProposal = await app.inject({
      method: 'POST',
      url: `/tournaments/fixtures/${original.fixture_id}/live/proposals`,
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

  it('records technical attempts and cancels only unused games after disqualification', async () => {
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
      {
        attempt_number: 1,
        status: 'cancelled',
        outcome: 'cancelled',
        winner_participant_id: null,
      },
    ]);
  });
});
