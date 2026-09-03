import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { applyMigrations } from '../../src/db/migrations.js';
import { buildApp } from '../../src/app.js';
import { createJwt } from '../../src/auth/jwt.js';
import { reconcileTournamentLifecycle } from '../../src/tournament/automaticLifecycle.js';
import { parseTournamentConfig } from '../../src/tournament/config.js';
import { lockTournament } from '../../src/tournament/locks.js';
import {
  applyToTournament,
  approveTournamentParticipant,
  generateRegularSchedule,
  inviteTournamentParticipant,
  publishRegularSchedule,
  startTournamentPlayoffs,
  type TournamentRulesSnapshot,
  updateTournamentDraft,
} from '../../src/tournament/service.js';
import {
  createTestPool,
  createTestRedis,
  getTestUrls,
  hasIntegrationEnv,
  resetDatabase,
  resetRedis,
} from '../helpers/testDb.js';
import { waitForBlockedWriter } from '../helpers/postgresLocks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');
const CLOSES_AT = new Date('2030-09-01T12:00:00.000Z');
const CREATOR_ID = '00000000-0000-4000-8000-000000000901';
const ADMIN_ID = '00000000-0000-4000-8000-000000000902';
const JWT_SECRET = 'automatic-lifecycle-access-secret';
const REFRESH_SECRET = 'automatic-lifecycle-refresh-secret';

function minuteAfter(date: Date): Date {
  return new Date(date.getTime() + 60_000);
}

function rules(source: 'head_to_head' | 'daily_aggregate' | 'classic', playoffSize: 2 | 4) {
  const base = {
    participantLimit: 4,
    playoffSize,
    timezone: 'Europe/Moscow',
    registrationMode: 'open' as const,
    visibility: 'public' as const,
    entryFeeCoins: 0,
  };
  const config =
    source === 'head_to_head'
      ? parseTournamentConfig({
          ...base,
          regularSource: source,
          roundRobinCycles: 1,
          roundsPerDay: 3,
          firstRoundLocalTime: '16:00',
          fixtureWindowMs: 60_000,
          roundBreakMs: 0,
          dailyDays: null,
          dailyMetric: null,
          bestDays: null,
        })
      : parseTournamentConfig({
          ...base,
          regularSource: source,
          roundRobinCycles: null,
          roundsPerDay: null,
          firstRoundLocalTime: null,
          fixtureWindowMs: null,
          roundBreakMs: null,
          dailyDays: 3,
          dailyMetric: 'goals_sum',
          bestDays: null,
          ...(source === 'classic'
            ? {
                classicRules: {
                  goalieId: 'classic-goalie',
                  shotsPerPeriod: 1,
                  periodDurationMs: 60_000,
                  breakDurationMs: 0,
                  incompleteResultPolicy: 'completed_game' as const,
                  periodSpeedPresets: [
                    {
                      periodNumber: 1 as const,
                      goalFrequency: 0.55,
                      goalieFrequency: 0.65,
                      shooterFrequency: 0.8,
                      puckSpeedPerMs: 1.3,
                    },
                    {
                      periodNumber: 2 as const,
                      goalFrequency: 0.72,
                      goalieFrequency: 0.84,
                      shooterFrequency: 1,
                      puckSpeedPerMs: 1.55,
                    },
                    {
                      periodNumber: 3 as const,
                      goalFrequency: 0.9,
                      goalieFrequency: 1.05,
                      shooterFrequency: 1.18,
                      puckSpeedPerMs: 1.8,
                    },
                  ],
                },
              }
            : {}),
        });
  return {
    config,
    automaticLifecycleVersion: 1,
    eligibility: {
      minLevel: null,
      maxLevel: null,
      minGoals: 0,
      minExperience: 0,
      invitedUserIds: [],
      bannedUserIds: [],
    },
  } satisfies TournamentRulesSnapshot;
}

async function seedAutomaticTournament(
  pool: Pool,
  input: {
    source?: 'head_to_head' | 'daily_aggregate' | 'classic';
    approved: number;
    playoffSize: 2 | 4;
    subscribedAdmins?: number;
    slugSuffix?: string;
    playerIdBase?: number;
  },
) {
  const source = input.source ?? 'head_to_head';
  const playerIdBase = input.playerIdBase ?? 910;
  const tournament = await pool.query<{ id: string }>(
    `insert into tournament
       (slug, title, status, regular_source, current_revision, registration_opens_at,
        registration_closes_at, starts_at, created_by)
     values ($1, 'Автоматический кубок', 'registration', $2, 1, $3, $4, $5, $6)
     returning id`,
    [
      `automatic-${source}-${input.approved}-${input.playoffSize}${input.slugSuffix ?? ''}`,
      source,
      new Date(CLOSES_AT.getTime() - 3_600_000),
      CLOSES_AT,
      new Date(CLOSES_AT.getTime() + 86_400_000),
      CREATOR_ID,
    ],
  );
  const tournamentId = tournament.rows[0]!.id;
  const revision = await pool.query<{ id: string }>(
    `insert into tournament_revision
       (tournament_id, revision, rules_snapshot, is_published, created_by, published_at)
     values ($1, 1, $2, true, $3, $4)
     returning id`,
    [tournamentId, JSON.stringify(rules(source, input.playoffSize)), CREATOR_ID, CLOSES_AT],
  );
  await pool.query(`update tournament set published_revision_id = $2 where id = $1`, [
    tournamentId,
    revision.rows[0]!.id,
  ]);

  for (let index = 0; index < input.approved; index += 1) {
    const userId = `00000000-0000-4000-8000-${String(playerIdBase + index).padStart(12, '0')}`;
    await pool.query(
      `insert into users (id, display_name, timezone, role)
       values ($1, $2, 'Europe/Moscow', 'player')`,
      [userId, `Игрок ${index + 1}`],
    );
    await pool.query(
      `insert into tournament_participant (tournament_id, user_id, state, joined_at)
       values ($1, $2, 'approved', $3)`,
      [tournamentId, userId, CLOSES_AT],
    );
  }

  if (input.subscribedAdmins !== undefined) {
    const subscribed = [CREATOR_ID, ADMIN_ID].slice(0, input.subscribedAdmins);
    for (const userId of subscribed) {
      await pool.query(
        `insert into push_subscriptions (user_id, endpoint, p256dh, auth)
         values ($1, $2, 'test-p256dh', 'test-auth')`,
        [userId, `https://push.example.test/${userId}`],
      );
    }
  }
  return { id: tournamentId, revision: 1 };
}

async function counts(pool: Pool, tournamentId: string) {
  const { rows } = await pool.query<{ matchdays: number; rounds: number; fixtures: number }>(
    `select
       (select count(*)::int from tournament_matchday where tournament_id = $1) as matchdays,
       (select count(*)::int from tournament_round where tournament_id = $1) as rounds,
       (select count(*)::int from tournament_fixture where tournament_id = $1) as fixtures`,
    [tournamentId],
  );
  return rows[0]!;
}

