import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runMonthlyRatingAchievementAudit } from '../../src/achievements/monthlyRatingAchievementAudit.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';

const migrations = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../db/migrations',
);

describe.skipIf(!hasIntegrationEnv)('monthly rating achievement audit', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, migrations);
  });

  beforeEach(async () => {
    await pool.query('truncate monthly_duel_rating_season, users cascade');
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('removes only a claimed monthly top-three achievement without a final top-three placement', async () => {
    const validUserId = randomUUID();
    const invalidUserId = randomUUID();
    await pool.query(
      `insert into users (id, display_name, timezone, xp, experience)
       values ($1, 'Valid podium', 'UTC', 50, 50),
              ($2, 'Invalid podium', 'UTC', 50, 50)`,
      [validUserId, invalidUserId],
    );
    await pool.query(
      `insert into user_currency_account (user_id, balance)
       values ($1, 3_750), ($2, 5_000)`,
      [validUserId, invalidUserId],
    );
    await pool.query(
      `insert into user_reward_token_account (user_id, balance)
       values ($1, 2), ($2, 3)`,
      [validUserId, invalidUserId],
    );
    await pool.query(
      `insert into monthly_duel_rating_season
         (season_key, eligible_count, rewarded_count, closed_at)
       values ('2026-08', 10, 3, now())`,
    );
    await pool.query(
      `insert into monthly_duel_rating_placement
         (season_key, user_id, place, points, wins, matches_played, active_duration_seconds,
          coins, stars, tokens, created_at)
       values ('2026-08', $1, 3, 10, 5, 30, 100, 7_500, 150, 5, now())`,
      [validUserId],
    );
    await pool.query(
      `insert into monthly_duel_rating_placement
         (season_key, user_id, place, points, wins, matches_played, active_duration_seconds,
          coins, stars, tokens, created_at)
       values ('2026-08', $1, 4, 9, 4, 29, 100, 0, 0, 0, now())`,
      [invalidUserId],
    );
    await pool.query(
      `insert into user_achievements
         (user_id, achievement_id, completed_at, claimed_at, completion_context)
       values
         ($1::uuid, 'monthly-top-3', now(), now(),
          jsonb_build_object('type', 'monthly_duel_rating_settled', 'seasonKey', '2026-08',
                             'userId', $1::text, 'place', 3)),
         ($2::uuid, 'monthly-top-3', now(), now(),
          jsonb_build_object('type', 'monthly_duel_rating_settled', 'seasonKey', '2026-08',
                             'userId', $2::text, 'place', 3))`,
      [validUserId, invalidUserId],
    );

    const report = await runMonthlyRatingAchievementAudit(pool, { apply: true, now: new Date() });

    expect(report.invalid).toEqual([
      expect.objectContaining({ userId: invalidUserId, achievementId: 'monthly-top-3' }),
    ]);
    await expect(
      pool.query(
        `select user_id, achievement_id from user_achievements
          where achievement_id = 'monthly-top-3' order by user_id`,
      ),
    ).resolves.toMatchObject({
      rows: [{ user_id: validUserId, achievement_id: 'monthly-top-3' }],
    });
    await expect(
      pool.query(
        `select u.xp, u.experience, c.balance as coins, t.balance as tokens
           from users u
           join user_currency_account c on c.user_id = u.id
           join user_reward_token_account t on t.user_id = u.id
          where u.id = $1`,
        [invalidUserId],
      ),
    ).resolves.toMatchObject({
      rows: [{ xp: 0, experience: 0, coins: 1_250, tokens: 1 }],
    });
  });
});
