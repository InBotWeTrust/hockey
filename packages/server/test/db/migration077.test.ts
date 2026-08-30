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
const MIGRATION_NAME = '077_accuracy_world_tour_movement_balance.sql';

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
  sort_order: number;
  target_goals: number;
  total_periods: number;
  break_duration_ms: number;
  qualification_rules: unknown;
  period_rules: PeriodRule[];
  revision: number;
}

async function createMigrationsDirBefore(cutoff: string): Promise<string> {
  const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hockey-migrations-before-077-'));
  const files = (await fs.readdir(MIGRATIONS_DIR))
    .filter((file) => file.endsWith('.sql') && file.localeCompare(cutoff) < 0)
    .sort((left, right) => left.localeCompare(right));
  await Promise.all(
    files.map((file) => fs.copyFile(path.join(MIGRATIONS_DIR, file), path.join(targetDir, file))),
  );
  return targetDir;
}

describe.skipIf(!hasIntegrationEnv)('077 accuracy World Tour movement balance', () => {
  let pool: Pool;
  let migrationsBefore077Dir: string | undefined;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    migrationsBefore077Dir = await createMigrationsDirBefore(MIGRATION_NAME);
    await applyMigrations(pool, migrationsBefore077Dir);
  });

  afterAll(async () => {
    await pool.end();
    if (migrationsBefore077Dir !== undefined) {
      await fs.rm(migrationsBefore077Dir, { recursive: true, force: true });
    }
  });

  it('uses one balanced period in all thirteen cities and preserves active snapshots', async () => {
    const userId = '00000000-0000-4000-8000-000000000771';
    const attemptId = '00000000-0000-4000-8000-000000000772';
    const moscowId = '00000000-0000-4000-8000-000000000611';
    const before = await pool.query<AccuracyGameRow>(
      `select id, slug, sort_order, target_goals, total_periods, break_duration_ms,
              qualification_rules, period_rules, revision
         from bonus_game
        where skill_code = 'accuracy'
          and id between '00000000-0000-4000-8000-000000000611'
                     and '00000000-0000-4000-8000-000000000623'
        order by sort_order`,
    );
    const moscow = await pool.query<{
      revision: number;
      title: string;
      arena_theme_id: string;
      arena_slug: string;
      arena_title: string;
      artwork_url: string;
      thumbnail_url: string;
      goalkeeper_ready_url: string;
      goalkeeper_save_url: string;
    }>(
      `select game.revision, game.title, game.arena_theme_id,
              arena.slug as arena_slug, arena.title as arena_title,
              arena.artwork_url, arena.thumbnail_url,
              game.goalkeeper_ready_url, game.goalkeeper_save_url
         from bonus_game game
         join arena_theme arena on arena.id = game.arena_theme_id
        where game.id = $1`,
      [moscowId],
    );
    const rulesSnapshot = {
      gameId: moscowId,
      slug: 'accuracy-moscow',
      title: moscow.rows[0]!.title,
      revision: moscow.rows[0]!.revision,
      targetGoals: 999,
      totalPeriods: 1,
      breakDurationMs: 0,
      periods: [
        {
          periodNumber: 1,
          durationMs: 999_999,
          shotsLimit: 999,
          goalFrequency: 0.1,
          goalieFrequency: 0.1,
          shooterFrequency: 0.1,
          puckSpeedPerMs: 0.2,
          goaliePattern: 'linear',
          goalieAmplitude: 1,
          goalAmplitude: 220,
        },
      ],
      goalkeeperReadyUrl: moscow.rows[0]!.goalkeeper_ready_url,
      goalkeeperSaveUrl: moscow.rows[0]!.goalkeeper_save_url,
      arena: {
        id: moscow.rows[0]!.arena_theme_id,
        slug: moscow.rows[0]!.arena_slug,
        title: moscow.rows[0]!.arena_title,
        artworkUrl: moscow.rows[0]!.artwork_url,
        thumbnailUrl: moscow.rows[0]!.thumbnail_url,
      },
    };

    await pool.query(
      `insert into users (id, display_name, timezone)
       values ($1, 'Accuracy Balance Player', 'Europe/Moscow')`,
      [userId],
    );
    await pool.query(
      `insert into bonus_game_attempt
         (id, user_id, bonus_game_id, status, state, current_period,
          attempt_seed, game_core_version, definition_revision, rules_snapshot,
          reward_snapshot, arena_theme_id_snapshot, arena_snapshot,
          goalkeeper_ready_url, goalkeeper_save_url)
       values ($1, $2, $3, 'active', 'idle', 0,
               'accuracy-balance-seed', 1, $4, $5::jsonb,
               '{"coins":0,"stars":0,"experience":0}'::jsonb, $6,
               '{"marker":"arena snapshot"}'::jsonb, $7, $8)`,
      [
        attemptId,
        userId,
        moscowId,
        moscow.rows[0]!.revision,
        JSON.stringify(rulesSnapshot),
        moscow.rows[0]!.arena_theme_id,
        moscow.rows[0]!.goalkeeper_ready_url,
        moscow.rows[0]!.goalkeeper_save_url,
      ],
    );

    const applied = await applyMigrations(pool, MIGRATIONS_DIR);
    const after = await pool.query<AccuracyGameRow>(
      `select id, slug, sort_order, target_goals, total_periods, break_duration_ms,
              qualification_rules, period_rules, revision
         from bonus_game
        where skill_code = 'accuracy'
          and id between '00000000-0000-4000-8000-000000000611'
                     and '00000000-0000-4000-8000-000000000623'
        order by sort_order`,
    );

    const expected = [
      { slug: 'accuracy-moscow', goal: 0.5, goalie: 0.6, shooter: 0.75 },
      { slug: 'accuracy-istanbul', goal: 0.5, goalie: 0.6, shooter: 0.75 },
      { slug: 'accuracy-rome', goal: 0.5, goalie: 0.6, shooter: 0.75 },
      { slug: 'accuracy-paris', goal: 0.5, goalie: 0.6, shooter: 0.75 },
      { slug: 'accuracy-london', goal: 0.6, goalie: 0.7, shooter: 0.85 },
      { slug: 'accuracy-new-york', goal: 0.6, goalie: 0.7, shooter: 0.85 },
      { slug: 'accuracy-rio-de-janeiro', goal: 0.6, goalie: 0.7, shooter: 0.85 },
      { slug: 'accuracy-cape-town', goal: 0.65, goalie: 0.75, shooter: 0.9 },
      { slug: 'accuracy-dubai', goal: 0.65, goalie: 0.75, shooter: 0.9 },
      { slug: 'accuracy-mumbai', goal: 0.65, goalie: 0.75, shooter: 0.9 },
      { slug: 'accuracy-singapore', goal: 0.65, goalie: 0.75, shooter: 0.9 },
      { slug: 'accuracy-beijing', goal: 0.75, goalie: 0.85, shooter: 1 },
      { slug: 'accuracy-tokyo', goal: 0.75, goalie: 0.85, shooter: 1 },
    ];

    expect(before.rows).toHaveLength(13);
    expect(after.rows).toHaveLength(13);
    for (const [gameIndex, game] of after.rows.entries()) {
      const previous = before.rows[gameIndex]!;
      const wanted = expected[gameIndex]!;
      expect(game.slug).toBe(wanted.slug);
      expect(game.target_goals).toBe(previous.target_goals);
      expect(game.total_periods).toBe(1);
      expect(game.break_duration_ms).toBe(0);
      expect(game.qualification_rules).toEqual(previous.qualification_rules);
      expect(game.revision).toBe(previous.revision + 1);
      expect(game.period_rules).toEqual([
        {
          ...previous.period_rules[0]!,
          periodNumber: 1,
          shotsLimit: (previous.qualification_rules as { shotsLimit: number }).shotsLimit,
          goalFrequency: wanted.goal,
          goalieFrequency: wanted.goalie,
          shooterFrequency: wanted.shooter,
          puckSpeedPerMs: 1.25,
        },
      ]);
    }

    expect(applied.applied).toEqual([MIGRATION_NAME]);
    const attempt = await pool.query<{
      status: string;
      definition_revision: number;
      rules_snapshot: unknown;
    }>(
      `select status, definition_revision, rules_snapshot
         from bonus_game_attempt
        where id = $1`,
      [attemptId],
    );
    expect(attempt.rows[0]).toEqual({
      status: 'active',
      definition_revision: moscow.rows[0]!.revision,
      rules_snapshot: rulesSnapshot,
    });
  });
});
