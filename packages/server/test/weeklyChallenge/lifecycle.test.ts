import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { applyMigrations } from '../../src/db/migrations.js';
import {
  createTestPool,
  hasIntegrationEnv,
  resetDatabase,
} from '../helpers/testDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

describe.skipIf(!hasIntegrationEnv)('automatic weekly challenge lifecycle schema', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('seeds enabled settings and enforces one automatic challenge per start time', async () => {
    const settings = await pool.query(
      `select enabled from weekly_challenge_settings where id = true`,
    );
    expect(settings.rows).toEqual([{ enabled: true }]);

    const visibleFrom = new Date('2026-09-07T06:00:00.000Z');
    const startAt = new Date('2026-09-08T06:00:00.000Z');
    const endAt = new Date('2026-09-15T06:00:00.000Z');

    await pool.query(
      `insert into weekly_challenges
         (title, join_open_at, visible_from, start_at, end_at, is_automatic)
       values ('A', $1, $1, $2, $3, true)`,
      [visibleFrom, startAt, endAt],
    );
    await expect(
      pool.query(
        `insert into weekly_challenges
           (title, join_open_at, visible_from, start_at, end_at, is_automatic)
         values ('B', $1, $1, $2, $3, true)`,
        [visibleFrom, startAt, endAt],
      ),
    ).rejects.toMatchObject({ code: '23505' });

    await pool.query(
      `insert into weekly_challenges
         (title, join_open_at, start_at, end_at)
       values ('C', $1, $2, $3), ('D', $1, $2, $3)`,
      [visibleFrom, startAt, endAt],
    );
    const manual = await pool.query(
      `select title, visible_from, is_automatic
         from weekly_challenges
        where title in ('C', 'D')
        order by title`,
    );
    expect(manual.rows).toEqual([
      { title: 'C', visible_from: startAt, is_automatic: false },
      { title: 'D', visible_from: startAt, is_automatic: false },
    ]);
  });
});
