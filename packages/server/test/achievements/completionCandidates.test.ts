import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { completeAchievementCandidates } from '../../src/achievements/service.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

describe.skipIf(!hasIntegrationEnv)('timestamped achievement completion candidates', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);
  });

  afterAll(async () => {
    await pool?.end();
  });

  beforeEach(async () => {
    await pool.query('truncate users cascade');
    await pool.query(
      `update achievements
          set availability = case id
                when 'monthly-top-1' then 'future'
                when 'monthly-top-3' then 'hidden'
                else availability
              end`,
    );
  });

  async function createUser(): Promise<string> {
    const id = randomUUID();
    await pool.query(
      `insert into users (id, display_name, timezone, xp, experience)
       values ($1, 'Candidate Player', 'Europe/Moscow', 7, 11)`,
      [id],
    );
    return id;
  }

  it('stores the supplied historical timestamp and context as unclaimed', async () => {
    const userId = await createUser();
    const achievedAt = new Date('2026-08-15T10:20:30.000Z');
    const result = await completeAchievementCandidates(pool, [
      {
        userId,
        achievementId: 'regular-season-champion',
        achievedAt,
        context: { source: 'tournament_backfill', tournament_id: randomUUID() },
      },
    ]);

    expect(result).toEqual({ attempted: 1, inserted: 1 });
    const completion = await pool.query<{
      completed_at: Date;
      claimed_at: Date | null;
      completion_context: Record<string, unknown>;
    }>(
      `select completed_at, claimed_at, completion_context
         from user_achievements
        where user_id = $1 and achievement_id = 'regular-season-champion'`,
      [userId],
    );
    expect(completion.rows).toEqual([
      {
        completed_at: achievedAt,
        claimed_at: null,
        completion_context: expect.objectContaining({ source: 'tournament_backfill' }),
      },
    ]);
  });

  it('ignores future and hidden catalogue entries', async () => {
    const userId = await createUser();
    const result = await completeAchievementCandidates(pool, [
      {
        userId,
        achievementId: 'monthly-top-1',
        achievedAt: new Date('2026-08-15T10:20:30.000Z'),
        context: { source: 'test' },
      },
      {
        userId,
        achievementId: 'monthly-top-3',
        achievedAt: new Date('2026-08-15T10:20:30.000Z'),
        context: { source: 'test' },
      },
    ]);

    expect(result).toEqual({ attempted: 2, inserted: 0 });
    const count = await pool.query<{ count: number }>(
      `select count(*)::int as count from user_achievements where user_id = $1`,
      [userId],
    );
    expect(count.rows[0]!.count).toBe(0);
  });

  it('deduplicates candidates and preserves an existing completion', async () => {
    const userId = await createUser();
    const early = new Date('2026-08-10T10:00:00.000Z');
    const late = new Date('2026-08-20T10:00:00.000Z');
    const first = await completeAchievementCandidates(pool, [
      {
        userId,
        achievementId: 'regular-season-medalist',
        achievedAt: late,
        context: { source: 'late' },
      },
      {
        userId,
        achievementId: 'regular-season-medalist',
        achievedAt: early,
        context: { source: 'early' },
      },
    ]);
    const second = await completeAchievementCandidates(pool, [
      {
        userId,
        achievementId: 'regular-season-medalist',
        achievedAt: new Date('2026-08-01T10:00:00.000Z'),
        context: { source: 'older-retry' },
      },
    ]);

    expect(first).toEqual({ attempted: 1, inserted: 1 });
    expect(second).toEqual({ attempted: 1, inserted: 0 });
    const completion = await pool.query<{ completed_at: Date; completion_context: unknown }>(
      `select completed_at, completion_context from user_achievements
        where user_id = $1 and achievement_id = 'regular-season-medalist'`,
      [userId],
    );
    expect(completion.rows).toEqual([
      { completed_at: early, completion_context: { source: 'early' } },
    ]);
  });

  it('does not change balances when recording completion', async () => {
    const userId = await createUser();
    await pool.query(
      `insert into user_currency_account (user_id, balance, reserved_balance)
       values ($1, 13, 2)`,
      [userId],
    );

    await completeAchievementCandidates(pool, [
      {
        userId,
        achievementId: 'tournament-cup',
        achievedAt: new Date('2026-08-15T10:20:30.000Z'),
        context: { source: 'tournament_backfill' },
      },
    ]);

    const balances = await pool.query<{
      xp: number;
      experience: number;
      balance: number;
      reserved_balance: number;
    }>(
      `select users.xp, users.experience, account.balance, account.reserved_balance
         from users
         join user_currency_account account on account.user_id = users.id
        where users.id = $1`,
      [userId],
    );
    expect(balances.rows).toEqual([{ xp: 7, experience: 11, balance: 13, reserved_balance: 2 }]);
  });
});
