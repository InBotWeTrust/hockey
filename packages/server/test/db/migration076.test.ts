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
const MIGRATION_NAME = '076_speed_bonus_game_balance.sql';

async function createMigrationsDirBefore(cutoff: string): Promise<string> {
  const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hockey-migrations-before-076-'));
  const files = (await fs.readdir(MIGRATIONS_DIR))
    .filter((file) => file.endsWith('.sql') && file.localeCompare(cutoff) < 0)
    .sort((left, right) => left.localeCompare(right));
  await Promise.all(
    files.map((file) => fs.copyFile(path.join(MIGRATIONS_DIR, file), path.join(targetDir, file))),
  );
  return targetDir;
}

describe.skipIf(!hasIntegrationEnv)('076 speed bonus game balance safety', () => {
  let pool: Pool;
  let migrationsBefore076Dir: string | undefined;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    migrationsBefore076Dir = await createMigrationsDirBefore(MIGRATION_NAME);
    await applyMigrations(pool, migrationsBefore076Dir);
  });

  afterAll(async () => {
    await pool.end();
    if (migrationsBefore076Dir !== undefined) {
      await fs.rm(migrationsBefore076Dir, { recursive: true, force: true });
    }
  });

  it('rolls back when fewer than ten target rows are actually updated', async () => {
    await pool.query(`
      create function skip_one_speed_balance_update() returns trigger
      language plpgsql as $$
      begin
        if new.id = '00000000-0000-4000-8000-000000000610'::uuid then
          return null;
        end if;
        return new;
      end
      $$;

      create trigger skip_one_speed_balance_update
        before update on bonus_game
        for each row execute function skip_one_speed_balance_update();
    `);

    await expect(applyMigrations(pool, MIGRATIONS_DIR)).rejects.toThrow(
      'Expected to update 10 speed bonus games for migration 076',
    );

    const state = await pool.query<{
      applied: boolean;
      rebalanced: number;
    }>(
      `select
         exists(select 1 from _migrations where name = $1) as applied,
         count(*) filter (
           where skill_code = 'speed'
             and break_duration_ms = 0
             and revision = 4
         )::int as rebalanced
       from bonus_game`,
      [MIGRATION_NAME],
    );
    expect(state.rows[0]).toEqual({ applied: false, rebalanced: 0 });
  });
});

