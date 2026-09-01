import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createJwt } from '../../src/auth/jwt.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { createTournamentDuelMatch } from '../../src/duel/amateur/routes.js';
import { openTournamentFixtureSegment } from '../../src/tournament/fixtureLifecycle.js';
import { reconcileTournamentLifecycle } from '../../src/tournament/automaticLifecycle.js';
import { parseTournamentConfig } from '../../src/tournament/config.js';
import type { TournamentRulesSnapshot } from '../../src/tournament/service.js';
import { generateRegularSchedule, publishRegularSchedule } from '../../src/tournament/service.js';
import {
  createTestPool,
  getTestUrls,
  hasIntegrationEnv,
  resetDatabase,
} from '../helpers/testDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');
const JWT_SECRET = 'lifecycle-plugin-test-access-secret';
const REFRESH_SECRET = 'lifecycle-plugin-test-refresh-secret';
const DAILY_SEED_SECRET = 'lifecycle-plugin-test-daily-seed-secret';
const ADMIN_ID = '00000000-0000-4000-8000-000000000971';
const PLAYER_ID = '00000000-0000-4000-8000-000000000972';
const PLAYER_TWO_ID = '00000000-0000-4000-8000-000000000973';
const DUEL_TEMPLATE_ID = '00000000-0000-4000-8000-000000000974';

function automaticRules(
  playoffSize: 2 | 4,
  source: 'head_to_head' | 'daily_aggregate' = 'head_to_head',
): TournamentRulesSnapshot {
  return {
    config: parseTournamentConfig({
      regularSource: source,
      participantLimit: 4,
      playoffSize,
      timezone: 'Europe/Moscow',
      registrationMode: 'open',
      visibility: 'public',
      entryFeeCoins: 0,
      roundRobinCycles: source === 'head_to_head' ? 1 : null,
      roundsPerDay: source === 'head_to_head' ? 1 : null,
      firstRoundLocalTime: source === 'head_to_head' ? '16:00' : null,
      fixtureWindowMs: source === 'head_to_head' ? 60_000 : null,
      roundBreakMs: source === 'head_to_head' ? 0 : null,
      dailyDays: source === 'daily_aggregate' ? 1 : null,
      dailyMetric: source === 'daily_aggregate' ? 'goals_sum' : null,
      bestDays: null,
    }),
    automaticLifecycleVersion: 1,
    ...(source === 'head_to_head' ? { regularDuelTemplateId: DUEL_TEMPLATE_ID } : {}),
    eligibility: {
      minLevel: null,
      maxLevel: null,
      minGoals: 0,
      minExperience: 0,
      invitedUserIds: [],
      bannedUserIds: [],
    },
  };
}

async function seedAutomaticTournament(
  pool: Pool,
  input: { slug: string; playoffSize: 2 | 4; approvedUserIds: string[] },
): Promise<{ id: string; revision: number }> {
  const opensAt = new Date('2020-01-01T00:00:00.000Z');
  const closesAt = new Date('2020-01-01T01:00:00.000Z');
  const startsAt = new Date('2020-01-02T00:00:00.000Z');
  const tournament = await pool.query<{ id: string }>(
    `insert into tournament
       (slug, title, status, regular_source, current_revision, registration_opens_at,
        registration_closes_at, starts_at, created_by)
     values ($1, 'Автоматический турнир', 'registration', 'head_to_head', 1, $2, $3, $4, $5)
     returning id`,
    [input.slug, opensAt, closesAt, startsAt, ADMIN_ID],
  );
  const tournamentId = tournament.rows[0]!.id;
  const revision = await pool.query<{ id: string }>(
    `insert into tournament_revision
       (tournament_id, revision, rules_snapshot, is_published, created_by, published_at)
     values ($1, 1, $2, true, $3, $4)
     returning id`,
    [tournamentId, JSON.stringify(automaticRules(input.playoffSize)), ADMIN_ID, opensAt],
  );
  await pool.query(`update tournament set published_revision_id = $2 where id = $1`, [
    tournamentId,
    revision.rows[0]!.id,
  ]);
  await pool.query(
    `update amateur_duel_template set is_active = false where duel_kind = 'classic'`,
  );
  await pool.query(
    `insert into amateur_duel_template
         (id, title, description, difficulty, duel_kind, duel_variant, starts_at, ends_at,
          total_periods, shots_per_period, period_duration_ms, break_duration_ms, goalie_id,
          period_speed_presets, period_rules)
       values ($1, 'Lifecycle template', '', 'hard', 'classic', 'classic', $2, $3,
               1, 1, 60000, 0, 'rookie', $4::jsonb, $5::jsonb)`,
    [
      DUEL_TEMPLATE_ID,
      new Date('2020-01-01T00:00:00.000Z'),
      new Date('2100-01-01T00:00:00.000Z'),
      JSON.stringify([
        {
          periodNumber: 1,
          goalFrequency: 0.5,
          goalieFrequency: 0.5,
          shooterFrequency: 0.5,
          puckSpeedPerMs: 1,
        },
      ]),
      JSON.stringify([{ periodNumber: 1, mode: 'quota', durationMs: 60000, shotsLimit: 1 }]),
    ],
  );
  for (const userId of input.approvedUserIds) {
    await pool.query(
      `insert into tournament_participant (tournament_id, user_id, state, joined_at)
       values ($1, $2, 'approved', $3)`,
      [tournamentId, userId, opensAt],
    );
  }
  return { id: tournamentId, revision: 1 };
}

