import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { applyMigrations } from '../../src/db/migrations.js';
import {
  applyRemovedAchievementReconciliation,
  auditRemovedAchievement,
} from '../../src/ops/removedAchievementReconciliation.js';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

describe.skipIf(!hasIntegrationEnv)('removed achievement reconciliation', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);
  });
  beforeEach(async () => {
    await pool.query(`truncate users restart identity cascade`);
  });
  afterAll(async () => pool?.end());

  it('audits exact ledger deltas without writing and applies only with the matching artifact', async () => {
    const userId = await seedClaim(pool, 'steady-tempo', { stars: 5, experience: 5, tokens: 0 });
    const before = await balances(pool, userId);
    const audit = await auditRemovedAchievement(pool, 'steady-tempo');

    expect(audit.users).toEqual([
      expect.objectContaining({
        userId,
        deltas: { currency: 0, stars: 5, experience: 5, tokens: 0 },
        canApply: true,
      }),
    ]);
    await expect(balances(pool, userId)).resolves.toEqual(before);

    await applyRemovedAchievementReconciliation(pool, {
      achievementId: 'steady-tempo',
      exactUserIds: [userId],
      expectedHash: audit.hash,
      backupMarker: 'backup-test-001',
      now: new Date(audit.generatedAt),
    });
    await expect(balances(pool, userId)).resolves.toEqual({
      currency: 100,
      stars: 20,
      experience: 30,
      tokens: 10,
    });
    const state = await pool.query(
      `select 1 from user_achievements where user_id = $1 and achievement_id = 'steady-tempo'`,
      [userId],
    );
    expect(state.rowCount).toBe(0);
  });

  it('blocks the complete transaction when a current balance is insufficient', async () => {
    const userId = await seedClaim(pool, 'economical-master', {
      stars: 25,
      experience: 25,
      tokens: 1,
    });
    await pool.query(`update users set stars = 0 where id = $1`, [userId]);
    const audit = await auditRemovedAchievement(pool, 'economical-master');
    expect(audit.blockedUserIds).toEqual([userId]);
    await expect(
      applyRemovedAchievementReconciliation(pool, {
        achievementId: 'economical-master',
        exactUserIds: [userId],
        expectedHash: audit.hash,
        backupMarker: 'backup-test-002',
        now: new Date(audit.generatedAt),
      }),
    ).rejects.toThrow('insufficient balance');
    const state = await pool.query(
      `select 1 from user_achievements where user_id = $1 and achievement_id = 'economical-master'`,
      [userId],
    );
    expect(state.rowCount).toBe(1);
  });
});

async function seedClaim(
  pool: Pool,
  achievementId: 'steady-tempo' | 'economical-master',
  reward: { stars: number; experience: number; tokens: number },
): Promise<string> {
  const userId = randomUUID();
  await pool.query(
    `insert into users (id, display_name, avatar_url, level, timezone, stars, experience)
     values ($1, 'Reconciliation Player', null, 1, 'UTC', 25, 35)`,
    [userId],
  );
  await pool.query(
    `insert into user_currency_account (user_id, balance, reserved_balance) values ($1, 100, 0)`,
    [userId],
  );
  await pool.query(`insert into user_reward_token_account (user_id, balance) values ($1, 10)`, [
    userId,
  ]);
  await pool.query(
    `insert into user_achievements (user_id, achievement_id, completed_at, claimed_at)
     values ($1, $2, now(), now())`,
    [userId, achievementId],
  );
  await pool.query(
    `insert into currency_ledger
       (user_id, reason, available_delta, reserved_delta, balance_after, reserved_after, metadata)
     values ($1, 'achievement_reward', 0, 0, 100, 0, $2::jsonb)`,
    [
      userId,
      JSON.stringify({
        achievement_id: achievementId,
        stars: reward.stars,
        experience: reward.experience,
      }),
    ],
  );
  if (reward.tokens > 0) {
    await pool.query(
      `insert into achievement_token_ledger
         (user_id, achievement_id, stage_number, amount, balance_after)
       values ($1, $2, null, $3, 10)`,
      [userId, achievementId, reward.tokens],
    );
  }
  return userId;
}

async function balances(pool: Pool, userId: string) {
  const { rows } = await pool.query<{
    currency: string | number;
    stars: string | number;
    experience: string | number;
    tokens: string | number;
  }>(
    `select account.balance as currency, users.stars, users.experience, tokens.balance as tokens
       from users
       join user_currency_account account on account.user_id = users.id
       join user_reward_token_account tokens on tokens.user_id = users.id
      where users.id = $1`,
    [userId],
  );
  return {
    currency: Number(rows[0]!.currency),
    stars: Number(rows[0]!.stars),
    experience: Number(rows[0]!.experience),
    tokens: Number(rows[0]!.tokens),
  };
}
