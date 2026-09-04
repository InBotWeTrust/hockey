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
      { slug: 'accuracy-moscow', targetGoals: 18, shotsLimit: 30 },
      { slug: 'accuracy-istanbul', targetGoals: 21, shotsLimit: 30 },
      { slug: 'accuracy-rome', targetGoals: 23, shotsLimit: 30 },
      { slug: 'accuracy-paris', targetGoals: 30, shotsLimit: 45 },
      { slug: 'accuracy-london', targetGoals: 36, shotsLimit: 50 },
      { slug: 'accuracy-new-york', targetGoals: 40, shotsLimit: 50 },
      { slug: 'accuracy-rio-de-janeiro', targetGoals: 42, shotsLimit: 50 },
      { slug: 'accuracy-cape-town', targetGoals: 47, shotsLimit: 55 },
      { slug: 'accuracy-dubai', targetGoals: 49, shotsLimit: 60 },
      { slug: 'accuracy-mumbai', targetGoals: 52, shotsLimit: 60 },
      { slug: 'accuracy-singapore', targetGoals: 66, shotsLimit: 80 },
      { slug: 'accuracy-beijing', targetGoals: 76, shotsLimit: 90 },
      { slug: 'accuracy-tokyo', targetGoals: 90, shotsLimit: 90 },
    ];

    expect(before.rows).toHaveLength(13);
    expect(after.rows).toHaveLength(13);
    for (const [gameIndex, game] of after.rows.entries()) {
      const previous = before.rows[gameIndex]!;
      const wanted = expected[gameIndex]!;
      expect(game.slug).toBe(wanted.slug);
      expect(game.target_goals).toBe(wanted.targetGoals);
      expect(game.total_periods).toBe(1);
      expect(game.break_duration_ms).toBe(0);
      expect(game.qualification_rules).toEqual({
        ...(previous.qualification_rules as Record<string, unknown>),
        targetGoals: wanted.targetGoals,
        shotsLimit: wanted.shotsLimit,
      });
      expect(game.revision).toBe(previous.revision + 2);
      expect(game.period_rules).toEqual([
        {
          ...previous.period_rules[0]!,
          periodNumber: 1,
          shotsLimit: wanted.shotsLimit,
          goalFrequency: 0.5,
          goalieFrequency: 0.6,
          shooterFrequency: 0.75,
          puckSpeedPerMs: 1.25,
        },
      ]);
    }

    expect(applied.applied).toEqual([
      MIGRATION_NAME,
      '078_amateur_rating_visibility.sql',
      '079_rename_express_plus_to_mix.sql',
      '080_sync_mix_period_speeds.sql',
      '081_daily_period_achievement_event_indexes.sql',
      '082_tournament_playoff_scheduling.sql',
      '083_tournament_playoff_notifications.sql',
      '084_tournament_series_notification_url.sql',
      '085_accuracy_world_tour_uniform_balance.sql',
      '086_repair_event_log_sequence.sql',
      '087_tournament_admin_attention_notification.sql',
      '088_tournament_playoff_schedule_missing_notification.sql',
      '089_player_onboarding.sql',
      '090_tournament_sequential_playoff_schedule.sql',
      '091_tournament_fixture_schedule_revision.sql',
      '092_tournament_period_loadout_state.sql',
      '093_tournament_readiness_hint_preference.sql',
      '094_balance_ultimate_one_puck_speed.sql',
      '095_tournament_regular_podium_congratulation.sql',
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
      definition_revision: moscow.rows[0]!.revision,
      rules_snapshot: rulesSnapshot,
    });
  });
});
