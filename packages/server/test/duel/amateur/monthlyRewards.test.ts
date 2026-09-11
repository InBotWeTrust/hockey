import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  reconcileCompletedMonthlyRating,
  getPendingMonthlyRatingCongratulations,
  acknowledgeMonthlyRatingCongratulations,
} from '../../../src/duel/amateur/monthlyRewards.js';
import { applyMigrations } from '../../../src/db/migrations.js';
import { buildApp } from '../../../src/app.js';
import { createJwt } from '../../../src/auth/jwt.js';
import {
  createTestPool,
  getTestUrls,
  hasIntegrationEnv,
  resetDatabase,
} from '../../helpers/testDb.js';

const migrations = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../db/migrations',
);
const september = new Date('2026-08-31T21:00:00Z');

describe.skipIf(!hasIntegrationEnv)('monthly rating settlement', () => {
  let pool: Pool;
  let app: FastifyInstance;
  const jwtSecret = 'monthly-test-secret-at-least-16';
  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, migrations);
    const { databaseUrl, redisUrl } = getTestUrls();
    app = await buildApp({
      config: {
        NODE_ENV: 'test',
        HOST: '127.0.0.1',
        PORT: 3000,
        LOG_LEVEL: 'silent',
        DATABASE_URL: databaseUrl,
        REDIS_URL: redisUrl,
        JWT_SECRET: jwtSecret,
        REFRESH_SECRET: 'monthly-test-refresh-at-least-16',
        TELEGRAM_BOT_TOKEN: 'test-bot',
        DAILY_SEED_SECRET: 'monthly-test-daily-seed-at-least-16',
      },
      pushSchedulerEnabled: false,
      pushWorkerEnabled: false,
    });
  });
  beforeEach(async () => {
    await pool.query('truncate monthly_duel_rating_season, users cascade');
  });
  afterAll(async () => {
    await app?.close();
    await pool?.end();
  });

  async function seedSeason(season: string, count: number, ids?: string[]) {
    const users = ids ?? Array.from({ length: count }, () => randomUUID());
    if (!ids) {
      await pool.query(
        `insert into users (id, display_name, timezone)
        select id, 'Player ' || ordinal, 'UTC' from unnest($1::uuid[]) with ordinality as u(id, ordinal)`,
        [users],
      );
    }
    // Thirty real settled matches supply the production live view; each participant gets
    // a different points total so reward-band assertions are independent of UUID ordering.
    const { rows } = await pool.query<{ id: string }>(
      `insert into amateur_duel_match
      (challenger_user_id, opponent_user_id, status, season_key, rules_snapshot,
       match_seed, starts_at, ends_at, game_core_version)
      select $1, $2, 'settled', $3, '{}', 'seed', now(), now() + interval '1 hour', 1
      from generate_series(1, 30) returning id`,
      [users[0], users[1], season],
    );
    await pool.query(
      `insert into amateur_duel_rating_match
      (match_id, user_id, season_key, points, wins, active_duration_seconds)
      select m.id, u.id, $3, ($4::int - u.ordinal)::int, 1, 10
      from unnest($1::uuid[]) m(id), unnest($2::uuid[]) with ordinality u(id, ordinal)`,
      [rows.map((r) => r.id), users, season, count + 1],
    );
    return users;
  }

  async function placements(season = '2026-08') {
    return (
      await pool.query(
        `select * from monthly_duel_rating_placement where season_key = $1 order by place`,
        [season],
      )
    ).rows;
  }

  it('closes at Moscow midnight, never just before it, and freezes the snapshot', async () => {
    const users = await seedSeason('2026-08', 10);
    await reconcileCompletedMonthlyRating(pool, new Date('2026-08-31T20:59:59.999Z'));
    expect(await placements()).toHaveLength(0);
    await reconcileCompletedMonthlyRating(pool, september);
    expect(await placements()).toHaveLength(10);
    await pool.query('update amateur_duel_rating_match set points = 999 where user_id = $1', [
      users[9],
    ]);
    await reconcileCompletedMonthlyRating(pool, september);
    expect((await placements())[0].user_id).toBe(users[0]);
    expect((await pool.query('select * from monthly_duel_rating_season')).rows).toHaveLength(1);
  });

  it('uses the all-player final table for prizes and top-three achievements', async () => {
    const users = await seedSeason('2026-08', 10);
    await pool.query('update amateur_duel_rating_match set points = 0, wins = 0');
    const points = [27, 100, 90, 80, 70, 60, 50, 40, 10, 5];
    for (const [index, userId] of users.entries()) {
      await pool.query(
        `update amateur_duel_rating_match
            set points = $2
          where match_id = (
            select match_id from amateur_duel_rating_match
             where user_id = $1 order by match_id limit 1
          ) and user_id = $1`,
        [userId, points[index]],
      );
    }
    for (const userId of users.slice(3, 8)) {
      await pool.query(
        `delete from amateur_duel_rating_match
          where user_id = $1 and points = 0 and match_id = (
            select match_id from amateur_duel_rating_match
             where user_id = $1 and points = 0 order by match_id limit 1
          )`,
        [userId],
      );
    }

    await reconcileCompletedMonthlyRating(pool, september);

    const rows = await placements();
    expect(rows.map((row) => row.user_id)).toEqual([
      users[1],
      users[2],
      users[3],
      users[4],
      users[5],
      users[6],
      users[7],
      users[0],
      users[8],
      users[9],
    ]);
    expect(rows.slice(0, 3).map((row) => row.coins)).toEqual([15000, 10000, 7500]);
    expect(rows[7]).toMatchObject({ user_id: users[0], place: 8, coins: 0 });
    await expect(completedMonthlyAchievementIds(pool, users[0]!)).resolves.toEqual([]);
    await expect(completedMonthlyAchievementIds(pool, users[3]!)).resolves.toEqual(['monthly-top-3']);
  });

  it.each([
    [9, 0],
    [10, 3],
    [16, 3],
    [19, 3],
    [20, 4],
    [50, 10],
    [250, 50],
    [260, 50],
  ])(
    'with %i eligible players rewards exactly %i and persists eligibility counts',
    async (count, rewarded) => {
      await seedSeason('2026-08', count);
      await reconcileCompletedMonthlyRating(pool, september);
      const rows = await placements();
      expect(rows.filter((r) => r.coins + r.stars + r.tokens > 0)).toHaveLength(rewarded);
      expect(
        (await pool.query('select eligible_count, rewarded_count from monthly_duel_rating_season'))
          .rows,
      ).toEqual([{ eligible_count: count, rewarded_count: rewarded }]);
      expect(
        (await pool.query('select * from monthly_duel_rating_economy_event')).rows,
      ).toHaveLength(rewarded);
    },
  );

  it('pays all five bands into the existing balances and completes unclaimed career achievements', async () => {
    const users = await seedSeason('2026-08', 250);
    await reconcileCompletedMonthlyRating(pool, september);
    const rows = await placements();
    for (const [place, coins, stars, tokens] of [
      [1, 15000, 300, 10],
      [2, 10000, 200, 7],
      [3, 7500, 150, 5],
      [4, 0, 50, 3],
      [10, 0, 50, 3],
      [11, 0, 15, 1],
      [50, 0, 15, 1],
      [51, 0, 0, 0],
    ] as const)
      expect(rows[place - 1]).toMatchObject({ place, coins, stars, tokens });
    expect(
      (
        await pool.query(
          `select u.xp, c.balance, t.balance as tokens from users u
      join user_currency_account c on c.user_id = u.id join user_reward_token_account t on t.user_id = u.id
      where u.id = $1`,
          [users[0]],
        )
      ).rows[0],
    ).toEqual({ xp: 300, balance: 15000, tokens: 10 });
    expect(
      (
        await pool.query(
          `select achievement_id, claimed_at from user_achievements
      where user_id = $1 order by achievement_id`,
          [users[0]],
        )
      ).rows,
    ).toEqual([
      { achievement_id: 'monthly-top-1', claimed_at: null },
      { achievement_id: 'monthly-top-3', claimed_at: null },
    ]);
    expect(
      (
        await pool.query(
          `select available_delta, metadata from currency_ledger
      where user_id = $1 and reason = 'monthly_duel_rating_reward'`,
          [users[0]],
        )
      ).rows[0],
    ).toMatchObject({
      available_delta: 15000,
      metadata: { season_key: '2026-08', stars: 300, tokens: 10 },
    });
  });

  it('breaks equal monthly points by head-to-head results before total duels', async () => {
    const [headToHeadWinner, tiedOpponent, firstOpponent, secondOpponent] = Array.from(
      { length: 4 },
      () => randomUUID(),
    );
    await pool.query(
      `insert into users (id, display_name, timezone)
       values ($1, 'Zulu', 'UTC'), ($2, 'Alpha', 'UTC'), ($3, 'First', 'UTC'), ($4, 'Second', 'UTC')`,
      [headToHeadWinner, tiedOpponent, firstOpponent, secondOpponent],
    );
    await seedRatedMatch(pool, '2026-08', headToHeadWinner!, tiedOpponent!, 3, 0);
    await seedRatedMatch(pool, '2026-08', headToHeadWinner!, tiedOpponent!, 3, 0);
    await seedRatedMatch(pool, '2026-08', tiedOpponent!, firstOpponent!, 3, 0);
    await seedRatedMatch(pool, '2026-08', tiedOpponent!, secondOpponent!, 3, 0);
    await pool.query(
      'update amateur_duel_rating_match set active_duration_seconds = 100 where user_id = $1',
      [headToHeadWinner],
    );

    await reconcileCompletedMonthlyRating(pool, september);

    expect((await placements()).slice(0, 2).map((row) => row.user_id)).toEqual([
      headToHeadWinner,
      tiedOpponent,
    ]);
  });

  it('concurrent and repeated reconciliation pay once and keep unique season/user records', async () => {
    await seedSeason('2026-08', 10);
    await Promise.all(
      Array.from({ length: 4 }, () => reconcileCompletedMonthlyRating(pool, september)),
    );
    await reconcileCompletedMonthlyRating(pool, september);
    expect((await pool.query('select * from monthly_duel_rating_economy_event')).rows).toHaveLength(
      3,
    );
    expect(
      (
        await pool.query(
          "select sum(available_delta)::int as coins from currency_ledger where reason = 'monthly_duel_rating_reward'",
        )
      ).rows[0].coins,
    ).toBe(32500);
  });

  it('pending reconciles all older seasons, returns only positive owned rewards oldest first, and read is idempotent', async () => {
    const users = await seedSeason('2026-06', 10);
    await seedSeason('2026-08', 10, users);
    await seedSeason('2026-07', 10, users);
    await seedSeason('2026-09', 10, users);
    const pending = await getPendingMonthlyRatingCongratulations(pool, users[0]!, september);
    expect(pending.map((r) => r.season_key)).toEqual(['2026-06', '2026-07', '2026-08']);
    expect(
      (
        await pool.query(
          `select u.xp, c.balance, t.balance as tokens from users u
        join user_currency_account c on c.user_id = u.id
        join user_reward_token_account t on t.user_id = u.id where u.id = $1`,
          [users[0]],
        )
      ).rows[0],
    ).toEqual({ xp: 900, balance: 45000, tokens: 30 });
    expect(await getPendingMonthlyRatingCongratulations(pool, users[9]!, september)).toEqual([]);
    const id = pending[0]!.id;
    await expect(
      acknowledgeMonthlyRatingCongratulations(pool, users[1]!, id, september),
    ).rejects.toMatchObject({ statusCode: 404 });
    await acknowledgeMonthlyRatingCongratulations(pool, users[0]!, id, september);
    await acknowledgeMonthlyRatingCongratulations(pool, users[0]!, id, new Date('2026-09-02Z'));
    expect(
      (await pool.query('select viewed_at from monthly_duel_rating_placement where id = $1', [id]))
        .rows[0].viewed_at,
    ).toEqual(september);
    expect(
      (await getPendingMonthlyRatingCongratulations(pool, users[0]!, september)).map(
        (r) => r.season_key,
      ),
    ).toEqual(['2026-07', '2026-08']);
  });

  it('rolls back snapshots, achievements, events and all balances if a payout fails', async () => {
    const users = await seedSeason('2026-08', 10);
    await pool.query(
      'insert into user_reward_token_account (user_id, balance) values ($1, 2147483647)',
      [users[1]],
    );
    await expect(reconcileCompletedMonthlyRating(pool, september)).rejects.toThrow();
    expect(await placements()).toEqual([]);
    expect((await pool.query('select * from monthly_duel_rating_season')).rows).toEqual([]);
    expect((await pool.query('select * from monthly_duel_rating_economy_event')).rows).toEqual([]);
    expect((await pool.query('select * from user_achievements')).rows).toEqual([]);
    expect(
      (
        await pool.query(
          "select * from currency_ledger where reason = 'monthly_duel_rating_reward'",
        )
      ).rows,
    ).toEqual([]);
    expect((await pool.query('select xp from users where id = $1', [users[0]])).rows[0].xp).toBe(0);
  });

  it('exposes authenticated pending/read routes with owned positive rewards and validates IDs', async () => {
    const users = await seedSeason('2020-01', 10);
    const jwt = createJwt({
      accessSecret: jwtSecret,
      refreshSecret: 'monthly-test-refresh-at-least-16',
    });
    const owner = { authorization: `Bearer ${await jwt.issueAccessToken({ sub: users[0]! })}` };
    const foreign = { authorization: `Bearer ${await jwt.issueAccessToken({ sub: users[1]! })}` };
    const url = '/duel/amateur/rating/congratulations';
    expect((await app.inject({ method: 'GET', url: `${url}/pending` })).statusCode).toBe(401);
    const pending = await app.inject({ method: 'GET', url: `${url}/pending`, headers: owner });
    expect(pending.statusCode).toBe(200);
    const [entry] = pending.json().congratulations;
    expect(entry).toMatchObject({
      season_key: '2020-01',
      place: 1,
      coins: 15000,
      stars: 300,
      tokens: 10,
    });
    expect(
      (await app.inject({ method: 'POST', url: `${url}/${entry.id}/read`, headers: foreign }))
        .statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: 'POST', url: `${url}/invalid/read`, headers: owner })).statusCode,
    ).toBe(400);
    expect(
      (await app.inject({ method: 'POST', url: `${url}/${randomUUID()}/read`, headers: owner }))
        .statusCode,
    ).toBe(404);
    for (let i = 0; i < 2; i++) {
      const response = await app.inject({
        method: 'POST',
        url: `${url}/${entry.id}/read`,
        headers: owner,
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ ok: true });
    }
    expect(
      (await app.inject({ method: 'GET', url: `${url}/pending`, headers: owner })).json(),
    ).toEqual({ congratulations: [] });
  });
});