describe.skipIf(!hasIntegrationEnv)('076 speed bonus game balance', () => {
  let pool: Pool;
  let migrationsBefore076Dir: string | undefined;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    migrationsBefore076Dir = await createMigrationsDirBefore(MIGRATION_NAME);
    await applyMigrations(pool, migrationsBefore076Dir);
  });

  afterAll(async () => {
    await pool.end();
    if (migrationsBefore076Dir !== undefined) {
      await fs.rm(migrationsBefore076Dir, { recursive: true, force: true });
    }
  });

  it('updates every speed game and preserves snapshotted active attempts', async () => {
    const userId = '00000000-0000-4000-8000-000000000761';
    const attemptId = '00000000-0000-4000-8000-000000000762';
    const beachId = '00000000-0000-4000-8000-000000000601';
    const beach = await pool.query<{
      revision: number;
      arena_theme_id: string;
      arena_slug: string;
      arena_title: string;
      artwork_url: string;
      thumbnail_url: string;
      goalkeeper_ready_url: string;
      goalkeeper_save_url: string;
    }>(
      `select game.revision, game.arena_theme_id,
              arena.slug as arena_slug, arena.title as arena_title,
              arena.artwork_url, arena.thumbnail_url,
              game.goalkeeper_ready_url, game.goalkeeper_save_url
         from bonus_game game
         join arena_theme arena on arena.id = game.arena_theme_id
        where game.id = $1`,
      [beachId],
    );
    const revisionsBefore = await pool.query<{ id: string; revision: number }>(
      `select id, revision
         from bonus_game
        where skill_code = 'speed'
          and id between '00000000-0000-4000-8000-000000000601'
                     and '00000000-0000-4000-8000-000000000610'
        order by sort_order`,
    );
    const rulesSnapshot = {
      gameId: beachId,
      slug: 'speed-beach',
      title: 'Пляж',
      revision: beach.rows[0]!.revision,
      targetGoals: 999,
      totalPeriods: 1,
      breakDurationMs: 0,
      periods: [
        {
          periodNumber: 1,
          durationMs: 999_999,
          shotsLimit: null,
          goalFrequency: 0.1,
          goalieFrequency: 0.1,
          shooterFrequency: 0.1,
          puckSpeedPerMs: 0.2,
          goaliePattern: 'linear',
          goalieAmplitude: 1,
          goalAmplitude: 220,
        },
      ],
      goalkeeperReadyUrl: beach.rows[0]!.goalkeeper_ready_url,
      goalkeeperSaveUrl: beach.rows[0]!.goalkeeper_save_url,
      arena: {
        id: beach.rows[0]!.arena_theme_id,
        slug: beach.rows[0]!.arena_slug,
        title: beach.rows[0]!.arena_title,
        artworkUrl: beach.rows[0]!.artwork_url,
        thumbnailUrl: beach.rows[0]!.thumbnail_url,
      },
    };

    await pool.query(
      `insert into users (id, display_name, timezone)
       values ($1, 'Speed Balance Player', 'Europe/Moscow')`,
      [userId],
    );
    await pool.query(
      `insert into bonus_game_attempt
         (id, user_id, bonus_game_id, status, state, current_period,
          attempt_seed, game_core_version, definition_revision, rules_snapshot,
          reward_snapshot, arena_theme_id_snapshot, arena_snapshot,
          goalkeeper_ready_url, goalkeeper_save_url)
       values ($1, $2, $3, 'active', 'idle', 0,
               'speed-balance-seed', 1, $4, $5::jsonb,
               '{"coins":0,"stars":0,"experience":0}'::jsonb, $6,
               '{"marker":"arena snapshot"}'::jsonb, $7, $8)`,
      [
        attemptId,
        userId,
        beachId,
        beach.rows[0]!.revision,
        JSON.stringify(rulesSnapshot),
        beach.rows[0]!.arena_theme_id,
        beach.rows[0]!.goalkeeper_ready_url,
        beach.rows[0]!.goalkeeper_save_url,
      ],
    );

    const applied = await applyMigrations(pool, MIGRATIONS_DIR);

    const games = await pool.query<{
      id: string;
      sort_order: number;
      target_goals: number;
      total_periods: number;
      break_duration_ms: number;
      qualification_rules: unknown;
      period_rules: unknown;
      revision: number;
    }>(
      `select id, sort_order, target_goals, total_periods, break_duration_ms,
              qualification_rules, period_rules, revision
         from bonus_game
        where skill_code = 'speed'
          and id between '00000000-0000-4000-8000-000000000601'
                     and '00000000-0000-4000-8000-000000000610'
        order by sort_order`,
    );

    const expected = [
      { id: '00000000-0000-4000-8000-000000000601', targetGoals: 18, durationMs: 100_000 },
      { id: '00000000-0000-4000-8000-000000000602', targetGoals: 21, durationMs: 100_000 },
      { id: '00000000-0000-4000-8000-000000000603', targetGoals: 30, durationMs: 120_000 },
      { id: '00000000-0000-4000-8000-000000000604', targetGoals: 36, durationMs: 120_000 },
      { id: '00000000-0000-4000-8000-000000000605', targetGoals: 38, durationMs: 130_000 },
      { id: '00000000-0000-4000-8000-000000000606', targetGoals: 40, durationMs: 150_000 },
      { id: '00000000-0000-4000-8000-000000000607', targetGoals: 47, durationMs: 165_000 },
      { id: '00000000-0000-4000-8000-000000000608', targetGoals: 49, durationMs: 165_000 },
      { id: '00000000-0000-4000-8000-000000000609', targetGoals: 52, durationMs: 170_000 },
      { id: '00000000-0000-4000-8000-000000000610', targetGoals: 60, durationMs: 180_000 },
    ];

    expect(games.rows).toHaveLength(10);
    expect(revisionsBefore.rows).toHaveLength(10);
    for (const [index, game] of games.rows.entries()) {
      const wanted = expected[index]!;
      expect(game).toEqual({
        id: wanted.id,
        sort_order: index + 1,
        target_goals: wanted.targetGoals,
        total_periods: 1,
        break_duration_ms: 0,
        qualification_rules: {
          type: 'goals_in_time',
          targetGoals: wanted.targetGoals,
          activeTimeMs: wanted.durationMs,
        },
        period_rules: [
          {
            periodNumber: 1,
            durationMs: wanted.durationMs,
            shotsLimit: null,
            goalFrequency: 0.5,
            goalieFrequency: 0.6,
            shooterFrequency: 0.75,
            puckSpeedPerMs: 1.25,
            goaliePattern: 'linear',
            goalieAmplitude: 1,
            goalAmplitude: 220,
          },
        ],
        revision: revisionsBefore.rows[index]!.revision + 1,
      });
    }

    expect(applied.applied).toEqual([
      MIGRATION_NAME,
      '077_accuracy_world_tour_movement_balance.sql',
      '078_amateur_rating_visibility.sql',
      '079_rename_express_plus_to_mix.sql',
      '080_sync_mix_period_speeds.sql',
      '081_daily_period_achievement_event_indexes.sql',
      '082_tournament_playoff_scheduling.sql',
      '083_tournament_playoff_notifications.sql',
      '084_tournament_series_notification_url.sql',
      '085_accuracy_world_tour_uniform_balance.sql',
    ]);
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
      definition_revision: beach.rows[0]!.revision,
      rules_snapshot: rulesSnapshot,
    });
  });
});
