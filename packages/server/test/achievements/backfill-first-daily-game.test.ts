import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { findOrCreateTelegramUser } from '../../src/auth/users.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');
const REPAIR_MIGRATION = '073_backfill_first_daily_game.sql';

describe.skipIf(!hasIntegrationEnv)('migration 073_backfill_first_daily_game', () => {
  let pool: Pool;
  let providerSequence = 0;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query('truncate users restart identity cascade');
    await pool.query('delete from _migrations where name = $1', [REPAIR_MIGRATION]);
  });

  async function createClosedDailyGame(input: {
    currentPeriod: 2 | 3;
    closedReason: 'quota' | 'timeout' | 'day_end';
    closedAt: Date;
  }): Promise<string> {
    providerSequence += 1;
    const user = await findOrCreateTelegramUser(pool, {
      providerUid: `achievement-backfill-${providerSequence}`,
      displayName: `Achievement Backfill ${providerSequence}`,
      timezone: 'Europe/Moscow',
    });
    const dayPool = await pool.query<{ id: string }>(
      `insert into day_pool
         (user_id, day_date, state, current_period, closed_at, game_core_version, daily_seed)
       values ($1, '2026-08-28', 'closed', $2, $3, 46, $4)
       returning id`,
      [user.id, input.currentPeriod, input.closedAt, `achievement-backfill-${providerSequence}`],
    );
    await pool.query(
      `insert into period_log
         (day_pool_id, period_number, started_at, ended_at, shots_taken, goals, closed_reason)
       values ($1, $2, $3::timestamptz - interval '20 minutes', $3, 1, 1, $4)`,
      [dayPool.rows[0]!.id, input.currentPeriod, input.closedAt, input.closedReason],
    );
    return user.id;
  }

  it('backfills quota and timeout completions as unclaimed achievements', async () => {
    const completedAt = new Date('2026-08-28T12:34:56.000Z');
    const quotaUserId = await createClosedDailyGame({
      currentPeriod: 3,
      closedReason: 'quota',
      closedAt: completedAt,
    });
    const timeoutUserId = await createClosedDailyGame({
      currentPeriod: 3,
      closedReason: 'timeout',
      closedAt: completedAt,
    });

    const applied = await applyMigrations(pool, MIGRATIONS_DIR);
    expect(applied.applied).toContain(REPAIR_MIGRATION);

    const completed = await pool.query<{
      user_id: string;
      completed_at: Date;
      claimed_at: Date | null;
      completion_context: Record<string, unknown>;
    }>(
      `select user_id, completed_at, claimed_at, completion_context
         from user_achievements
        where achievement_id = 'first-daily-game'
        order by user_id`,
    );
    const expectedUserIds = [quotaUserId, timeoutUserId].sort();
    expect(completed.rows).toEqual(
      expectedUserIds.map((userId) => ({
        user_id: userId,
        completed_at: completedAt,
        claimed_at: null,
        completion_context: { source: 'prod_compat_backfill' },
      })),
    );
  });

  it('does not backfill partial or midnight-interrupted daily games', async () => {
    const closedAt = new Date('2026-08-28T21:00:00.000Z');
    await createClosedDailyGame({
      currentPeriod: 2,
      closedReason: 'quota',
      closedAt,
    });
    await createClosedDailyGame({
      currentPeriod: 3,
      closedReason: 'day_end',
      closedAt,
    });

    const applied = await applyMigrations(pool, MIGRATIONS_DIR);
    expect(applied.applied).toContain(REPAIR_MIGRATION);

    const completed = await pool.query<{ count: number }>(
      `select count(*)::int as count
         from user_achievements
        where achievement_id = 'first-daily-game'`,
    );
    expect(completed.rows[0]!.count).toBe(0);
  });

  it('does not duplicate a completion when the repair migration is reapplied', async () => {
    const closedAt = new Date('2026-08-28T12:34:56.000Z');
    const userId = await createClosedDailyGame({
      currentPeriod: 3,
      closedReason: 'quota',
      closedAt,
    });

    const firstRun = await applyMigrations(pool, MIGRATIONS_DIR);
    expect(firstRun.applied).toContain(REPAIR_MIGRATION);
    await pool.query('delete from _migrations where name = $1', [REPAIR_MIGRATION]);
    const secondRun = await applyMigrations(pool, MIGRATIONS_DIR);
    expect(secondRun.applied).toContain(REPAIR_MIGRATION);

    const completed = await pool.query<{ count: number }>(
      `select count(*)::int as count
         from user_achievements
        where user_id = $1 and achievement_id = 'first-daily-game'`,
      [userId],
    );
    expect(completed.rows[0]!.count).toBe(1);
  });
});
