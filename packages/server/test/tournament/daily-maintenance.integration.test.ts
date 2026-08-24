import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyMigrations } from '../../src/db/migrations.js';
import { dbPlugin } from '../../src/plugins/db.js';
import { pushSchedulerPlugin } from '../../src/plugins/pushScheduler.js';
import { finalizeDueTournamentDailyDays } from '../../src/tournament/dailyAggregate.js';
import {
  createTestPool,
  getTestUrls,
  hasIntegrationEnv,
  resetDatabase,
} from '../helpers/testDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

async function createDueDailyTournament(
  pool: Pool,
  input: { slug: string; startsAt: Date },
): Promise<{ tournamentId: string }> {
  const admin = await pool.query<{ id: string }>(
    `insert into users (id, display_name, timezone, role)
     values (gen_random_uuid(), 'Daily tournament admin', 'UTC', 'admin')
     returning id`,
  );
  const players = await pool.query<{ id: string }>(
    `insert into users (id, display_name, timezone)
     values
       (gen_random_uuid(), 'UTC player', 'UTC'),
       (gen_random_uuid(), 'Los Angeles player', 'America/Los_Angeles')
     returning id`,
  );
  const tournament = await pool.query<{ id: string }>(
    `insert into tournament
       (slug, title, status, regular_source, current_revision, starts_at, created_by)
     values ($1, 'Daily Maintenance', 'regular', 'daily_aggregate', 1, $2, $3)
     returning id`,
    [input.slug, input.startsAt, admin.rows[0]!.id],
  );
  const tournamentId = tournament.rows[0]!.id;
  const revision = await pool.query<{ id: string }>(
    `insert into tournament_revision
       (tournament_id, revision, rules_snapshot, is_published, created_by, published_at)
     values ($1, 1, $2, true, $3, now())
     returning id`,
    [
      tournamentId,
      JSON.stringify({
        config: {
          regularSource: 'daily_aggregate',
          dailyDays: 1,
          dailyMetric: 'goals_sum',
          bestDays: null,
        },
      }),
      admin.rows[0]!.id,
    ],
  );
  await pool.query(`update tournament set published_revision_id = $2 where id = $1`, [
    tournamentId,
    revision.rows[0]!.id,
  ]);
  for (const player of players.rows) {
    await pool.query(
      `insert into tournament_participant (tournament_id, user_id, state)
       values ($1, $2, 'approved')`,
      [tournamentId, player.id],
    );
  }
  return { tournamentId };
}

describe.skipIf(!hasIntegrationEnv)('daily tournament maintenance', () => {
  let pool: Pool;

  beforeAll(() => {
    pool = createTestPool();
  });

  beforeEach(async () => {
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('finalizes a due participant-local day once after every timezone has closed', async () => {
    const { tournamentId } = await createDueDailyTournament(pool, {
      slug: 'daily-maintenance',
      startsAt: new Date('2030-09-01T10:00:00.000Z'),
    });

    const beforeLastTimezoneClose = await finalizeDueTournamentDailyDays(
      pool,
      new Date('2030-09-02T06:59:59.000Z'),
    );
    const first = await finalizeDueTournamentDailyDays(pool, new Date('2030-09-02T07:00:00.000Z'));
    const second = await finalizeDueTournamentDailyDays(pool, new Date('2030-09-02T07:01:00.000Z'));

    expect(beforeLastTimezoneClose).toEqual({ finalizedDays: 0, finalizedParticipants: 0 });
    expect(first).toEqual({ finalizedDays: 1, finalizedParticipants: 2 });
    expect(second).toEqual({ finalizedDays: 0, finalizedParticipants: 0 });
    const results = await pool.query<{ completed: boolean; goals: number; place_points: number }>(
      `select completed, goals, place_points::float8 as place_points
         from tournament_daily_result
        where tournament_id = $1
        order by participant_id`,
      [tournamentId],
    );
    expect(results.rows).toEqual([
      { completed: false, goals: 0, place_points: 0 },
      { completed: false, goals: 0, place_points: 0 },
    ]);
  });

  it('lets only one concurrent due-day finalizer write the daily results', async () => {
    const { tournamentId } = await createDueDailyTournament(pool, {
      slug: 'daily-maintenance-concurrent',
      startsAt: new Date('2030-09-01T10:00:00.000Z'),
    });
    const now = new Date('2030-09-02T07:00:00.000Z');

    const results = await Promise.all([
      finalizeDueTournamentDailyDays(pool, now),
      finalizeDueTournamentDailyDays(pool, now),
    ]);

    expect(results).toContainEqual({ finalizedDays: 1, finalizedParticipants: 2 });
    expect(results).toContainEqual({ finalizedDays: 0, finalizedParticipants: 0 });
    const rows = await pool.query<{ result_count: string }>(
      `select count(*)::text as result_count
         from tournament_daily_result
        where tournament_id = $1`,
      [tournamentId],
    );
    expect(rows.rows).toEqual([{ result_count: '2' }]);
  });

  it('runs due-day maintenance when scheduling is enabled without VAPID credentials', async () => {
    const { tournamentId } = await createDueDailyTournament(pool, {
      slug: 'daily-maintenance-no-vapid',
      startsAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    });
    const app = Fastify();
    await app.register(dbPlugin, { connectionString: getTestUrls().databaseUrl });
    await app.register(pushSchedulerPlugin, {
      scheduleEnabled: true,
      workerEnabled: false,
      intervalMs: 10,
    });
    try {
      await app.ready();
      await vi.waitFor(
        async () => {
          const rows = await app.pg.query<{ result_count: string }>(
            `select count(*)::text as result_count
               from tournament_daily_result
              where tournament_id = $1`,
            [tournamentId],
          );
          expect(rows.rows).toEqual([{ result_count: '2' }]);
        },
        { timeout: 1_000, interval: 10 },
      );
    } finally {
      await app.close();
    }
  });
});
