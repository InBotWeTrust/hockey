import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';
import { applyMigrationsThrough } from '../helpers/migrations.js';

const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../db/migrations',
);
const MIGRATION_NAME = '144_sync_career_experience_progress.sql';
const PREVIOUS_MIGRATION_NAME = '143_restore_tournament_artwork_media_purpose.sql';
const MIGRATION_PATH = path.join(MIGRATIONS_DIR, MIGRATION_NAME);

describe.skipIf(!hasIntegrationEnv)('migration 144 career experience progress sync', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrationsThrough(pool, MIGRATIONS_DIR, PREVIOUS_MIGRATION_NAME);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('repairs only active unclaimed career experience stages without granting rewards', async () => {
    const staleUserId = randomUUID();
    const aheadUserId = randomUUID();
    const claimedUserId = randomUUID();
    await pool.query(
      `insert into users (id, display_name, timezone, experience)
       values
         ($1, 'Stale career experience', 'UTC', 1013),
         ($2, 'Progress already ahead', 'UTC', 1100),
         ($3, 'Claimed career experience', 'UTC', 1500)`,
      [staleUserId, aheadUserId, claimedUserId],
    );
    await pool.query(
      `insert into user_achievement_stages
         (user_id, achievement_id, stage_number, opened_at, progress, completed_at, claimed_at,
          completion_context, reward_snapshot)
       values
         ($1, 'career-experience', 2, now() - interval '1 day',
          '{"total":890,"source":"existing"}', null, null, '{}', null),
         ($2, 'career-experience', 2, now() - interval '1 day',
          '{"total":1200,"source":"ahead"}', '2026-09-18T12:00:00.000Z', null, '{}', null),
         ($3, 'career-experience', 2, now() - interval '2 days',
          '{"total":1000,"source":"claimed"}', now() - interval '1 day', now() - interval '1 day',
          '{}', '{"currency":0,"stars":10,"experience":10,"tokens":0}'),
         ($1, 'career-goals', 1, now() - interval '1 day',
          '{"total":100}', null, null, '{}', null)`,
      [staleUserId, aheadUserId, claimedUserId],
    );

    await applyMigrationsThrough(pool, MIGRATIONS_DIR, MIGRATION_NAME);

    const { rows } = await pool.query<{
      user_id: string;
      achievement_id: string;
      progress: Record<string, number | string>;
      completed_at: Date | null;
      claimed_at: Date | null;
      reward_snapshot: Record<string, number> | null;
    }>(
      `select user_id, achievement_id, progress, completed_at, claimed_at, reward_snapshot
         from user_achievement_stages
        where user_id = any($1::uuid[])
        order by user_id, achievement_id`,
      [[staleUserId, aheadUserId, claimedUserId]],
    );

    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          user_id: staleUserId,
          achievement_id: 'career-experience',
          progress: { total: 1013, source: 'existing' },
          completed_at: expect.any(Date),
          claimed_at: null,
          reward_snapshot: null,
        }),
        expect.objectContaining({
          user_id: aheadUserId,
          achievement_id: 'career-experience',
          progress: { total: 1200, source: 'ahead' },
          completed_at: new Date('2026-09-18T12:00:00.000Z'),
          claimed_at: null,
          reward_snapshot: null,
        }),
        expect.objectContaining({
          user_id: claimedUserId,
          achievement_id: 'career-experience',
          progress: { total: 1000, source: 'claimed' },
          completed_at: expect.any(Date),
          claimed_at: expect.any(Date),
          reward_snapshot: { currency: 0, stars: 10, experience: 10, tokens: 0 },
        }),
        expect.objectContaining({
          user_id: staleUserId,
          achievement_id: 'career-goals',
          progress: { total: 100 },
          completed_at: null,
          claimed_at: null,
          reward_snapshot: null,
        }),
      ]),
    );

    await pool.query(await readFile(MIGRATION_PATH, 'utf8'));
    const repeated = await pool.query(
      `select user_id, achievement_id, progress, completed_at, claimed_at, reward_snapshot
         from user_achievement_stages
        where user_id = any($1::uuid[])
        order by user_id, achievement_id`,
      [[staleUserId, aheadUserId, claimedUserId]],
    );
    expect(repeated.rows).toEqual(rows);

    await expect(applyMigrationsThrough(pool, MIGRATIONS_DIR, MIGRATION_NAME)).resolves.toEqual({
      applied: [],
    });
  });
});
