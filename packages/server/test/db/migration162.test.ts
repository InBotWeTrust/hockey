import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyMigrations } from '../../src/db/migrations.js';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';

const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../db/migrations');
const cutoff = '162_marksmanship_scoring_v6.sql';

describe.skipIf(!hasIntegrationEnv)('marksmanship V6 catalog migration', () => {
  let pool: Pool;
  let beforeDir: string;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    beforeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hockey-before-v6-'));
    const files = (await fs.readdir(migrationsDir))
      .filter((file) => file.endsWith('.sql') && file.localeCompare(cutoff) < 0);
    await Promise.all(files.map((file) => fs.copyFile(
      path.join(migrationsDir, file), path.join(beforeDir, file),
    )));
    await applyMigrations(pool, beforeDir);
  });

  afterAll(async () => {
    if (pool) await pool.end();
    if (beforeDir) await fs.rm(beforeDir, { recursive: true, force: true });
  });

  it('updates only future definitions and preserves a V5 attempt snapshot', async () => {
    const game = await pool.query<{
      id: string; slug: string; title: string; revision: number; target_goals: number;
      qualification_rules: { scoring: { version: number } }; period_rules: unknown;
      total_periods: number; break_duration_ms: number; arena_theme_id: string;
      goalkeeper_ready_url: string; goalkeeper_save_url: string;
      arena_slug: string; arena_title: string; arena_artwork_url: string;
      arena_thumbnail_url: string;
    }>(`select game.id, game.slug, game.title, game.revision, game.target_goals,
              game.qualification_rules, game.period_rules, game.total_periods,
              game.break_duration_ms, game.arena_theme_id,
              game.goalkeeper_ready_url, game.goalkeeper_save_url,
              arena.slug as arena_slug, arena.title as arena_title,
              arena.artwork_url as arena_artwork_url,
              arena.thumbnail_url as arena_thumbnail_url
         from bonus_game game
         join arena_theme arena on arena.id = game.arena_theme_id
        where game.slug = 'marksmanship-1'`);
    const before = game.rows[0]!;
    expect(before.qualification_rules.scoring.version).toBe(5);

    const userId = '00000000-0000-4000-8000-000000000162';
    const attemptId = '00000000-0000-4000-8000-000000000163';
    await pool.query(
      `insert into users (id, display_name, timezone)
       values ($1, 'V6 migration fixture', 'Europe/Moscow')`, [userId],
    );
    const arena = {
      id: before.arena_theme_id, slug: before.arena_slug, title: before.arena_title,
      artworkUrl: before.arena_artwork_url, thumbnailUrl: before.arena_thumbnail_url,
    };
    const snapshot = {
      gameId: before.id, slug: before.slug, title: before.title,
      skillCode: 'marksmanship', revision: before.revision,
      targetGoals: before.target_goals, qualificationRules: before.qualification_rules,
      totalPeriods: before.total_periods, breakDurationMs: before.break_duration_ms,
      periods: before.period_rules,
      goalkeeperReadyUrl: before.goalkeeper_ready_url,
      goalkeeperSaveUrl: before.goalkeeper_save_url, arena,
    };
    await pool.query(
      `insert into bonus_game_attempt
         (id, user_id, bonus_game_id, attempt_seed, game_core_version,
          definition_revision, rules_snapshot, reward_snapshot,
          arena_theme_id_snapshot, arena_snapshot, goalkeeper_ready_url,
          goalkeeper_save_url)
       values ($1, $2, $3, 'V6-migration-test', 65, $4, $5::jsonb, '{}'::jsonb,
               $6, $7::jsonb, $8, $9)`,
      [attemptId, userId, before.id, before.revision, JSON.stringify(snapshot),
        before.arena_theme_id, JSON.stringify(arena), before.goalkeeper_ready_url,
        before.goalkeeper_save_url],
    );

    const applied = await applyMigrations(pool, migrationsDir);
    expect(applied.applied).toContain(cutoff);
    const current = await pool.query<{
      target_goals: number; qualification_rules: { targetPoints: number; scoring: { version: number } };
    }>(`select target_goals, qualification_rules from bonus_game where id = $1`, [before.id]);
    expect(current.rows[0]).toMatchObject({
      target_goals: 100,
      qualification_rules: { targetPoints: 100, scoring: { version: 6 } },
    });
    const saved = await pool.query<{ rules_snapshot: unknown }>(
      'select rules_snapshot from bonus_game_attempt where id = $1', [attemptId],
    );
    expect(saved.rows[0]?.rules_snapshot).toEqual(snapshot);
    expect((await applyMigrations(pool, migrationsDir)).applied).toEqual([]);
  });
});
