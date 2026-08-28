import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyMigrations } from '../../src/db/migrations.js';
import { dbPlugin } from '../../src/plugins/db.js';
import { pushSchedulerPlugin } from '../../src/plugins/pushScheduler.js';
import {
  finalizeDueTournamentDailyDays,
  refreshCompletedTournamentDailyResultsForUser,
  refreshCompletedTournamentDailyResultsForTournament,
} from '../../src/tournament/dailyAggregate.js';
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
): Promise<{ tournamentId: string; playerIds: string[] }> {
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
  return { tournamentId, playerIds: players.rows.map((player) => player.id) };
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

  it('shows a completed daily game in provisional standings before the other local day closes', async () => {
    const startsAt = new Date('2030-09-01T10:00:00.000Z');
    const { tournamentId, playerIds } = await createDueDailyTournament(pool, {
      slug: 'daily-live-standings',
      startsAt,
    });
    const completedPlayerId = playerIds[0]!;
    const dayPool = await pool.query<{ id: string }>(
      `insert into day_pool
         (user_id, day_date, state, current_period, closed_at, game_core_version, daily_seed)
       values ($1, '2030-09-01', 'closed', 3, $2, 1, 'daily-live-result')
       returning id`,
      [completedPlayerId, new Date('2030-09-01T18:00:00.000Z')],
    );
    await pool.query(
      `insert into period_log
         (day_pool_id, period_number, started_at, ended_at, shots_taken, goals, closed_reason)
       values
         ($1, 1, '2030-09-01T12:00:00Z', '2030-09-01T12:10:00Z', 30, 8, 'quota'),
         ($1, 2, '2030-09-01T13:00:00Z', '2030-09-01T13:10:00Z', 30, 9, 'quota'),
         ($1, 3, '2030-09-01T14:00:00Z', '2030-09-01T14:10:00Z', 30, 10, 'quota')`,
      [dayPool.rows[0]!.id],
    );

    const refreshed = await refreshCompletedTournamentDailyResultsForUser(pool, {
      userId: completedPlayerId,
      now: new Date('2030-09-01T18:01:00.000Z'),
    });

    expect(refreshed).toEqual({ refreshedDays: 1, refreshedParticipants: 1 });
    const standings = await pool.query<{
      user_id: string;
      goals: number;
      completed: boolean;
      rank: number;
    }>(
      `select p.user_id, coalesce(r.goals, 0)::int as goals,
              coalesce(r.completed, false) as completed, s.rank
         from tournament_standing s
         join tournament_participant p on p.id = s.participant_id
         left join tournament_daily_result r
           on r.tournament_id = s.tournament_id
          and r.participant_id = s.participant_id
          and r.tournament_day = 1
        where s.tournament_id = $1
        order by s.rank, p.user_id`,
      [tournamentId],
    );
    expect(standings.rows).toEqual([
      { user_id: completedPlayerId, goals: 27, completed: true, rank: 1 },
      {
        user_id: playerIds[1]!,
        goals: 0,
        completed: false,
        rank: 2,
      },
    ]);
  });

  it('restores zero standings for an existing regular daily tournament before anyone plays', async () => {
    const { tournamentId, playerIds } = await createDueDailyTournament(pool, {
      slug: 'daily-existing-zero-standings',
      startsAt: new Date('2030-09-01T10:00:00.000Z'),
    });

    await expect(
      refreshCompletedTournamentDailyResultsForTournament(pool, {
        tournamentId,
        now: new Date('2030-09-01T11:00:00.000Z'),
      }),
    ).resolves.toEqual({ refreshedDays: 0, refreshedParticipants: 0 });

    const standings = await pool.query<{ user_id: string; rank: number; points: string }>(
      `select participant.user_id, standing.rank, standing.points::text
         from tournament_standing standing
         join tournament_participant participant on participant.id = standing.participant_id
        where standing.tournament_id = $1
        order by participant.user_id`,
      [tournamentId],
    );
    expect(standings.rows.map((row) => row.user_id).sort()).toEqual(playerIds.sort());
    expect(standings.rows.map((row) => row.rank).sort()).toEqual([1, 2]);
    expect(standings.rows.every((row) => row.points === '0.0000')).toBe(true);
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
    await pool.query(
      `update game_settings set value = 'true'::jsonb where key = 'tournaments.enabled'`,
    );
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
      await pool.query(
        `update game_settings set value = 'false'::jsonb where key = 'tournaments.enabled'`,
      );
    }
  });
});