async function configureAutomaticPlayoffs(
  pool: Pool,
  input: { tournamentId: string; firstGameStartsAt: string },
): Promise<void> {
  const template = await pool.query<{ id: string }>(
    `select id from amateur_duel_template
      where deleted_at is null and is_active
      order by starts_at, id limit 1`,
  );
  await pool.query(
    `update tournament_revision
        set rules_snapshot = rules_snapshot || jsonb_build_object(
          'regularDuelTemplateId', $2::text,
          'playoffRounds', jsonb_build_array(jsonb_build_object(
            'roundNumber', 1,
            'winsRequired', 1,
            'homeSequence', jsonb_build_array('H'),
            'duelTemplateId', $2::text,
            'gameWindowMs', 3600000,
            'gameBreakMs', 0,
            'roundBreakMs', 0,
            'firstGameStartsAt', $3::text
          ))
        )
      where tournament_id = $1
        and revision = (select current_revision from tournament where id = $1)`,
    [input.tournamentId, template.rows[0]!.id, input.firstGameStartsAt],
  );
}

async function prepareCompletedHeadToHeadRegular(pool: Pool, input: { firstGameStartsAt: string }) {
  const tournament = await seedAutomaticTournament(pool, {
    source: 'head_to_head',
    approved: 4,
    playoffSize: 4,
  });
  await reconcileTournamentLifecycle(pool, { now: CLOSES_AT, tournamentId: tournament.id });
  await publishRegularSchedule(pool, tournament.id);
  await pool.query(
    `update tournament_fixture
        set status = 'settled', home_score = 1, away_score = 0,
            winner_participant_id = home_participant_id
      where tournament_id = $1`,
    [tournament.id],
  );
  await configureAutomaticPlayoffs(pool, {
    tournamentId: tournament.id,
    firstGameStartsAt: input.firstGameStartsAt,
  });
  return tournament;
}

async function reconcileAfterLockedParticipantMutation(
  pool: Pool,
  tournamentId: string,
  mutate: (client: PoolClient) => Promise<void>,
) {
  const blocker = await pool.connect();
  let transactionOpen = false;
  try {
    await blocker.query('begin');
    transactionOpen = true;
    const backend = await blocker.query<{ pid: number }>('select pg_backend_pid() as pid');
    await blocker.query(`select id from tournament where id = $1 for update`, [tournamentId]);

    const first = reconcileTournamentLifecycle(pool, { now: CLOSES_AT, tournamentId });
    const second = reconcileTournamentLifecycle(pool, { now: CLOSES_AT, tournamentId });
    await waitForBlockedWriter(pool, backend.rows[0]!.pid, /tournament/i);
    await mutate(blocker);
    await blocker.query('commit');
    transactionOpen = false;

    return Promise.all([first, second]);
  } finally {
    if (transactionOpen) await blocker.query('rollback');
    blocker.release();
  }
}