async function completedMonthlyAchievementIds(pool: Pool, userId: string): Promise<string[]> {
  const { rows } = await pool.query<{ achievement_id: string }>(
    `select achievement_id from user_achievements
      where user_id = $1 and achievement_id in ('monthly-top-1', 'monthly-top-3')
      order by achievement_id`,
    [userId],
  );
  return rows.map((row) => row.achievement_id);
}

async function seedRatedMatch(
  pool: Pool,
  seasonKey: string,
  firstUserId: string,
  secondUserId: string,
  firstPoints: number,
  secondPoints: number,
): Promise<void> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into amateur_duel_match
      (challenger_user_id, opponent_user_id, status, ranked, season_key, rules_snapshot,
       match_seed, starts_at, ends_at, game_core_version)
     values ($1, $2, 'settled', true, $3, '{}', 'head-to-head-seed', now(), now() + interval '1 hour', 1)
     returning id`,
    [firstUserId, secondUserId, seasonKey],
  );
  const match = rows[0];
  if (!match) throw new Error('seeded match is missing');
  await pool.query(
    `insert into amateur_duel_rating_match
     (match_id, user_id, season_key, points, wins, losses, active_duration_seconds)
     values ($1, $2, $4, $5, case when $5::int > $6::int then 1 else 0 end, case when $5::int < $6::int then 1 else 0 end, 10),
            ($1, $3, $4, $6, case when $6::int > $5::int then 1 else 0 end, case when $6::int < $5::int then 1 else 0 end, 10)`,
    [match.id, firstUserId, secondUserId, seasonKey, firstPoints, secondPoints],
  );
}
