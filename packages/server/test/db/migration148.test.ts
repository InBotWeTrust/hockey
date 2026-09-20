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

describe.skipIf(!hasIntegrationEnv)('migration 148 endurance bonus games', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrationsThrough(pool, MIGRATIONS_DIR, '148_bonus_endurance_games.sql');
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('adds a nullable ordered pair of goal-window timestamps', async () => {
    const columns = await pool.query<{
      column_name: string;
      data_type: string;
      is_nullable: string;
    }>(
      `select column_name, data_type, is_nullable
         from information_schema.columns
        where table_schema = 'public'
          and table_name = 'bonus_game_attempt'
          and column_name in ('goal_window_started_at', 'goal_window_ends_at')
        order by column_name`,
    );

    expect(columns.rows).toEqual([
      {
        column_name: 'goal_window_ends_at',
        data_type: 'timestamp with time zone',
        is_nullable: 'YES',
      },
      {
        column_name: 'goal_window_started_at',
        data_type: 'timestamp with time zone',
        is_nullable: 'YES',
      },
    ]);

    const pairConstraint = await pool.query<{ definition: string }>(
      `select pg_get_constraintdef(oid) as definition
         from pg_constraint
        where conrelid = 'bonus_game_attempt'::regclass
          and conname = 'bonus_game_attempt_goal_window_pair_check'`,
    );
    expect(pairConstraint.rows[0]?.definition).toContain(
      'goal_window_ends_at > goal_window_started_at',
    );
  });

  it('seeds seven exact free endurance definitions on the amateur court', async () => {
    const games = await pool.query<{
      id: string;
      slug: string;
      title: string;
      skill_code: string;
      sort_order: number;
      target_goals: number;
      qualification_rules: {
        type: string;
        activeTimeMs: number;
        goalWindowMs: number;
      };
      period_rules: Array<{
        durationMs: number;
        shotsLimit: number | null;
        goalFrequency: number;
        goalieFrequency: number;
        shooterFrequency: number;
        puckSpeedPerMs: number;
      }>;
      total_periods: number;
      break_duration_ms: number;
      use_inventory: boolean;
      access_type: string;
      reward_coins: number;
      reward_stars: number;
      reward_experience: number;
      arena_theme_id: string;
      goalkeeper_ready_url: string;
      goalkeeper_save_url: string;
    }>(
      `select id, slug, title, skill_code, sort_order, target_goals,
              qualification_rules, period_rules, total_periods, break_duration_ms,
              use_inventory, access_type, reward_coins, reward_stars, reward_experience,
              arena_theme_id, goalkeeper_ready_url, goalkeeper_save_url
         from bonus_game
        where skill_code = 'endurance'
        order by sort_order`,
    );

    expect(
      games.rows.map((game) => ({
        id: game.id,
        slug: game.slug,
        title: game.title,
        activeTimeMs: game.qualification_rules.activeTimeMs,
        goalWindowMs: game.qualification_rules.goalWindowMs,
      })),
    ).toEqual([
      {
        id: '00000000-0000-4000-8000-000000000711',
        slug: 'endurance-1',
        title: 'Выносливость 1',
        activeTimeMs: 180_000,
        goalWindowMs: 7_000,
      },
      {
        id: '00000000-0000-4000-8000-000000000712',
        slug: 'endurance-2',
        title: 'Выносливость 2',
        activeTimeMs: 190_000,
        goalWindowMs: 6_500,
      },
      {
        id: '00000000-0000-4000-8000-000000000713',
        slug: 'endurance-3',
        title: 'Выносливость 3',
        activeTimeMs: 200_000,
        goalWindowMs: 6_000,
      },
      {
        id: '00000000-0000-4000-8000-000000000714',
        slug: 'endurance-4',
        title: 'Выносливость 4',
        activeTimeMs: 210_000,
        goalWindowMs: 5_500,
      },
      {
        id: '00000000-0000-4000-8000-000000000715',
        slug: 'endurance-5',
        title: 'Выносливость 5',
        activeTimeMs: 220_000,
        goalWindowMs: 5_000,
      },
      {
        id: '00000000-0000-4000-8000-000000000716',
        slug: 'endurance-6',
        title: 'Выносливость 6',
        activeTimeMs: 230_000,
        goalWindowMs: 4_000,
      },
      {
        id: '00000000-0000-4000-8000-000000000717',
        slug: 'endurance-7',
        title: 'Выносливость 7',
        activeTimeMs: 240_000,
        goalWindowMs: 3_000,
      },
    ]);
    for (const game of games.rows) {
      expect(game).toMatchObject({
        skill_code: 'endurance',
        target_goals: 1,
        total_periods: 1,
        break_duration_ms: 0,
        use_inventory: false,
        access_type: 'free',
        reward_coins: 0,
        reward_stars: 1,
        reward_experience: 1,
        arena_theme_id: '00000000-0000-4000-8000-000000000700',
        goalkeeper_ready_url: '/sprites/training-goalie-amateur.webp',
        goalkeeper_save_url: '/sprites/training-goalie-amateur-save.webp',
        qualification_rules: {
          type: 'survive_goal_windows',
          activeTimeMs: game.period_rules[0]?.durationMs,
        },
      });
      expect(game.period_rules).toEqual([
        expect.objectContaining({
          durationMs: game.qualification_rules.activeTimeMs,
          shotsLimit: null,
          goalFrequency: 0.5,
          goalieFrequency: 0.6,
          shooterFrequency: 0.75,
          puckSpeedPerMs: 1.25,
        }),
      ]);
    }
  });

  it('accepts endurance slot 100 and the goal-window timeout close reason', async () => {
    const userId = randomUUID();
    await pool.query(
      `insert into users (id, display_name, timezone)
       values ($1, 'Endurance tester', 'UTC')`,
      [userId],
    );
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
        where game.slug = 'endurance-1'
       returning id`,
      [userId],
    );
    const attemptId = attempt.rows[0]?.id;
    expect(attemptId).toBeDefined();
    if (attemptId === undefined) return;

    await expect(
      pool.query(
        `insert into bonus_game_daily_attempt_slot
           (user_id, local_date, skill_code, slot, attempt_id)
         values ($1, current_date, 'endurance', 100, $2)`,
        [userId, attemptId],
      ),
    ).resolves.toBeDefined();
    await expect(
      pool.query(
        `insert into bonus_game_period_log
           (attempt_id, period_number, started_at, ended_at, shots_taken, goals,
            duration_ms, closed_reason)
         values ($1, 1, now() - interval '7 seconds', now(), 1, 0, 7000,
                 'goal_window_timeout')`,
        [attemptId],
      ),
    ).resolves.toBeDefined();
  });
});
