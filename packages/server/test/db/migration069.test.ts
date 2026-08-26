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
  const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hockey-migrations-before-069-'));
  const files = (await fs.readdir(MIGRATIONS_DIR))
    .filter((file) => file.endsWith('.sql') && file.localeCompare(cutoff) < 0)
    .sort((left, right) => left.localeCompare(right));
  await Promise.all(
    files.map((file) => fs.copyFile(path.join(MIGRATIONS_DIR, file), path.join(targetDir, file))),
  );
  return targetDir;
}

describe.skipIf(!hasIntegrationEnv)('069 bonus skill catalogue reset', () => {
  let pool: Pool;
  let migrationsBefore069Dir: string;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    migrationsBefore069Dir = await createMigrationsDirBefore('069_bonus_game_qualifications.sql');
    await applyMigrations(pool, migrationsBefore069Dir);
  });

  afterAll(async () => {
    await pool.end();
    await fs.rm(migrationsBefore069Dir, { recursive: true, force: true });
  });

  it('refunds every paid unlock with sequential audit balances and resets only bonus progress', async () => {
    const userId = '00000000-0000-4000-8000-000000000691';
    const attemptId = '00000000-0000-4000-8000-000000000692';
    const completionId = '00000000-0000-4000-8000-000000000693';
    const games = await pool.query<{
      id: string;
      slug: string;
      title: string;
      arena_theme_id: string;
      arena_slug: string;
      arena_title: string;
      artwork_url: string;
      thumbnail_url: string;
    }>(
      `select game.id, game.slug, game.title, game.arena_theme_id,
              arena.slug as arena_slug, arena.title as arena_title,
              arena.artwork_url, arena.thumbnail_url
         from bonus_game game
         join arena_theme arena on arena.id = game.arena_theme_id
        where sort_order in (2, 4)
        order by sort_order`,
    );
    const firstGame = games.rows[0]!;
    const secondGame = games.rows[1]!;
    const arenaSnapshot = {
      id: firstGame.arena_theme_id,
      slug: firstGame.arena_slug,
      title: firstGame.arena_title,
      artworkUrl: firstGame.artwork_url,
      thumbnailUrl: firstGame.thumbnail_url,
    };
    const rulesSnapshot = {
      gameId: firstGame.id,
      slug: firstGame.slug,
      title: firstGame.title,
      revision: 1,
      targetGoals: 1,
      totalPeriods: 1,
      breakDurationMs: 0,
      periods: [],
      goalkeeperReadyUrl: '/ready.webp',
      goalkeeperSaveUrl: '/save.webp',
      arena: arenaSnapshot,
    };

    await pool.query(
      `insert into users (id, display_name, timezone, xp, experience)
       values ($1, 'Bonus Reset Player', 'Europe/Moscow', 10, 77)`,
      [userId],
    );
    await pool.query(
      `insert into user_currency_account (user_id, balance, reserved_balance)
       values ($1, 123, 0)`,
      [userId],
    );

    const purchaseIds: string[] = [];
    for (const [index, entry] of [
      { game: firstGame, price: 1, starsAfter: 9 },
      { game: secondGame, price: 2, starsAfter: 7 },
    ].entries()) {
      const createdAt = `2026-08-20T10:0${index}:00.000Z`;
      const event = await pool.query<{ id: string }>(
        `insert into bonus_game_economy_event
           (user_id, bonus_game_id, kind, stars_delta,
            coins_after, stars_after, experience_after, snapshot, created_at)
         values ($1, $2, 'unlock_purchase', $3, 123, $4, 77, $5::jsonb, $6)
         returning id`,
        [userId, entry.game.id, -entry.price, entry.starsAfter, '{}', createdAt],
      );
      const eventId = event.rows[0]!.id;
      purchaseIds.push(eventId);
      await pool.query(
        `insert into user_bonus_game_unlock
           (user_id, bonus_game_id, paid_price_stars, economy_event_id, unlocked_at)
         values ($1, $2, $3, $4, $5)`,
        [userId, entry.game.id, entry.price, eventId, createdAt],
      );
    }

    await pool.query(
      `insert into bonus_game_attempt
         (id, user_id, bonus_game_id, status, state, current_period, closed_at,
          attempt_seed, game_core_version, definition_revision, rules_snapshot,
          reward_snapshot, arena_theme_id_snapshot, arena_snapshot,
          goalkeeper_ready_url, goalkeeper_save_url)
       values ($1, $2, $3, 'completed', 'closed', 1, now(), 'reset-seed', 1, 1,
               $5::jsonb, '{"coins":5,"stars":1,"experience":2}'::jsonb,
               $4, $6::jsonb, '/ready.webp', '/save.webp')`,
      [
        attemptId,
        userId,
        firstGame.id,
        firstGame.arena_theme_id,
        JSON.stringify(rulesSnapshot),
        JSON.stringify(arenaSnapshot),
      ],
    );
    await pool.query(
      `insert into user_bonus_game_completion
         (id, user_id, bonus_game_id, attempt_id, reward_snapshot)
       values ($1, $2, $3, $4, '{"coins":5,"stars":1,"experience":2}'::jsonb)`,
      [completionId, userId, firstGame.id, attemptId],
    );
    await pool.query(
      `insert into user_arena_unlock
         (user_id, arena_theme_id, source_bonus_game_id, source_completion_id)
       values ($1, $2, $3, $4)`,
      [userId, firstGame.arena_theme_id, firstGame.id, completionId],
    );
    await pool.query('update users set home_arena_theme_id = $2 where id = $1', [
      userId,
      firstGame.arena_theme_id,
    ]);
    await pool.query(
      `insert into bonus_game_economy_event
         (user_id, bonus_game_id, attempt_id, kind, coins_delta, stars_delta,
          experience_delta, coins_after, stars_after, experience_after, snapshot)
       values ($1, $2, $3, 'first_clear_reward', 5, 1, 2, 123, 10, 77, '{}'::jsonb)`,
      [userId, firstGame.id, attemptId],
    );

    const applied = await applyMigrations(pool, MIGRATIONS_DIR);
    expect(applied.applied).toEqual(['069_bonus_game_qualifications.sql']);

    const user = await pool.query<{
      xp: number;
      experience: number;
      home_arena_theme_id: string | null;
    }>('select xp, experience, home_arena_theme_id from users where id = $1', [userId]);
    expect(user.rows[0]).toEqual({ xp: 13, experience: 77, home_arena_theme_id: null });

    const refunds = await pool.query<{
      stars_delta: number;
      stars_after: number;
      original_event_id: string;
    }>(
      `select stars_delta, stars_after,
              snapshot->>'originalEconomyEventId' as original_event_id
         from bonus_game_economy_event
        where user_id = $1 and kind = 'unlock_refund'
        order by stars_delta`,
      [userId],
    );
    expect(refunds.rows).toEqual([
      { stars_delta: 1, stars_after: 11, original_event_id: purchaseIds[0] },
      { stars_delta: 2, stars_after: 13, original_event_id: purchaseIds[1] },
    ]);

    const resetCounts = await pool.query<{
      attempts: number;
      completions: number;
      unlocks: number;
      arena_unlocks: number;
      original_events: number;
    }>(
      `select
         (select count(*)::int from bonus_game_attempt where user_id = $1) as attempts,
         (select count(*)::int from user_bonus_game_completion where user_id = $1) as completions,
         (select count(*)::int from user_bonus_game_unlock where user_id = $1) as unlocks,
         (select count(*)::int from user_arena_unlock where user_id = $1) as arena_unlocks,
         (select count(*)::int from bonus_game_economy_event
           where user_id = $1 and kind <> 'unlock_refund') as original_events`,
      [userId],
    );
    expect(resetCounts.rows[0]).toEqual({
      attempts: 0,
      completions: 0,
      unlocks: 0,
      arena_unlocks: 0,
      original_events: 3,
    });
  });
});
