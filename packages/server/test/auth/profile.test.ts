import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { recomputeEffectiveProfile } from '../../src/auth/profile.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

describe.skipIf(!hasIntegrationEnv)('recomputeEffectiveProfile', () => {
  let pool: Pool;

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
  });

  it('uses Telegram fields when display_source is telegram', async () => {
    const userId = randomUUID();
    await pool.query(
      `insert into users (
         id, display_name, display_source, tg_first_name, tg_last_name, tg_avatar_url
       ) values ($1, 'Old', 'telegram', 'Ivan', 'Petrov', 'tg.png')`,
      [userId],
    );

    const profile = await recomputeEffectiveProfile(pool, userId);
    expect(profile).toMatchObject({
      displayName: 'Ivan Petrov',
      avatarUrl: 'tg.png',
      displaySource: 'telegram',
    });
  });

  it('uses VK fields when display_source is vk', async () => {
    const userId = randomUUID();
    await pool.query(
      `insert into users (
         id, display_name, display_source, vk_first_name, vk_last_name, vk_avatar_url
       ) values ($1, 'Old', 'vk', 'Vera', 'Volkova', 'vk.png')`,
      [userId],
    );

    const profile = await recomputeEffectiveProfile(pool, userId);
    expect(profile).toMatchObject({
      displayName: 'Vera Volkova',
      avatarUrl: 'vk.png',
      displaySource: 'vk',
    });
  });
});