async function tournamentStatus(pool: Pool, tournamentId: string): Promise<string> {
  const result = await pool.query<{ status: string }>(
    `select status from tournament where id = $1`,
    [tournamentId],
  );
  return result.rows[0]!.status;
}

async function waitForTournamentStatus(
  pool: Pool,
  tournamentId: string,
  expectedStatus: string,
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if ((await tournamentStatus(pool, tournamentId)) === expectedStatus) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`tournament did not reach ${expectedStatus}`);
}

describe.skipIf(!hasIntegrationEnv)('tournament lifecycle plugin', () => {
  let pool: Pool;
  let app: FastifyInstance | undefined;
  let adminAuth: { authorization: string };
  let playerAuth: { authorization: string };

  beforeAll(async () => {
    const { databaseUrl, redisUrl } = getTestUrls();
    pool = createTestPool();
    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    adminAuth = { authorization: `Bearer ${await jwt.issueAccessToken({ sub: ADMIN_ID })}` };
    playerAuth = { authorization: `Bearer ${await jwt.issueAccessToken({ sub: PLAYER_ID })}` };
    // The app itself is intentionally created per test so the worker configuration is isolated.
    void databaseUrl;
    void redisUrl;
  });

  beforeEach(async () => {
    await app?.close();
    app = undefined;
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);
    await pool.query(
      `insert into users (id, display_name, timezone, role)
       values ($1, 'Администратор', 'Europe/Moscow', 'admin'),
              ($2, 'Игрок', 'Europe/Moscow', 'player'),
              ($3, 'Игрок 2', 'Europe/Moscow', 'player')`,
      [ADMIN_ID, PLAYER_ID, PLAYER_TWO_ID],
    );
    await pool.query(
      `insert into game_settings (key, value, label, description)
       values ('tournaments.enabled', 'true'::jsonb, 'Турниры включены', 'test')
       on conflict (key) do update set value = excluded.value`,
    );
  });

  afterAll(async () => {
    await app?.close();
    await pool.end();
  });

  async function createLifecycleApp(input: { lifecycleEnabled: boolean; intervalMs?: number }) {
    const { databaseUrl, redisUrl } = getTestUrls();
    return buildApp({
      config: {
        NODE_ENV: 'test',
        HOST: '0.0.0.0',
        PORT: 3000,
        LOG_LEVEL: 'warn',
        DATABASE_URL: databaseUrl,
        REDIS_URL: redisUrl,
        JWT_SECRET,
        REFRESH_SECRET,
        TELEGRAM_BOT_TOKEN: 'lifecycle-plugin-bot-token',
        DAILY_SEED_SECRET,
      },
      pushSchedulerEnabled: false,
      pushWorkerEnabled: false,
      tournamentLifecycleEnabled: input.lifecycleEnabled,
      ...(input.intervalMs === undefined
        ? {}
        : { tournamentLifecycleIntervalMs: input.intervalMs }),
    });
  }

  async function startApp(input: { lifecycleEnabled: boolean; intervalMs?: number }) {
    app = await createLifecycleApp(input);
    await app.ready();
    return app;
  }

  it('runs lifecycle when push scheduling and push worker are disabled', async () => {
    const tournament = await seedAutomaticTournament(pool, {
      slug: 'lifecycle-worker',
      playoffSize: 2,
      approvedUserIds: [PLAYER_ID, PLAYER_TWO_ID],
    });

    await startApp({ lifecycleEnabled: true, intervalMs: 20 });

    await waitForTournamentStatus(pool, tournament.id, 'scheduling');
  });

  it('keeps a single regular calendar when two workers become ready together', async () => {
    const tournament = await seedAutomaticTournament(pool, {
      slug: 'lifecycle-two-workers',
      playoffSize: 2,
      approvedUserIds: [PLAYER_ID, PLAYER_TWO_ID],
    });
    const [first, second] = await Promise.all([
      createLifecycleApp({ lifecycleEnabled: true }),
      createLifecycleApp({ lifecycleEnabled: true }),
    ]);
    try {
      await Promise.all([first.ready(), second.ready()]);
      expect(await tournamentStatus(pool, tournament.id)).toBe('scheduling');
      expect(
        await pool.query(
          `select id from tournament_round
            where tournament_id = $1 and stage = 'regular'`,
          [tournament.id],
        ),
      ).toMatchObject({ rowCount: 1 });
    } finally {
      await Promise.all([first.close(), second.close()]);
    }
  });

  it('reconciles on tournament list after a server restart missed the deadline', async () => {
    const tournament = await seedAutomaticTournament(pool, {
      slug: 'lifecycle-lazy-list',
      playoffSize: 2,
      approvedUserIds: [PLAYER_ID, PLAYER_TWO_ID],
    });
    const server = await startApp({ lifecycleEnabled: false });

    const response = await server.inject({
      method: 'GET',
      url: '/tournaments',
      headers: playerAuth,
    });

    expect(response.statusCode).toBe(200);
    expect(await tournamentStatus(pool, tournament.id)).toBe('scheduling');
  });

  it('keeps a committed tournament-duel settlement successful when lifecycle maintenance fails', async () => {
    const tournament = await seedAutomaticTournament(pool, {
      slug: 'lifecycle-maintenance-failure',
      playoffSize: 2,
      approvedUserIds: [PLAYER_ID, PLAYER_TWO_ID],
    });
    await generateRegularSchedule(pool, tournament.id, tournament.revision);
    await publishRegularSchedule(pool, tournament.id);
    const fixture = await pool.query<{
      id: string;
      home_user_id: string;
      away_user_id: string;
      scheduled_starts_at: Date;
    }>(
      `select fixture.id, home.user_id as home_user_id, away.user_id as away_user_id,
              fixture.scheduled_starts_at
         from tournament_fixture fixture
         join tournament_round round on round.id = fixture.round_id
         join tournament_participant home on home.id = fixture.home_participant_id
         join tournament_participant away on away.id = fixture.away_participant_id
        where fixture.tournament_id = $1 and round.stage = 'regular'
        order by fixture.fixture_number
        limit 1`,
      [tournament.id],
    );
    const row = fixture.rows[0]!;
    const opened = await openTournamentFixtureSegment(
      pool,
      {
        fixtureId: row.id,
        tournamentId: tournament.id,
        userId: row.home_user_id,
        now: new Date(row.scheduled_starts_at.getTime() + 1),
      },
      createTournamentDuelMatch,
    );
    const server = await startApp({ lifecycleEnabled: false });
    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(row.scheduled_starts_at.getTime() + 1));
    try {
      for (const userId of [row.home_user_id, row.away_user_id]) {
        const ready = await server.inject({
          method: 'POST',
          url: `/duel/amateur/matches/${opened.duelMatchId}/ready`,
          headers: { authorization: `Bearer ${await jwt.issueAccessToken({ sub: userId })}` },
          payload: { loadout: {} },
        });
        expect(ready.statusCode).toBe(200);
      }
      await pool.query(
        `update amateur_duel_participant
            set state = 'completed', completed_at = $2, goals = case when user_id = $3 then 2 else 0 end,
                shots_taken = 2, active_duration_ms = 1000
          where match_id = $1`,
        [opened.duelMatchId, new Date(row.scheduled_starts_at.getTime() + 2), row.home_user_id],
      );
      const originalQuery = server.pg.query.bind(server.pg);
      vi.spyOn(server.pg, 'query').mockImplementation(((query: unknown, ...args: unknown[]) => {
        if (
          typeof query === 'string' &&
          query.includes('from tournament_fixture_segment segment') &&
          query.includes("round.stage = 'regular'")
        ) {
          throw new Error('maintenance lookup unavailable');
        }
        return originalQuery(query as never, ...(args as never));
      }) as never);
      const settled = await server.inject({
        method: 'POST',
        url: `/duel/amateur/matches/${opened.duelMatchId}/settle`,
        headers: {
          authorization: `Bearer ${await jwt.issueAccessToken({ sub: row.home_user_id })}`,
        },
      });
      expect(settled.statusCode).toBe(200);
      expect(
        await pool.query(`select status from amateur_duel_match where id = $1`, [
          opened.duelMatchId,
        ]),
      ).toMatchObject({ rows: [{ status: 'settled' }] });
    } finally {
      vi.useRealTimers();
    }
  });

  it('retries a blocked tournament after an admin changes playoff size', async () => {
    const tournament = await seedAutomaticTournament(pool, {
      slug: 'lifecycle-blocked-retry',
      playoffSize: 4,
      approvedUserIds: [PLAYER_ID, PLAYER_TWO_ID],
    });
    await reconcileTournamentLifecycle(pool, { now: new Date(), tournamentId: tournament.id });
    expect(await tournamentStatus(pool, tournament.id)).toBe('registration_blocked');
    const server = await startApp({ lifecycleEnabled: false });

    const response = await server.inject({
      method: 'PATCH',
      url: `/admin/tournaments/${tournament.id}`,
      headers: adminAuth,
      payload: {
        expectedRevision: tournament.revision,
        title: 'Автоматический турнир',
        description: '',
        imageUrl: null,
        rules: automaticRules(2),
        registrationOpensAt: '2020-01-01T00:00:00.000Z',
        registrationClosesAt: '2020-01-01T01:00:00.000Z',
        startsAt: '2020-01-02T00:00:00.000Z',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(await tournamentStatus(pool, tournament.id)).toBe('scheduling');
    expect(
      await pool.query(
        `select round.id
           from tournament_round round
          where round.tournament_id = $1 and round.stage = 'regular'`,
        [tournament.id],
      ),
    ).toMatchObject({ rowCount: 1 });
  });
});
