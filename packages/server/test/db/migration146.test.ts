import { randomUUID } from 'node:crypto';
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

describe.skipIf(!hasIntegrationEnv)('migration 146 marksmanship bonus games', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrationsThrough(pool, MIGRATIONS_DIR, '146_marksmanship_bonus_games.sql');
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('adds auditable point columns without changing the legacy tracks', async () => {
    const columns = await pool.query<{
      table_name: string;
      column_name: string;
      is_nullable: string;
    }>(
      `select table_name, column_name, is_nullable
         from information_schema.columns
        where table_schema = 'public'
          and (table_name, column_name) in (
            ('bonus_game_attempt', 'total_points'),
            ('bonus_game_period_log', 'total_points'),
            ('shot_session', 'awarded_points'),
            ('shot_session', 'score_details')
          )
        order by table_name, column_name`,
    );

    expect(columns.rows).toEqual([
      { table_name: 'bonus_game_attempt', column_name: 'total_points', is_nullable: 'NO' },
      { table_name: 'bonus_game_period_log', column_name: 'total_points', is_nullable: 'NO' },
      { table_name: 'shot_session', column_name: 'awarded_points', is_nullable: 'NO' },
      { table_name: 'shot_session', column_name: 'score_details', is_nullable: 'YES' },
    ]);

    const counts = await pool.query<{ skill_code: string; count: number }>(
      `select skill_code, count(*)::int as count
         from bonus_game
        where status = 'active'
        group by skill_code
        order by skill_code`,
    );
    expect(counts.rows).toEqual([
      { skill_code: 'accuracy', count: 13 },
      { skill_code: 'marksmanship', count: 7 },
      { skill_code: 'speed', count: 10 },
    ]);
  });

  it('seeds the seven ordered free definitions on the amateur court', async () => {
    const games = await pool.query<{
      id: string;
      slug: string;
      sort_order: number;
      target_goals: number;
      qualification_rules: {
        type: string;
        targetPoints: number;
        activeTimeMs: number;
        scoring: { scanStepMs: number; counterDirectionBonus: number };
      };
      period_rules: Array<{
        durationMs: number;
        shotsLimit: number | null;
        shooterFrequency: number;
        goalieFrequency: number;
        goalFrequency: number;
        puckSpeedPerMs: number;
      }>;
      reward_coins: number;
      reward_stars: number;
      reward_experience: number;
      access_type: string;
      use_inventory: boolean;
      artwork_url: string;
      is_selectable: boolean;
    }>(
      `select game.id, game.slug, game.sort_order, game.target_goals,
              game.qualification_rules, game.period_rules,
              game.reward_coins, game.reward_stars, game.reward_experience,
              game.access_type, game.use_inventory,
              arena.artwork_url, arena.is_selectable
         from bonus_game game
         join arena_theme arena on arena.id = game.arena_theme_id
        where game.skill_code = 'marksmanship'
        order by game.sort_order`,
    );

    expect(games.rows.map((game) => game.slug)).toEqual([
      'marksmanship-1',
      'marksmanship-2',
      'marksmanship-3',
      'marksmanship-4',
      'marksmanship-5',
      'marksmanship-6',
      'marksmanship-7',
    ]);
    expect(games.rows.map((game) => game.target_goals)).toEqual([
      1100, 2450, 4000, 5750, 7750, 9950, 12450,
    ]);
    expect(games.rows[6]).toMatchObject({
      id: '00000000-0000-4000-8000-000000000707',
      reward_coins: 0,
      reward_stars: 1,
      reward_experience: 1,
      access_type: 'free',
      use_inventory: false,
      artwork_url: '/sprites/amateur-daily-court.webp',
      is_selectable: false,
      qualification_rules: {
        type: 'points_in_time',
        targetPoints: 12450,
        activeTimeMs: 210_000,
        scoring: { scanStepMs: 10, counterDirectionBonus: 15 },
      },
    });
    for (const game of games.rows) {
      expect(game.period_rules).toEqual([
        expect.objectContaining({
          durationMs: game.qualification_rules.activeTimeMs,
          shotsLimit: null,
          shooterFrequency: 0.75,
          goalieFrequency: 0.6,
          goalFrequency: 0.5,
          puckSpeedPerMs: 1.25,
        }),
      ]);
    }
  });

  it('allows one hundred marksmanship attempt slots while legacy skills remain valid', async () => {
    const userId = randomUUID();
    const user = await pool.query<{ id: string }>(
      `insert into users (id, display_name, timezone)
       values ($1, 'Marksmanship tester', 'UTC')
       returning id`,
      [userId],
    );
    const game = await pool.query<{ id: string }>(
      `select id from bonus_game where slug = 'marksmanship-1'`,
    );
    expect(game.rows[0]).toBeDefined();
    if (game.rows[0] === undefined) return;
    const attempt = await pool.query<{ id: string }>(
      `insert into bonus_game_attempt
         (user_id, bonus_game_id, status, state, current_period, attempt_seed,
          game_core_version, definition_revision, rules_snapshot, reward_snapshot,
          arena_theme_id_snapshot, arena_snapshot, goalkeeper_ready_url, goalkeeper_save_url)
       select $1, game.id, 'active', 'idle', 0, 'seed', 59, game.revision,
              jsonb_build_object(
                'gameId', game.id::text, 'slug', game.slug, 'title', game.title,
                'revision', game.revision, 'targetGoals', game.target_goals,
                'totalPeriods', game.total_periods, 'breakDurationMs', game.break_duration_ms,
                'periods', game.period_rules, 'goalkeeperReadyUrl', game.goalkeeper_ready_url,
                'goalkeeperSaveUrl', game.goalkeeper_save_url,
                'arena', jsonb_build_object(
                  'id', arena.id::text, 'slug', arena.slug, 'title', arena.title,
                  'artworkUrl', arena.artwork_url, 'thumbnailUrl', arena.thumbnail_url
                )
              ),
              jsonb_build_object('coins', 0, 'stars', 1, 'experience', 1),
              arena.id,
              jsonb_build_object(
                'id', arena.id::text, 'slug', arena.slug, 'title', arena.title,
                'artworkUrl', arena.artwork_url, 'thumbnailUrl', arena.thumbnail_url
              ),
              game.goalkeeper_ready_url, game.goalkeeper_save_url
         from bonus_game game
         join arena_theme arena on arena.id = game.arena_theme_id
        where game.id = $2
       returning id`,
      [user.rows[0]!.id, game.rows[0]!.id],
    );

    await expect(
      pool.query(
        `insert into bonus_game_daily_attempt_slot
           (user_id, local_date, skill_code, slot, attempt_id)
         values ($1, current_date, 'marksmanship', 100, $2)`,
        [user.rows[0]!.id, attempt.rows[0]!.id],
      ),
    ).resolves.toBeDefined();
  });
});
