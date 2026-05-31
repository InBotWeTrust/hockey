import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { getAchievementProgress, setAchievementProgress } from '../../src/achievements/progress.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

describe.skipIf(!hasIntegrationEnv)('achievement progress helpers', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);
  });

  afterAll(async () => {
    await pool?.end();
  });

  async function createUser(): Promise<string> {
    const id = randomUUID();
    await pool.query(
      `insert into users (id, display_name, avatar_url, level, timezone)
       values ($1, 'Progress Player', null, 1, 'UTC')`,
      [id],
    );
    return id;
  }

  it('upserts and reads json progress', async () => {
    const userId = await createUser();
    await setAchievementProgress(pool, userId, 'duel_win_streak', { wins: 2 });
    await setAchievementProgress(pool, userId, 'duel_win_streak', { wins: 3 });

    await expect(
      getAchievementProgress<{ wins: number }>(pool, userId, 'duel_win_streak'),
    ).resolves.toEqual({ wins: 3 });
  });
});
