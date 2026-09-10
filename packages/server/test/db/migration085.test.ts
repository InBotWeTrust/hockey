import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyMigrations } from '../../src/db/migrations.js';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');
const MIGRATION_NAME = '085_accuracy_world_tour_uniform_balance.sql';

interface PeriodRule {
  periodNumber: number;
  durationMs: number;
  shotsLimit: number | null;
  goalFrequency: number;
  goalieFrequency: number;
  shooterFrequency: number;
  puckSpeedPerMs: number;
  goaliePattern: string;
  goalieAmplitude: number;
  goalAmplitude: number;
}

interface AccuracyGameRow {
  id: string;
  slug: string;
  target_goals: number;
  total_periods: number;
  break_duration_ms: number;
  qualification_rules: Record<string, unknown>;
  period_rules: PeriodRule[];
  revision: number;
}

async function createMigrationsDirBefore(cutoff: string): Promise<string> {
  const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hockey-migrations-before-085-'));
  const files = (await fs.readdir(MIGRATIONS_DIR))
    .filter((file) => file.endsWith('.sql') && file.localeCompare(cutoff) < 0)
    .sort((left, right) => left.localeCompare(right));
  await Promise.all(
    files.map((file) => fs.copyFile(path.join(MIGRATIONS_DIR, file), path.join(targetDir, file))),
  );
  return targetDir;
}

describe.skipIf(!hasIntegrationEnv)('085 Accuracy World Tour uniform balance', () => {
  let pool: Pool;
  let migrationsBefore085Dir: string | undefined;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    migrationsBefore085Dir = await createMigrationsDirBefore(MIGRATION_NAME);
    await applyMigrations(pool, migrationsBefore085Dir);
  });

  afterAll(async () => {
    await pool.end();
    if (migrationsBefore085Dir !== undefined) {
      await fs.rm(migrationsBefore085Dir, { recursive: true, force: true });
    }
  });

  it('applies exact city goal and shot limits with shared movement while preserving active snapshots', async () => {
    const userId = '00000000-0000-4000-8000-000000000851';
    const attemptId = '00000000-0000-4000-8000-000000000852';
    const moscowId = '00000000-0000-4000-8000-000000000611';
    const before = await pool.query<AccuracyGameRow>(
      `select id, slug, target_goals, total_periods, break_duration_ms,
              qualification_rules, period_rules, revision
         from bonus_game
        where skill_code = 'accuracy'
          and id between '00000000-0000-4000-8000-000000000611'
                     and '00000000-0000-4000-8000-000000000623'
        order by sort_order`,
    );
    const moscow = before.rows.find((game) => game.id === moscowId)!;
    const moscowDefinition = await pool.query<{
      title: string;
      arena_theme_id: string;
      arena_slug: string;
      arena_title: string;
      artwork_url: string;
      thumbnail_url: string;
      goalkeeper_ready_url: string;
      goalkeeper_save_url: string;
    }>(
      `select game.title, game.arena_theme_id,
              arena.slug as arena_slug, arena.title as arena_title,
              arena.artwork_url, arena.thumbnail_url,
              game.goalkeeper_ready_url, game.goalkeeper_save_url
         from bonus_game game
         join arena_theme arena on arena.id = game.arena_theme_id
        where game.id = $1`,
      [moscowId],
    );
    const definition = moscowDefinition.rows[0]!;
    const rulesSnapshot = {
      gameId: moscowId,
      slug: moscow.slug,
      title: definition.title,
      revision: moscow.revision,
      targetGoals: moscow.target_goals,
      totalPeriods: moscow.total_periods,
      breakDurationMs: moscow.break_duration_ms,
      periods: moscow.period_rules,
      goalkeeperReadyUrl: definition.goalkeeper_ready_url,
      goalkeeperSaveUrl: definition.goalkeeper_save_url,
      arena: {
        id: definition.arena_theme_id,
        slug: definition.arena_slug,
        title: definition.arena_title,
        artworkUrl: definition.artwork_url,
        thumbnailUrl: definition.thumbnail_url,
      },
    };

    await pool.query(
      `insert into users (id, display_name, timezone)
       values ($1, 'Uniform Balance Player', 'Europe/Moscow')`,
      [userId],
    );
    await pool.query(
      `insert into bonus_game_attempt
         (id, user_id, bonus_game_id, status, state, current_period,
          attempt_seed, game_core_version, definition_revision, rules_snapshot,
          reward_snapshot, arena_theme_id_snapshot, arena_snapshot,
          goalkeeper_ready_url, goalkeeper_save_url)
       select $1, $2, game.id, 'active', 'idle', 0,
              'uniform-balance-seed', 1, game.revision, $3::jsonb,
              '{"coins":0,"stars":0,"experience":0}'::jsonb,
              game.arena_theme_id, '{"marker":"arena snapshot"}'::jsonb,
              game.goalkeeper_ready_url, game.goalkeeper_save_url
         from bonus_game game
        where game.id = $4`,
      [attemptId, userId, JSON.stringify(rulesSnapshot), moscowId],
    );

    const applied = await applyMigrations(pool, MIGRATIONS_DIR);
    const after = await pool.query<AccuracyGameRow>(
      `select id, slug, target_goals, total_periods, break_duration_ms,
              qualification_rules, period_rules, revision
         from bonus_game
        where skill_code = 'accuracy'
          and id between '00000000-0000-4000-8000-000000000611'
                     and '00000000-0000-4000-8000-000000000623'
        order by sort_order`,
    );
    const expected = [
      ['accuracy-moscow', 18, 30],
      ['accuracy-istanbul', 21, 30],
      ['accuracy-rome', 23, 30],
      ['accuracy-paris', 30, 45],
      ['accuracy-london', 36, 50],
      ['accuracy-new-york', 40, 50],
      ['accuracy-rio-de-janeiro', 42, 50],
      ['accuracy-cape-town', 47, 55],
      ['accuracy-dubai', 49, 60],
      ['accuracy-mumbai', 52, 60],
      ['accuracy-singapore', 66, 80],
      ['accuracy-beijing', 76, 90],
      ['accuracy-tokyo', 90, 90],
    ] as const;

    expect(before.rows).toHaveLength(13);
    expect(after.rows).toHaveLength(13);
    expect(applied.applied).toContain(MIGRATION_NAME);
    for (const [index, game] of after.rows.entries()) {
      const previous = before.rows[index]!;
      const [slug, targetGoals, shotsLimit] = expected[index]!;
      expect(game.slug).toBe(slug);
      expect(game.target_goals).toBe(targetGoals);
      expect(game.total_periods).toBe(1);
      expect(game.break_duration_ms).toBe(0);
      expect(game.qualification_rules).toEqual({
        ...previous.qualification_rules,
        targetGoals,
        shotsLimit,
      });
      expect(game.period_rules).toEqual([
        {
          ...previous.period_rules[0]!,
          periodNumber: 1,
          shotsLimit,
          goalFrequency: 0.5,
          goalieFrequency: 0.6,
          shooterFrequency: 0.75,
          puckSpeedPerMs: 1.25,
        },
      ]);
      expect(game.revision).toBe(previous.revision + 1);
    }

    const attempt = await pool.query<{
      definition_revision: number;
      rules_snapshot: unknown;
    }>(
      `select definition_revision, rules_snapshot
         from bonus_game_attempt
        where id = $1`,
      [attemptId],
    );
    expect(attempt.rows[0]).toEqual({
      definition_revision: moscow.revision,
      rules_snapshot: rulesSnapshot,
    });
  });
});
