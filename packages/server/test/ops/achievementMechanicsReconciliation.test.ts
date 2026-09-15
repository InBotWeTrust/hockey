import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { applyMigrations } from '../../src/db/migrations.js';
import { runAchievementMechanicsReconciliation } from '../../src/ops/achievementMechanicsReconciliation.js';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';

const migrations = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../db/migrations');

describe.skipIf(!hasIntegrationEnv)('achievement mechanics production reconciliation', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, migrations);
  });

  beforeEach(async () => {
    await pool.query('truncate users cascade');
    await pool.query('truncate achievement_mechanics_reconciliation_run cascade');
  });

  afterAll(async () => pool?.end());

  it('caps deductions, preserves ledgers, resets later streak stages, and is idempotent', async () => {
    const userId = randomUUID();
    const runId = randomUUID();
    await pool.query(
      `insert into users (id, display_name, timezone, xp, experience)
       values ($1, 'Reconciled player', 'UTC', 4, 3)`,
      [userId],
    );
    await pool.query(`insert into user_currency_account (user_id, balance) values ($1, 2)`, [userId]);
    await pool.query(`insert into user_reward_token_account (user_id, balance) values ($1, 1)`, [userId]);
    await pool.query(
      `insert into achievement_token_ledger
         (user_id, achievement_id, stage_number, amount, balance_after)
       values ($1, 'dangerous-guest', 1, 5, 5)`,
      [userId],
    );
    await pool.query(
      `insert into user_achievement_stages
         (user_id, achievement_id, stage_number, opened_at, progress, completed_at, claimed_at, reward_snapshot)
       values
         ($1, 'dangerous-guest', 1, now() - interval '2 days', '{"wins":3}', now() - interval '2 days', now() - interval '2 days',
          '{"currency":0,"stars":5,"experience":5,"tokens":5}'),
         ($1, 'dangerous-guest', 2, now() - interval '1 day', '{"wins":4}', now() - interval '1 day', now() - interval '1 day',
          '{"currency":7,"stars":8,"experience":9,"tokens":2}')`,
      [userId],
    );

    const dryRun = await runAchievementMechanicsReconciliation(pool, { mode: 'dry-run', runId });
    expect(dryRun.users[0]).toMatchObject({
      deductions: { currency: 2, stars: 4, experience: 3, tokens: 1 },
      balancesAfter: { currency: 0, stars: 0, experience: 0, tokens: 0 },
      removeStages: [{ achievementId: 'dangerous-guest', stageNumber: 2 }],
    });

    await runAchievementMechanicsReconciliation(pool, {
      mode: 'apply', runId, backupMarker: 'backup-test-001',
      expectedHash: dryRun.auditHash, expectedUserCount: dryRun.totals.users,
    });
    const repeated = await runAchievementMechanicsReconciliation(pool, {
      mode: 'apply', runId, backupMarker: 'backup-test-001',
      expectedHash: dryRun.auditHash, expectedUserCount: dryRun.totals.users,
    });
    expect(repeated.totals).toEqual({ users: 0, removedStages: 0, currency: 0, stars: 0, experience: 0, tokens: 0 });

    const state = await pool.query(
      `select users.xp, users.experience, currency.balance as currency, tokens.balance as tokens
         from users
         join user_currency_account currency on currency.user_id = users.id
         join user_reward_token_account tokens on tokens.user_id = users.id
        where users.id = $1`,
      [userId],
    );
    expect(state.rows).toEqual([{ xp: 0, experience: 0, currency: 0, tokens: 0 }]);
    await expect(pool.query(`select amount from achievement_token_ledger where user_id = $1`, [userId]))
      .resolves.toMatchObject({ rows: [{ amount: 5 }] });
    await expect(pool.query(
      `select stage_number, progress from user_achievement_stages
        where user_id = $1 and achievement_id = 'dangerous-guest' order by stage_number`,
      [userId],
    )).resolves.toMatchObject({ rows: [{ stage_number: 1 }, { stage_number: 2, progress: {} }] });
    const freshAudit = await runAchievementMechanicsReconciliation(pool, { mode: 'audit', runId: randomUUID() });
    expect(freshAudit.users).toEqual([]);
  });

  it('refuses apply without a recorded backup marker', async () => {
    await expect(runAchievementMechanicsReconciliation(pool, { mode: 'apply', runId: randomUUID() }))
      .rejects.toThrow('backup marker');
  });
});
