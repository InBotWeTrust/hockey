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

async function createMigrationsDirBefore(cutoff: string): Promise<string> {
  const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hockey-migrations-before-071-'));
  const files = (await fs.readdir(MIGRATIONS_DIR))
    .filter((file) => file.endsWith('.sql') && file.localeCompare(cutoff) < 0)
    .sort((left, right) => left.localeCompare(right));
  await Promise.all(
    files.map((file) => fs.copyFile(path.join(MIGRATIONS_DIR, file), path.join(targetDir, file))),
  );
  return targetDir;
}

describe.skipIf(!hasIntegrationEnv)('071 accuracy World Tour migration', () => {
  let pool: Pool;
  let migrationsBefore071Dir: string;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    migrationsBefore071Dir = await createMigrationsDirBefore(
      '071_bonus_game_accuracy_world_tour.sql',
    );
    await applyMigrations(pool, migrationsBefore071Dir);
  });

  afterAll(async () => {
    await pool.end();
    await fs.rm(migrationsBefore071Dir, { recursive: true, force: true });
  });

  it('preserves historical progress and snapshotted active attempts for replaced games', async () => {
    const userId = '00000000-0000-4000-8000-000000000701';
    const attemptId = '00000000-0000-4000-8000-000000000702';
    const completionId = '00000000-0000-4000-8000-000000000703';
    const activeUserId = '00000000-0000-4000-8000-000000000704';
    const activeAttemptId = '00000000-0000-4000-8000-000000000705';
    await pool.query(
      `insert into users (id, display_name, timezone, xp, experience)
       values ($1, 'World Tour Player', 'Europe/Moscow', 20, 100)`,
      [userId],
    );
    await pool.query(
      `insert into user_currency_account (user_id, balance, reserved_balance)
       values ($1, 500, 0)`,
      [userId],
    );
    await pool.query(
      `insert into users (id, display_name, timezone, xp, experience)
       values ($1, 'Active World Tour Player', 'Europe/Moscow', 20, 100)`,
      [activeUserId],
    );

    const games = await pool.query<{
      id: string;
      slug: string;
      title: string;
      revision: number;
      preview_revision: number;
      arena_theme_id: string;
      arena_slug: string;
      arena_title: string;
      artwork_url: string;
      thumbnail_url: string;
      unlock_price_stars: number;
    }>(
      `select game.id, game.slug, game.title, game.revision, game.preview_revision,
              game.arena_theme_id, game.unlock_price_stars,
              arena.slug as arena_slug, arena.title as arena_title,
              arena.artwork_url, arena.thumbnail_url
         from bonus_game game
         join arena_theme arena on arena.id = game.arena_theme_id
        where game.skill_code = 'accuracy'
          and (game.sort_order = 1 or game.access_type = 'paid')
        order by game.sort_order`,
    );
    const completedGame = games.rows[0]!;
    const paidGame = games.rows.find((game) => game.unlock_price_stars > 0)!;
    const arenaSnapshot = {
      id: completedGame.arena_theme_id,
      slug: completedGame.arena_slug,
      title: completedGame.arena_title,
      artworkUrl: completedGame.artwork_url,
      thumbnailUrl: completedGame.thumbnail_url,
    };
    const rulesSnapshot = {
      gameId: completedGame.id,
      slug: completedGame.slug,
      title: completedGame.title,
      revision: completedGame.revision,
      targetGoals: 18,
      totalPeriods: 1,
      breakDurationMs: 0,
      periods: [],
      goalkeeperReadyUrl: '/ready.webp',
      goalkeeperSaveUrl: '/save.webp',
      arena: arenaSnapshot,
    };

    await pool.query(
      `insert into bonus_game_attempt
         (id, user_id, bonus_game_id, status, state, current_period, closed_at,
          attempt_seed, game_core_version, definition_revision, rules_snapshot,
          reward_snapshot, arena_theme_id_snapshot, arena_snapshot,
          goalkeeper_ready_url, goalkeeper_save_url)
       values ($1, $2, $3, 'completed', 'closed', 1, now(), 'world-tour-seed', 1, $4,
               $5::jsonb, '{"coins":100,"stars":1,"experience":50}'::jsonb,
               $6, $7::jsonb, '/ready.webp', '/save.webp')`,
      [
        attemptId,
        userId,
        completedGame.id,
        completedGame.revision,
        JSON.stringify(rulesSnapshot),
        completedGame.arena_theme_id,
        JSON.stringify(arenaSnapshot),
      ],
    );
    await pool.query(
      `insert into bonus_game_attempt
         (id, user_id, bonus_game_id, status, state, current_period,
          attempt_seed, game_core_version, definition_revision, rules_snapshot,
          reward_snapshot, arena_theme_id_snapshot, arena_snapshot,
          goalkeeper_ready_url, goalkeeper_save_url)
       values ($1, $2, $3, 'active', 'idle', 0, 'active-world-tour-seed', 1, $4,
               $5::jsonb, '{"coins":0,"stars":0,"experience":0}'::jsonb,
               $6, $7::jsonb, '/ready.webp', '/save.webp')`,
      [
        activeAttemptId,
        activeUserId,
        completedGame.id,
        completedGame.revision,
        JSON.stringify(rulesSnapshot),
        completedGame.arena_theme_id,
        JSON.stringify(arenaSnapshot),
      ],
    );
    await pool.query(
      `insert into user_bonus_game_completion
         (id, user_id, bonus_game_id, attempt_id, reward_snapshot)
       values ($1, $2, $3, $4, '{"coins":100,"stars":1,"experience":50}'::jsonb)`,
      [completionId, userId, completedGame.id, attemptId],
    );
    await pool.query(
      `insert into user_bonus_game_preview_preference
         (user_id, bonus_game_id, dismissed_revision)
       values ($1, $2, $3)`,
      [userId, completedGame.id, completedGame.preview_revision],
    );
    const purchase = await pool.query<{ id: string }>(
      `insert into bonus_game_economy_event
         (user_id, bonus_game_id, kind, stars_delta,
          coins_after, stars_after, experience_after, snapshot)
       values ($1, $2, 'unlock_purchase', $3, 500, $4, 100, '{}'::jsonb)
       returning id`,
      [userId, paidGame.id, -paidGame.unlock_price_stars, 20 - paidGame.unlock_price_stars],
    );
    await pool.query(
      `insert into user_bonus_game_unlock
         (user_id, bonus_game_id, paid_price_stars, economy_event_id)
       values ($1, $2, $3, $4)`,
      [userId, paidGame.id, paidGame.unlock_price_stars, purchase.rows[0]!.id],
    );

    const applied = await applyMigrations(pool, MIGRATIONS_DIR);
    expect(applied.applied).toEqual([
      '071_bonus_game_accuracy_world_tour.sql',
      '072_tournament_fixture_series_lookup.sql',
      '073_backfill_first_daily_game.sql',
      '074_allow_bonus_repurchase_after_refund.sql',
      '075_tournament_classic.sql',
      '076_speed_bonus_game_balance.sql',
      '077_accuracy_world_tour_movement_balance.sql',
      '078_amateur_rating_visibility.sql',
      '079_rename_express_plus_to_mix.sql',
      '080_sync_mix_period_speeds.sql',
      '081_daily_period_achievement_event_indexes.sql',
      '082_tournament_playoff_scheduling.sql',
      '083_tournament_playoff_notifications.sql',
    ]);

    const preserved = await pool.query<{
      completions: number;
      unlocks: number;
      preferences: number;
      attempts: number;
    }>(
      `select
         (select count(*)::int from user_bonus_game_completion where id = $1) as completions,
         (select count(*)::int from user_bonus_game_unlock
           where user_id = $2 and bonus_game_id = $3) as unlocks,
         (select count(*)::int from user_bonus_game_preview_preference
           where user_id = $2 and bonus_game_id = $4) as preferences,
         (select count(*)::int from bonus_game_attempt where id = $5) as attempts`,
      [completionId, userId, paidGame.id, completedGame.id, attemptId],
    );
    expect(preserved.rows[0]).toEqual({
      completions: 1,
      unlocks: 1,
      preferences: 1,
      attempts: 1,
    });
    const staleActive = await pool.query<{ attempts: number }>(
      `select count(*)::int as attempts
         from bonus_game_attempt
        where id = $1 or (user_id = $2 and status = 'active')`,
      [activeAttemptId, activeUserId],
    );
    expect(staleActive.rows[0]).toEqual({ attempts: 1 });

    const catalog = await pool.query<{ count: number; first_id: string; first_slug: string }>(
      `select count(*)::int as count,
              min(id::text) filter (where sort_order = 1) as first_id,
              min(slug) filter (where sort_order = 1) as first_slug
         from bonus_game
        where skill_code = 'accuracy' and status = 'active'`,
    );
    expect(catalog.rows[0]).toEqual({
      count: 13,
      first_id: completedGame.id,
      first_slug: 'accuracy-moscow',
    });
  });
});