async function waitForBlockedTournamentUpdate(pool: Pool): Promise<void> {
  for (let attempt = 0; attempt < 1_000; attempt += 1) {
    const { rows } = await pool.query<{ query: string }>(
      `select query
         from pg_stat_activity
        where datname = current_database()
          and pid <> pg_backend_pid()
          and wait_event_type = 'Lock'
          and query ~* 'pg_advisory_xact_lock'`,
    );
    if (rows.length > 0) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error('revision update did not wait for the tournament advisory lock');
}

describe.skipIf(!hasIntegrationEnv)('automatic tournament lifecycle reconcile', () => {
  let pool: Pool;
  let app: FastifyInstance;
  let adminToken: string;

  beforeAll(async () => {
    pool = createTestPool();
    const { databaseUrl, redisUrl } = getTestUrls();
    const redis = createTestRedis();
    await resetRedis(redis);
    redis.disconnect();
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
        DAILY_SEED_SECRET: 'test-daily-seed-secret',
      },
    });
  });

  beforeEach(async () => {
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);
    await pool.query(
      `insert into users (id, display_name, timezone, role)
       values ($1, 'Создатель', 'Europe/Moscow', 'admin'),
              ($2, 'Администратор', 'Europe/Moscow', 'admin')`,
      [CREATOR_ID, ADMIN_ID],
    );
    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    adminToken = await jwt.issueAccessToken({ sub: ADMIN_ID });
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('creates a head-to-head schedule once after registration closes but leaves regular manual', async () => {
    const tournament = await seedAutomaticTournament(pool, {
      source: 'head_to_head',
      approved: 4,
      playoffSize: 4,
    });

    const first = await reconcileTournamentLifecycle(pool, {
      now: CLOSES_AT,
      tournamentId: tournament.id,
    });
    const second = await reconcileTournamentLifecycle(pool, {
      now: minuteAfter(CLOSES_AT),
      tournamentId: tournament.id,
    });

    expect(first.items[0]).toMatchObject({
      before: 'registration',
      after: 'scheduling',
      action: 'generate_schedule',
      changed: true,
    });
    expect(second.items[0]).toMatchObject({
      action: 'await_manual_regular_start',
      changed: false,
    });
    expect(await counts(pool, tournament.id)).toMatchObject({
      matchdays: 1,
      rounds: 3,
      fixtures: 6,
    });

    const beforeStaleGenerate = await pool.query<{ id: string }>(
      `select id from tournament_matchday where tournament_id = $1`,
      [tournament.id],
    );
    const staleGenerate = await generateRegularSchedule(pool, tournament.id, tournament.revision);
    const afterStaleGenerate = await pool.query<{ id: string }>(
      `select id from tournament_matchday where tournament_id = $1`,
      [tournament.id],
    );

    expect(staleGenerate).toMatchObject({ matchdayCount: 1, roundCount: 3, fixtureCount: 6 });
    expect(afterStaleGenerate.rows[0]!.id).toBe(beforeStaleGenerate.rows[0]!.id);
  });

  it('recovers a blocked head-to-head tournament by publishing a chosen valid playoff size before scheduling', async () => {
    const tournament = await seedAutomaticTournament(pool, {
      source: 'head_to_head',
      approved: 3,
      playoffSize: 4,
      slugSuffix: '-manual-override',
    });
    const automatic = await reconcileTournamentLifecycle(pool, {
      now: CLOSES_AT,
      tournamentId: tournament.id,
    });
    expect(automatic.items[0]).toMatchObject({ action: 'block_registration' });

    const firstResponse = await app.inject({
      method: 'POST',
      url: `/admin/tournaments/${tournament.id}/schedule/generate-manual`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { expectedRevision: tournament.revision, playoffSize: 2 },
    });
    const secondResponse = await app.inject({
      method: 'POST',
      url: `/admin/tournaments/${tournament.id}/schedule/generate-manual`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { expectedRevision: tournament.revision, playoffSize: 2 },
    });
    expect(firstResponse.statusCode).toBe(200);
    expect(secondResponse.statusCode).toBe(200);
    const first = firstResponse.json();
    const second = secondResponse.json();
    expect(first).toMatchObject({
      status: 'scheduling',
      participantCount: 3,
      playoffSize: 2,
      revision: 2,
      changed: true,
    });
    expect(first.fixtureCount).toBeGreaterThan(0);
    expect(second).toMatchObject({
      status: 'scheduling',
      participantCount: 3,
      playoffSize: 2,
      revision: 2,
      changed: false,
    });
    expect(second.fixtureCount).toBe(first.fixtureCount);
    const publishedRules = await pool.query<{ revision: number; playoff_size: number }>(
      `select revision, (rules_snapshot->'config'->>'playoffSize')::int as playoff_size
         from tournament_revision where tournament_id = $1 and is_published
         order by revision`,
      [tournament.id],
    );
    expect(publishedRules.rows).toEqual([
      { revision: 1, playoff_size: 4 },
      { revision: 2, playoff_size: 2 },
    ]);

    await configureAutomaticPlayoffs(pool, {
      tournamentId: tournament.id,
      firstGameStartsAt: '2030-09-03T12:00:00.000Z',
    });
    await publishRegularSchedule(pool, tournament.id);
    await pool.query(
      `update tournament_fixture
          set status = 'settled', outcome = 'home_win', home_score = 1, away_score = 0,
              winner_participant_id = home_participant_id
        where tournament_id = $1`,
      [tournament.id],
    );
    await expect(
      startTournamentPlayoffs(pool, tournament.id, new Date('2030-09-03T11:00:00.000Z')),
    ).resolves.toMatchObject({ status: 'playoff', created: true, seriesCount: 1 });
  });

  it('rejects recovery below two players, above the approved roster, and for daily or Classic tournaments', async () => {
    const tooFew = await seedAutomaticTournament(pool, {
      source: 'head_to_head',
      approved: 1,
      playoffSize: 4,
      slugSuffix: '-manual-too-few',
    });
    const daily = await seedAutomaticTournament(pool, {
      source: 'daily_aggregate',
      approved: 2,
      playoffSize: 4,
      slugSuffix: '-manual-daily',
      playerIdBase: 1_200,
    });
    const classic = await seedAutomaticTournament(pool, {
      source: 'classic',
      approved: 2,
      playoffSize: 4,
      slugSuffix: '-manual-classic',
      playerIdBase: 1_300,
    });
    const threePlayers = await seedAutomaticTournament(pool, {
      source: 'head_to_head',
      approved: 3,
      playoffSize: 4,
      slugSuffix: '-manual-too-large',
      playerIdBase: 1_400,
    });
    for (const tournament of [tooFew, daily, classic, threePlayers]) {
      await reconcileTournamentLifecycle(pool, { now: CLOSES_AT, tournamentId: tournament.id });
      await expect(
        generateRegularSchedule(pool, tournament.id, tournament.revision, {
          manualPlayoffSize: tournament.id === threePlayers.id ? 4 : 2,
          recoveredBy: ADMIN_ID,
        }),
      ).rejects.toMatchObject({ code: 'conflict' });
    }
  });

  it.each(['daily_aggregate', 'classic'] as const)(
    'creates only matchdays for %s',
    async (source) => {
      const tournament = await seedAutomaticTournament(pool, {
        source,
        approved: 4,
        playoffSize: 4,
      });

      await reconcileTournamentLifecycle(pool, {
        now: CLOSES_AT,
        tournamentId: tournament.id,
        classicSeedSecret: 'test-secret',
      });

      expect(await counts(pool, tournament.id)).toMatchObject({
        matchdays: 3,
        rounds: 0,
        fixtures: 0,
      });
    },
  );

  it.each(['daily_aggregate', 'classic'] as const)(
    'finalizes expired %s matchdays before it materializes duel-only playoffs',
    async (source) => {
      const tournament = await seedAutomaticTournament(pool, {
        source,
        approved: 4,
        playoffSize: 4,
      });
      await reconcileTournamentLifecycle(pool, {
        now: CLOSES_AT,
        tournamentId: tournament.id,
        classicSeedSecret: 'test-secret',
      });
      await publishRegularSchedule(pool, tournament.id);
      await configureAutomaticPlayoffs(pool, {
        tournamentId: tournament.id,
        firstGameStartsAt: '2030-10-27T15:00:00.000Z',
      });

      const report = await reconcileTournamentLifecycle(pool, {
        now: new Date('2030-10-27T15:00:00.000Z'),
        tournamentId: tournament.id,
        classicSeedSecret: 'test-secret',
      });
      const outcome = await pool.query<{
        result_count: number;
        playoff_fixture_count: number;
        non_duel_fixture_count: number;
      }>(
        `select
           (select count(*)::int from tournament_daily_result where tournament_id = $1) as result_count,
           (select count(*)::int from tournament_fixture where tournament_id = $1 and series_id is not null)
             as playoff_fixture_count,
           (select count(*)::int from tournament_fixture
             where tournament_id = $1 and series_id is not null
               and result_snapshot->>'duelTemplateId' is null) as non_duel_fixture_count`,
        [tournament.id],
      );

      expect(report.items[0]).toMatchObject({ action: 'start_playoff', after: 'playoff' });
      expect(outcome.rows[0]!.result_count).toBe(12);
      expect(outcome.rows[0]!.playoff_fixture_count).toBeGreaterThan(0);
      expect(outcome.rows[0]!.non_duel_fixture_count).toBe(0);
    },
  );

  it('uses the locked outcome when concurrent composition falls below the playoff size', async () => {
    const tournament = await seedAutomaticTournament(pool, {
      approved: 4,
      playoffSize: 4,
      subscribedAdmins: 2,
    });

    const reports = await reconcileAfterLockedParticipantMutation(
      pool,
      tournament.id,
      async (client) => {
        await client.query(
          `delete from tournament_participant
          where id = (
            select id from tournament_participant
             where tournament_id = $1 and state = 'approved'
             order by joined_at, id
             limit 1
          )`,
          [tournament.id],
        );
      },
    );
    const items = reports.map((report) => report.items[0]!);

    expect(items.filter((item) => item.changed)).toHaveLength(1);
    expect(items).toContainEqual(
      expect.objectContaining({
        action: 'block_registration',
        after: 'registration_blocked',
        changed: true,
        reason: 'not_enough_participants',
      }),
    );
    expect(items).toContainEqual(
      expect.objectContaining({
        action: 'unchanged',
        after: 'registration_blocked',
        changed: false,
        reason: 'not_enough_participants',
      }),
    );
    const deliveries = await pool.query<{ count: number }>(
      `select count(*)::int as count from push_delivery_log
        where event_type = 'tournament.registration_blocked'`,
    );
    expect(deliveries.rows[0]!.count).toBe(2);
  });

  it('uses the locked outcome when concurrent composition reaches the playoff size', async () => {
    const tournament = await seedAutomaticTournament(pool, { approved: 3, playoffSize: 4 });
    const latePlayerId = '00000000-0000-4000-8000-000000001000';

    const reports = await reconcileAfterLockedParticipantMutation(
      pool,
      tournament.id,
      async (client) => {
        await client.query(
          `insert into users (id, display_name, timezone, role)
         values ($1, 'Поздний игрок', 'Europe/Moscow', 'player')`,
          [latePlayerId],
        );
        await client.query(
          `insert into tournament_participant (tournament_id, user_id, state, joined_at)
         values ($1, $2, 'approved', $3)`,
          [tournament.id, latePlayerId, CLOSES_AT],
        );
      },
    );
    const items = reports.map((report) => report.items[0]!);

    expect(items.filter((item) => item.changed)).toHaveLength(1);
    expect(items).toContainEqual(
      expect.objectContaining({
        action: 'generate_schedule',
        after: 'scheduling',
        changed: true,
        reason: null,
      }),
    );
    expect(items).toContainEqual(
      expect.objectContaining({
        action: 'await_manual_regular_start',
        after: 'scheduling',
        changed: false,
        reason: null,
      }),
    );
    expect(await counts(pool, tournament.id)).toMatchObject({
      matchdays: 1,
      rounds: 3,
      fixtures: 6,
    });
  });

  it('blocks without shrinking playoff size and notifies creator and admins once', async () => {
    const tournament = await seedAutomaticTournament(pool, {
      approved: 3,
      playoffSize: 4,
      subscribedAdmins: 2,
    });
    const eventKey = `${tournament.id}:registration-blocked:${tournament.revision}`;

    await reconcileTournamentLifecycle(pool, { now: CLOSES_AT, tournamentId: tournament.id });
    await reconcileTournamentLifecycle(pool, {
      now: minuteAfter(CLOSES_AT),
      tournamentId: tournament.id,
    });

    const row = await pool.query<{ status: string; playoff_size: number }>(
      `select tournament.status, (revision.rules_snapshot->'config'->>'playoffSize')::int as playoff_size
         from tournament join tournament_revision revision on revision.id = tournament.published_revision_id
        where tournament.id = $1`,
      [tournament.id],
    );
    expect(row.rows[0]).toMatchObject({ status: 'registration_blocked', playoff_size: 4 });
    const deliveries = await pool.query<{ count: number }>(
      `select count(*)::int as count from push_delivery_log
        where event_type = 'tournament.registration_blocked' and event_key = $1`,
      [eventKey],
    );
    expect(deliveries.rows[0]!.count).toBe(2);
  });

  it('recovers blocked registration by extending the deadline before a player applies', async () => {
    const tournament = await seedAutomaticTournament(pool, {
      approved: 3,
      playoffSize: 4,
      subscribedAdmins: 2,
    });
    const latePlayerId = '00000000-0000-4000-8000-000000001001';
    const extendedClosesAt = new Date(CLOSES_AT.getTime() + 7_200_000);
    await pool.query(
      `insert into users (id, display_name, timezone, role)
       values ($1, 'Игрок после продления', 'Europe/Moscow', 'player')`,
      [latePlayerId],
    );
    await pool.query(`insert into user_currency_account (user_id, balance) values ($1, 0)`, [
      latePlayerId,
    ]);

    await reconcileTournamentLifecycle(pool, { now: CLOSES_AT, tournamentId: tournament.id });
    const updated = await updateTournamentDraft(pool, {
      tournamentId: tournament.id,
      expectedRevision: tournament.revision,
      title: 'Автоматический кубок',
      description: '',
      rules: rules('head_to_head', 4),
      updatedBy: CREATOR_ID,
      registrationOpensAt: new Date('2020-01-01T00:00:00.000Z'),
      registrationClosesAt: extendedClosesAt,
      startsAt: new Date(extendedClosesAt.getTime() + 86_400_000),
    });
    const application = await applyToTournament(pool, tournament.id, latePlayerId);
    const scheduled = await reconcileTournamentLifecycle(pool, {
      now: extendedClosesAt,
      tournamentId: tournament.id,
    });
    const repeated = await reconcileTournamentLifecycle(pool, {
      now: minuteAfter(extendedClosesAt),
      tournamentId: tournament.id,
    });
    const persisted = await pool.query<{
      status: string;
      playoff_size: number;
      blocked_deliveries: number;
    }>(
      `select tournament.status,
              (revision.rules_snapshot->'config'->>'playoffSize')::int as playoff_size,
              (select count(*)::int from push_delivery_log
                where event_type = 'tournament.registration_blocked'
                  and tournament_id = tournament.id) as blocked_deliveries
         from tournament
         join tournament_revision revision on revision.id = tournament.published_revision_id
        where tournament.id = $1`,
      [tournament.id],
    );

    expect(updated).toMatchObject({ status: 'registration', revision: 2 });
    expect(application).toMatchObject({ tournamentId: tournament.id, state: 'approved' });
    expect(scheduled.items[0]).toMatchObject({
      action: 'generate_schedule',
      after: 'scheduling',
      changed: true,
    });
    expect(repeated.items[0]).toMatchObject({
      action: 'await_manual_regular_start',
      changed: false,
    });
    expect(persisted.rows[0]).toEqual({
      status: 'scheduling',
      playoff_size: 4,
      blocked_deliveries: 2,
    });
    expect(await counts(pool, tournament.id)).toMatchObject({
      matchdays: 1,
      rounds: 3,
      fixtures: 6,
    });
  });

  it('recovers a blocked tournament after an invited player is approved', async () => {
    const tournament = await seedAutomaticTournament(pool, {
      source: 'daily_aggregate',
      approved: 3,
      playoffSize: 4,
      subscribedAdmins: 2,
      playerIdBase: 1_100,
    });
    const invitedPlayerId = '00000000-0000-4000-8000-000000001104';
    await pool.query(
      `insert into users (id, display_name, timezone, role)
       values ($1, 'Приглашённый игрок', 'Europe/Moscow', 'player')`,
      [invitedPlayerId],
    );
    await pool.query(`insert into user_currency_account (user_id, balance) values ($1, 0)`, [
      invitedPlayerId,
    ]);

    await reconcileTournamentLifecycle(pool, { now: CLOSES_AT, tournamentId: tournament.id });
    const invitation = await inviteTournamentParticipant(
      pool,
      tournament.id,
      invitedPlayerId,
      ADMIN_ID,
    );
    await approveTournamentParticipant(pool, tournament.id, invitation.participantId, ADMIN_ID);
    const scheduled = await reconcileTournamentLifecycle(pool, {
      now: minuteAfter(CLOSES_AT),
      tournamentId: tournament.id,
    });
    const repeated = await reconcileTournamentLifecycle(pool, {
      now: new Date(CLOSES_AT.getTime() + 120_000),
      tournamentId: tournament.id,
    });
    const persisted = await pool.query<{
      status: string;
      playoff_size: number;
      blocked_deliveries: number;
    }>(
      `select tournament.status,
              (revision.rules_snapshot->'config'->>'playoffSize')::int as playoff_size,
              (select count(*)::int from push_delivery_log
                where event_type = 'tournament.registration_blocked'
                  and tournament_id = tournament.id) as blocked_deliveries
         from tournament
         join tournament_revision revision on revision.id = tournament.published_revision_id
        where tournament.id = $1`,
      [tournament.id],
    );

    expect(scheduled.items[0]).toMatchObject({
      action: 'generate_schedule',
      after: 'scheduling',
      changed: true,
    });
    expect(repeated.items[0]).toMatchObject({
      action: 'await_manual_regular_start',
      changed: false,
    });
    expect(persisted.rows[0]).toEqual({
      status: 'scheduling',
      playoff_size: 4,
      blocked_deliveries: 2,
    });
    expect(await counts(pool, tournament.id)).toMatchObject({
      matchdays: 3,
      rounds: 0,
      fixtures: 0,
    });
  });

  it('continues bulk reconciliation after a broken tournament and reports its failure', async () => {
    const broken = await seedAutomaticTournament(pool, {
      approved: 0,
      playoffSize: 2,
      slugSuffix: '-broken-first',
    });
    const valid = await seedAutomaticTournament(pool, {
      approved: 2,
      playoffSize: 2,
      slugSuffix: '-valid-second',
      playerIdBase: 1_200,
    });
    await pool.query(
      `update tournament_revision
          set rules_snapshot = '{"automaticLifecycleVersion":1}'::jsonb
        where tournament_id = $1`,
      [broken.id],
    );
    await pool.query(
      `update tournament
          set created_at = case when id = $1 then '2020-01-01T00:00:00Z'::timestamptz
                                else '2020-01-02T00:00:00Z'::timestamptz end
        where id = any($2::uuid[])`,
      [broken.id, [broken.id, valid.id]],
    );

    const first = await reconcileTournamentLifecycle(pool, { now: CLOSES_AT });
    const second = await reconcileTournamentLifecycle(pool, { now: minuteAfter(CLOSES_AT) });

    expect(first).toMatchObject({
      scanned: 2,
      changed: 1,
      failures: [
        {
          tournamentId: broken.id,
          code: 'unexpected_error',
        },
      ],
    });
    expect(first.items).toContainEqual(
      expect.objectContaining({
        tournamentId: valid.id,
        action: 'generate_schedule',
        changed: true,
      }),
    );
    expect(second).toMatchObject({ scanned: 2, changed: 0 });
    expect(second.failures).toHaveLength(1);
    expect(second.items).toContainEqual(
      expect.objectContaining({
        tournamentId: valid.id,
        action: 'await_manual_regular_start',
        changed: false,
      }),
    );
    expect(await counts(pool, valid.id)).toMatchObject({
      matchdays: 1,
      rounds: 1,
      fixtures: 1,
    });
    await expect(
      reconcileTournamentLifecycle(pool, { now: CLOSES_AT, tournamentId: broken.id }),
    ).rejects.toThrow();
  });

  it('does not enqueue a new blocked delivery after a revision-only edit', async () => {
    const tournament = await seedAutomaticTournament(pool, {
      approved: 3,
      playoffSize: 4,
      subscribedAdmins: 2,
    });

    await reconcileTournamentLifecycle(pool, { now: CLOSES_AT, tournamentId: tournament.id });
    const updated = await updateTournamentDraft(pool, {
      tournamentId: tournament.id,
      expectedRevision: tournament.revision,
      title: 'Автоматический кубок, редакция',
      description: '',
      rules: rules('head_to_head', 4),
      updatedBy: CREATOR_ID,
      registrationOpensAt: new Date(CLOSES_AT.getTime() - 3_600_000),
      registrationClosesAt: CLOSES_AT,
      startsAt: new Date(CLOSES_AT.getTime() + 86_400_000),
    });

    await reconcileTournamentLifecycle(pool, {
      now: minuteAfter(CLOSES_AT),
      tournamentId: tournament.id,
    });

    const deliveries = await pool.query<{ count: number; revisions: string[] }>(
      `select count(*)::int as count, array_agg(distinct event_key order by event_key) as revisions
         from push_delivery_log
        where event_type = 'tournament.registration_blocked'`,
    );
    expect(updated.revision).toBe(2);
    expect(deliveries.rows[0]!.count).toBe(2);
    expect(deliveries.rows[0]!.revisions).toEqual([
      `${tournament.id}:registration-blocked:${tournament.revision}`,
    ]);
  });

  it('serializes a blocked delivery before a cross-revision retry', async () => {
    const tournament = await seedAutomaticTournament(pool, {
      approved: 3,
      playoffSize: 4,
      subscribedAdmins: 2,
    });
    const locker = await pool.connect();
    let lockTransactionOpen = false;
    let firstReconcile: Promise<Awaited<ReturnType<typeof reconcileTournamentLifecycle>>> | null =
      null;
    let revisionUpdate: Promise<Awaited<ReturnType<typeof updateTournamentDraft>>> | null = null;
    try {
      await locker.query('begin');
      lockTransactionOpen = true;
      const backend = await locker.query<{ pid: number }>('select pg_backend_pid() as pid');
      await locker.query('lock table push_delivery_log in share row exclusive mode');

      firstReconcile = reconcileTournamentLifecycle(pool, {
        now: CLOSES_AT,
        tournamentId: tournament.id,
      });
      await waitForBlockedWriter(pool, backend.rows[0]!.pid, /push_delivery_log/i);

      revisionUpdate = updateTournamentDraft(pool, {
        tournamentId: tournament.id,
        expectedRevision: tournament.revision,
        title: 'Автоматический кубок, межревизионный retry',
        description: '',
        rules: rules('head_to_head', 4),
        updatedBy: CREATOR_ID,
        registrationOpensAt: new Date(CLOSES_AT.getTime() - 3_600_000),
        registrationClosesAt: CLOSES_AT,
        startsAt: new Date(CLOSES_AT.getTime() + 86_400_000),
      });
      await waitForBlockedTournamentUpdate(pool);

      await locker.query('commit');
      lockTransactionOpen = false;
      const [first, updated] = await Promise.all([firstReconcile, revisionUpdate]);
      const second = await reconcileTournamentLifecycle(pool, {
        now: minuteAfter(CLOSES_AT),
        tournamentId: tournament.id,
      });

      expect(first.items[0]).toMatchObject({
        action: 'block_registration',
        changed: true,
      });
      expect(updated.revision).toBe(2);
      expect(second.items[0]).toMatchObject({ action: 'unchanged', changed: false });
      const deliveries = await pool.query<{ count: number; keys: string[] }>(
        `select count(*)::int as count, array_agg(distinct event_key order by event_key) as keys
           from push_delivery_log
          where event_type = 'tournament.registration_blocked'`,
      );
      expect(deliveries.rows[0]!.count).toBe(2);
      expect(deliveries.rows[0]!.keys).toEqual([
        `${tournament.id}:registration-blocked:${tournament.revision}`,
      ]);
    } finally {
      if (lockTransactionOpen) await locker.query('rollback');
      locker.release();
      await Promise.allSettled([firstReconcile, revisionUpdate].filter((value) => value !== null));
    }
  });

  it('keeps regular tournaments with no results away from playoff actions', async () => {
    const tournament = await seedAutomaticTournament(pool, { approved: 4, playoffSize: 4 });
    await pool.query(`update tournament set status = 'regular' where id = $1`, [tournament.id]);

    const report = await reconcileTournamentLifecycle(pool, {
      now: minuteAfter(CLOSES_AT),
      tournamentId: tournament.id,
    });

    expect(report.items[0]).toMatchObject({
      action: 'regular_active',
      changed: false,
      reason: null,
    });
  });

  it('does not start playoffs before the first configured game time', async () => {
    const tournament = await prepareCompletedHeadToHeadRegular(pool, {
      firstGameStartsAt: '2030-10-27T15:00:00.000Z',
    });

    const report = await reconcileTournamentLifecycle(pool, {
      now: new Date('2030-10-27T14:59:59.000Z'),
      tournamentId: tournament.id,
    });

    expect(report.items[0]).toMatchObject({ action: 'await_playoff_time', changed: false });
    expect(
      (
        await pool.query<{ status: string }>(`select status from tournament where id = $1`, [
          tournament.id,
        ])
      ).rows[0]?.status,
    ).toBe('regular');
  });

  it('starts playoffs once at the configured instant and creates only duel fixtures', async () => {
    const tournament = await prepareCompletedHeadToHeadRegular(pool, {
      firstGameStartsAt: '2030-10-27T15:00:00.000Z',
    });

    const first = await reconcileTournamentLifecycle(pool, {
      now: new Date('2030-10-27T15:00:00.000Z'),
      tournamentId: tournament.id,
    });
    const second = await reconcileTournamentLifecycle(pool, {
      now: new Date('2030-10-27T15:01:00.000Z'),
      tournamentId: tournament.id,
    });
    const playoff = await pool.query<{
      series_count: number;
      fixture_count: number;
      non_duel: number;
    }>(
      `select
         (select count(*)::int from tournament_playoff_series where tournament_id = $1) as series_count,
         (select count(*)::int from tournament_fixture where tournament_id = $1 and series_id is not null) as fixture_count,
         (select count(*)::int from tournament_fixture where tournament_id = $1
            and series_id is not null and result_snapshot->>'duelTemplateId' is null) as non_duel`,
      [tournament.id],
    );

    expect(first.items[0]).toMatchObject({
      action: 'start_playoff',
      after: 'playoff',
      changed: true,
    });
    expect(second.items[0]).toMatchObject({ action: 'playoff_active', changed: false });
    expect(playoff.rows[0]).toMatchObject({ series_count: 4, non_duel: 0 });
    expect(playoff.rows[0]!.fixture_count).toBeGreaterThan(0);
  });

  it('reports incomplete regular results after the playoff deadline and notifies admins once', async () => {
    const tournament = await seedAutomaticTournament(pool, {
      source: 'head_to_head',
      approved: 4,
      playoffSize: 4,
      subscribedAdmins: 2,
    });
    await reconcileTournamentLifecycle(pool, { now: CLOSES_AT, tournamentId: tournament.id });
    await publishRegularSchedule(pool, tournament.id);
    await configureAutomaticPlayoffs(pool, {
      tournamentId: tournament.id,
      firstGameStartsAt: '2030-10-27T15:00:00.000Z',
    });

    const first = await reconcileTournamentLifecycle(pool, {
      now: new Date('2030-10-27T15:00:00.000Z'),
      tournamentId: tournament.id,
    });
    await reconcileTournamentLifecycle(pool, {
      now: new Date('2030-10-27T15:01:00.000Z'),
      tournamentId: tournament.id,
    });
    const delivery = await pool.query<{ count: number }>(
      `select count(*)::int as count from push_delivery_log
        where event_type = 'tournament.playoff_blocked'
          and event_key = $1`,
      [`${tournament.id}:playoff-blocked:${tournament.revision}`],
    );

    expect(first.items[0]).toMatchObject({
      action: 'await_regular_results',
      reason: 'regular_results_incomplete',
      changed: false,
    });
    expect(delivery.rows[0]!.count).toBe(2);
  });

  it('does not finalize expired daily results for a legacy tournament or during dry-run', async () => {
    const legacy = await seedAutomaticTournament(pool, {
      source: 'daily_aggregate',
      approved: 4,
      playoffSize: 4,
    });
    await reconcileTournamentLifecycle(pool, { now: CLOSES_AT, tournamentId: legacy.id });
    await publishRegularSchedule(pool, legacy.id);
    await pool.query(
      `update tournament_revision
          set rules_snapshot = rules_snapshot - 'automaticLifecycleVersion'
        where tournament_id = $1 and revision = 1`,
      [legacy.id],
    );

    const dryRun = await seedAutomaticTournament(pool, {
      source: 'daily_aggregate',
      approved: 4,
      playoffSize: 4,
      slugSuffix: '-dry-run',
      playerIdBase: 2_000,
    });
    await reconcileTournamentLifecycle(pool, { now: CLOSES_AT, tournamentId: dryRun.id });
    await publishRegularSchedule(pool, dryRun.id);

    const now = new Date('2030-10-27T15:00:00.000Z');
    const legacyReport = await reconcileTournamentLifecycle(pool, {
      now,
      tournamentId: legacy.id,
      classicSeedSecret: 'test-secret',
    });
    await reconcileTournamentLifecycle(pool, {
      now,
      tournamentId: dryRun.id,
      classicSeedSecret: 'test-secret',
      dryRun: true,
    });
    const results = await pool.query<{ tournament_id: string; count: number }>(
      `select tournament_id, count(*)::int as count
         from tournament_daily_result
        where tournament_id = any($1::uuid[])
        group by tournament_id`,
      [[legacy.id, dryRun.id]],
    );

    expect(legacyReport.items[0]).toMatchObject({ action: 'legacy_requires_audit' });
    expect(results.rows).toEqual([]);
  });

  it('blocks a completed regular season without a configured playoff time and notifies admins once', async () => {
    const tournament = await seedAutomaticTournament(pool, {
      source: 'head_to_head',
      approved: 4,
      playoffSize: 4,
      subscribedAdmins: 2,
    });
    await reconcileTournamentLifecycle(pool, { now: CLOSES_AT, tournamentId: tournament.id });
    await publishRegularSchedule(pool, tournament.id);
    await pool.query(
      `update tournament_fixture
          set status = 'settled', home_score = 1, away_score = 0,
              winner_participant_id = home_participant_id
        where tournament_id = $1`,
      [tournament.id],
    );

    const first = await reconcileTournamentLifecycle(pool, {
      now: new Date('2030-10-27T15:00:00.000Z'),
      tournamentId: tournament.id,
    });
    await reconcileTournamentLifecycle(pool, {
      now: new Date('2030-10-27T15:01:00.000Z'),
      tournamentId: tournament.id,
    });
    const deliveries = await pool.query<{ count: number; title: string; body: string }>(
      `select count(*)::int as count,
              min(payload->>'title') as title,
              min(payload->>'body') as body
         from push_delivery_log
        where event_type = 'tournament.playoff_schedule_missing'
          and event_key = $1`,
      [`${tournament.id}:playoff-schedule-missing:${tournament.revision}`],
    );

    expect(first.items[0]).toMatchObject({
      action: 'playoff_schedule_missing',
      reason: 'playoff_schedule_missing',
      changed: false,
    });
    expect(deliveries.rows[0]).toEqual({
      count: 2,
      title: 'Настройте расписание плей-офф',
      body: 'В турнире «Автоматический кубок» завершён регулярный сезон. Укажите даты и время игр плей-офф.',
    });
  });

  it('allows only playoff scheduling changes to recover a regular tournament before the bracket exists', async () => {
    const tournament = await seedAutomaticTournament(pool, {
      source: 'head_to_head',
      approved: 4,
      playoffSize: 4,
    });
    await reconcileTournamentLifecycle(pool, { now: CLOSES_AT, tournamentId: tournament.id });
    await publishRegularSchedule(pool, tournament.id);
    await pool.query(
      `update tournament_fixture
          set status = 'settled', home_score = 1, away_score = 0,
              winner_participant_id = home_participant_id
        where tournament_id = $1`,
      [tournament.id],
    );
    const template = await pool.query<{ id: string }>(
      `select id from amateur_duel_template
        where deleted_at is null and is_active
        order by starts_at, id limit 1`,
    );
    await pool.query(
      `update tournament_revision
          set rules_snapshot = rules_snapshot || $2::jsonb
        where tournament_id = $1 and revision = 1`,
      [
        tournament.id,
        JSON.stringify({
          regularDuelTemplateId: template.rows[0]!.id,
          duelLifecycleVersion: 2,
          playoffRounds: [
            {
              roundNumber: 1,
              winsRequired: 1,
              homeSequence: ['H'],
              duelTemplateId: template.rows[0]!.id,
              gameWindowMs: 604_800_000,
              gameBreakMs: 0,
              roundBreakMs: 0,
            },
          ],
        }),
      ],
    );
    const current = await pool.query<{ rules_snapshot: TournamentRulesSnapshot }>(
      `select rules_snapshot from tournament_revision where tournament_id = $1 and revision = 1`,
      [tournament.id],
    );
    const scheduledRules: TournamentRulesSnapshot = {
      ...current.rows[0]!.rules_snapshot,
      playoffRounds: [
        {
          ...(current.rows[0]!.rules_snapshot.playoffRounds as Array<Record<string, unknown>>)[0]!,
          firstGameStartsAt: '2030-10-28T15:00:00.000Z',
          scheduleDays: [
            { localDate: '2030-10-28', firstWaveLocalTime: '18:00', maxResultGames: 1 },
          ],
        },
      ],
    };

    const updated = await updateTournamentDraft(pool, {
      tournamentId: tournament.id,
      expectedRevision: tournament.revision,
      title: 'Автоматический кубок',
      description: '',
      rules: { ...scheduledRules, duelLifecycleVersion: 1 },
      updatedBy: CREATOR_ID,
      registrationOpensAt: new Date(CLOSES_AT.getTime() - 3_600_000),
      registrationClosesAt: CLOSES_AT,
      startsAt: new Date(CLOSES_AT.getTime() + 86_400_000),
    });
    const recovered = await reconcileTournamentLifecycle(pool, {
      now: new Date('2030-10-27T15:00:00.000Z'),
      tournamentId: tournament.id,
    });

    expect(updated).toMatchObject({ status: 'regular', revision: 2 });
    expect(
      (
        await pool.query<{ duel_lifecycle_version: string | null }>(
          `select rules_snapshot->>'duelLifecycleVersion' as duel_lifecycle_version
             from tournament_revision where tournament_id = $1 and revision = 2`,
          [tournament.id],
        )
      ).rows[0]?.duel_lifecycle_version,
    ).toBe('2');
    expect(recovered.items[0]).toMatchObject({ action: 'await_playoff_time', reason: null });

    await expect(
      updateTournamentDraft(pool, {
        tournamentId: tournament.id,
        expectedRevision: updated.revision,
        title: 'Автоматический кубок',
        description: '',
        rules: {
          ...scheduledRules,
          config: { ...scheduledRules.config, playoffSize: 2 },
        },
        updatedBy: CREATOR_ID,
        registrationOpensAt: new Date(CLOSES_AT.getTime() - 3_600_000),
        registrationClosesAt: CLOSES_AT,
        startsAt: new Date(CLOSES_AT.getTime() + 86_400_000),
      }),
    ).rejects.toMatchObject({ code: 'conflict' });

    const bracketStarted = await reconcileTournamentLifecycle(pool, {
      now: new Date('2030-10-29T15:00:00.000Z'),
      tournamentId: tournament.id,
    });
    expect(bracketStarted.items[0]).toMatchObject({ action: 'start_playoff', changed: true });

    const rescheduledBracket = await updateTournamentDraft(pool, {
      tournamentId: tournament.id,
      expectedRevision: updated.revision,
      title: 'Автоматический кубок',
      description: '',
      rules: {
        ...scheduledRules,
        playoffRounds: [
          {
            ...(scheduledRules.playoffRounds as Array<Record<string, unknown>>)[0]!,
            firstGameStartsAt: '2030-10-30T15:00:00.000Z',
          },
        ],
      },
      updatedBy: CREATOR_ID,
      registrationOpensAt: new Date(CLOSES_AT.getTime() - 3_600_000),
      registrationClosesAt: CLOSES_AT,
      startsAt: new Date(CLOSES_AT.getTime() + 86_400_000),
    });
    expect(rescheduledBracket).toMatchObject({ status: 'playoff', revision: 3 });
  });

  it('accepts the schedule-only recovery through the admin route and reconciles the lifecycle', async () => {
    const tournament = await seedAutomaticTournament(pool, {
      source: 'head_to_head',
      approved: 4,
      playoffSize: 4,
      slugSuffix: '-route-recovery',
    });
    await reconcileTournamentLifecycle(pool, { now: CLOSES_AT, tournamentId: tournament.id });
    await publishRegularSchedule(pool, tournament.id);
    await pool.query(
      `update tournament_fixture
          set status = 'settled', home_score = 1, away_score = 0,
              winner_participant_id = home_participant_id
        where tournament_id = $1`,
      [tournament.id],
    );
    const template = await pool.query<{ id: string }>(
      `select id from amateur_duel_template
        where deleted_at is null and is_active
        order by starts_at, id limit 1`,
    );
    await pool.query(
      `update tournament_revision
          set rules_snapshot = rules_snapshot || $2::jsonb
        where tournament_id = $1 and revision = 1`,
      [
        tournament.id,
        JSON.stringify({
          regularDuelTemplateId: template.rows[0]!.id,
          playoffRounds: [
            {
              roundNumber: 1,
              winsRequired: 1,
              homeSequence: ['H'],
              duelTemplateId: template.rows[0]!.id,
              gameWindowMs: 604_800_000,
              gameBreakMs: 0,
              roundBreakMs: 0,
            },
          ],
        }),
      ],
    );
    const current = await pool.query<{ rules_snapshot: TournamentRulesSnapshot }>(
      `select rules_snapshot from tournament_revision where tournament_id = $1 and revision = 1`,
      [tournament.id],
    );
    const scheduledRules: TournamentRulesSnapshot = {
      ...current.rows[0]!.rules_snapshot,
      playoffRounds: [
        {
          ...(current.rows[0]!.rules_snapshot.playoffRounds as Array<Record<string, unknown>>)[0]!,
          firstGameStartsAt: '2030-10-28T15:00:00.000Z',
          scheduleDays: [
            { localDate: '2030-10-28', firstWaveLocalTime: '18:00', maxResultGames: 1 },
          ],
        },
      ],
    };

    const response = await app.inject({
      method: 'PATCH',
      url: `/admin/tournaments/${tournament.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        expectedRevision: tournament.revision,
        title: 'Автоматический кубок',
        description: '',
        imageUrl: null,
        rules: scheduledRules,
        registrationOpensAt: new Date(CLOSES_AT.getTime() - 3_600_000).toISOString(),
        registrationClosesAt: CLOSES_AT.toISOString(),
        startsAt: new Date(CLOSES_AT.getTime() + 86_400_000).toISOString(),
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ tournament: { status: 'regular', revision: 2 } });

    const lifecycle = await reconcileTournamentLifecycle(pool, {
      now: new Date('2030-10-27T15:00:00.000Z'),
      tournamentId: tournament.id,
    });
    expect(lifecycle.items[0]).toMatchObject({ action: 'await_playoff_time', reason: null });

    await reconcileTournamentLifecycle(pool, {
      now: new Date('2030-10-29T15:00:00.000Z'),
      tournamentId: tournament.id,
    });
    const afterBracket = await app.inject({
      method: 'PATCH',
      url: `/admin/tournaments/${tournament.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        expectedRevision: 2,
        title: 'Автоматический кубок',
        description: '',
        imageUrl: null,
        rules: {
          ...scheduledRules,
          playoffRounds: [
            {
              ...(scheduledRules.playoffRounds as Array<Record<string, unknown>>)[0]!,
              firstGameStartsAt: '2030-10-30T15:00:00.000Z',
            },
          ],
        },
        registrationOpensAt: new Date(CLOSES_AT.getTime() - 3_600_000).toISOString(),
        registrationClosesAt: CLOSES_AT.toISOString(),
        startsAt: new Date(CLOSES_AT.getTime() + 86_400_000).toISOString(),
      },
    });
    expect(afterBracket.statusCode).toBe(200);
    expect(afterBracket.json()).toMatchObject({ tournament: { status: 'playoff', revision: 3 } });
  });

  it('does not send a stale missing-schedule alert after the published revision adds a playoff time', async () => {
    const tournament = await seedAutomaticTournament(pool, {
      source: 'head_to_head',
      approved: 4,
      playoffSize: 4,
      subscribedAdmins: 2,
    });
    await reconcileTournamentLifecycle(pool, { now: CLOSES_AT, tournamentId: tournament.id });
    await publishRegularSchedule(pool, tournament.id);
    await pool.query(
      `update tournament_fixture
          set status = 'settled', home_score = 1, away_score = 0,
              winner_participant_id = home_participant_id
        where tournament_id = $1`,
      [tournament.id],
    );
    const template = await pool.query<{ id: string }>(
      `select id from amateur_duel_template
        where deleted_at is null and is_active
        order by starts_at, id limit 1`,
    );
    const blocker = await pool.connect();
    let transactionOpen = false;
    let reconcile: Promise<Awaited<ReturnType<typeof reconcileTournamentLifecycle>>> | null = null;
    try {
      await blocker.query('begin');
      transactionOpen = true;
      await lockTournament(blocker, tournament.id);

      reconcile = reconcileTournamentLifecycle(pool, {
        now: new Date('2030-10-27T15:00:00.000Z'),
        tournamentId: tournament.id,
      });
      await waitForBlockedTournamentUpdate(pool);

      const revision = await blocker.query<{ id: string }>(
        `with previous as (
           update tournament_revision
              set is_published = false
            where tournament_id = $1 and is_published
          returning tournament_id, rules_snapshot, created_by
         )
         insert into tournament_revision
           (tournament_id, revision, rules_snapshot, is_published, created_by, published_at)
         select tournament_id,
                2,
                rules_snapshot || jsonb_build_object(
                  'regularDuelTemplateId', $2::text,
                  'playoffRounds', jsonb_build_array(jsonb_build_object(
                    'roundNumber', 1,
                    'winsRequired', 1,
                    'homeSequence', jsonb_build_array('H'),
                    'duelTemplateId', $2::text,
                    'gameWindowMs', 3600000,
                    'gameBreakMs', 0,
                    'roundBreakMs', 0,
                    'firstGameStartsAt', '2030-10-27T16:00:00.000Z'
                  ))
                ),
                true,
                created_by,
                now()
           from previous
         returning id`,
        [tournament.id, template.rows[0]!.id],
      );
      await blocker.query(
        `update tournament
            set current_revision = 2, published_revision_id = $2
          where id = $1`,
        [tournament.id, revision.rows[0]!.id],
      );
      await blocker.query('commit');
      transactionOpen = false;

      const report = await reconcile;
      const deliveries = await pool.query<{ count: number }>(
        `select count(*)::int as count from push_delivery_log
          where event_type = 'tournament.playoff_schedule_missing'
            and event_key like $1`,
        [`${tournament.id}:playoff-schedule-missing:%`],
      );

      expect(report.items[0]).toMatchObject({ action: 'playoff_schedule_missing' });
      expect(deliveries.rows[0]!.count).toBe(0);
    } finally {
      if (transactionOpen) await blocker.query('rollback');
      blocker.release();
      await Promise.allSettled(reconcile === null ? [] : [reconcile]);
    }
  });

  it('does not send a stale incomplete-results alert after the last regular game settles', async () => {
    const tournament = await seedAutomaticTournament(pool, {
      source: 'head_to_head',
      approved: 4,
      playoffSize: 4,
      subscribedAdmins: 2,
    });
    await reconcileTournamentLifecycle(pool, { now: CLOSES_AT, tournamentId: tournament.id });
    await publishRegularSchedule(pool, tournament.id);
    await configureAutomaticPlayoffs(pool, {
      tournamentId: tournament.id,
      firstGameStartsAt: '2030-10-27T15:00:00.000Z',
    });
    const blocker = await pool.connect();
    let transactionOpen = false;
    let reconcile: Promise<Awaited<ReturnType<typeof reconcileTournamentLifecycle>>> | null = null;
    try {
      await blocker.query('begin');
      transactionOpen = true;
      await lockTournament(blocker, tournament.id);

      reconcile = reconcileTournamentLifecycle(pool, {
        now: new Date('2030-10-27T15:00:00.000Z'),
        tournamentId: tournament.id,
      });
      await waitForBlockedTournamentUpdate(pool);
      await blocker.query(
        `update tournament_fixture
            set status = 'settled', home_score = 1, away_score = 0,
                winner_participant_id = home_participant_id
          where tournament_id = $1`,
        [tournament.id],
      );
      await blocker.query('commit');
      transactionOpen = false;

      const report = await reconcile;
      const deliveries = await pool.query<{ count: number }>(
        `select count(*)::int as count from push_delivery_log
          where event_type = 'tournament.playoff_blocked'
            and event_key like $1`,
        [`${tournament.id}:playoff-blocked:%`],
      );

      expect(report.items[0]).toMatchObject({ action: 'await_regular_results' });
      expect(deliveries.rows[0]!.count).toBe(0);
    } finally {
      if (transactionOpen) await blocker.query('rollback');
      blocker.release();
      await Promise.allSettled(reconcile === null ? [] : [reconcile]);
    }
  });

  it('reports a changed lifecycle when it materializes a cutoff tie-break', async () => {
    const tournament = await seedAutomaticTournament(pool, {
      source: 'daily_aggregate',
      approved: 4,
      playoffSize: 2,
    });
    await reconcileTournamentLifecycle(pool, { now: CLOSES_AT, tournamentId: tournament.id });
    await publishRegularSchedule(pool, tournament.id);
    await configureAutomaticPlayoffs(pool, {
      tournamentId: tournament.id,
      firstGameStartsAt: '2030-10-27T15:00:00.000Z',
    });

    const report = await reconcileTournamentLifecycle(pool, {
      now: new Date('2030-10-27T15:00:00.000Z'),
      tournamentId: tournament.id,
    });
    const tieBreaks = await pool.query<{ count: number }>(
      `select count(*)::int as count from tournament_round
        where tournament_id = $1 and stage = 'tiebreak'`,
      [tournament.id],
    );

    expect(report.items[0]).toMatchObject({
      before: 'regular',
      after: 'regular',
      action: 'start_playoff',
      changed: true,
    });
    expect(tieBreaks.rows[0]!.count).toBe(1);
  });

  it('reports only one changed lifecycle item when concurrent reconciles start playoffs', async () => {
    const tournament = await prepareCompletedHeadToHeadRegular(pool, {
      firstGameStartsAt: '2030-10-27T15:00:00.000Z',
    });

    const reports = await Promise.all([
      reconcileTournamentLifecycle(pool, {
        now: new Date('2030-10-27T15:00:00.000Z'),
        tournamentId: tournament.id,
      }),
      reconcileTournamentLifecycle(pool, {
        now: new Date('2030-10-27T15:00:00.000Z'),
        tournamentId: tournament.id,
      }),
    ]);
    const items = reports.map((report) => report.items[0]!);

    expect(items.filter((item) => item.changed)).toHaveLength(1);
    expect(items).toContainEqual(
      expect.objectContaining({ action: 'start_playoff', after: 'playoff', changed: true }),
    );
    expect(items).toContainEqual(
      expect.objectContaining({ action: 'unchanged', after: 'playoff', changed: false }),
    );
  });
});
