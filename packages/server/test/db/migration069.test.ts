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

    const extraArenaId = '00000000-0000-4000-8000-000000000681';
    const extraGameId = '00000000-0000-4000-8000-000000000671';
    const archivedExtraArenaId = '00000000-0000-4000-8000-000000000682';
    const archivedExtraGameId = '00000000-0000-4000-8000-000000000672';
    await pool.query(
      `insert into arena_theme
         (id, slug, title, artwork_url, thumbnail_url, status, is_selectable)
       values ($1, 'extra-draft-arena', 'Extra draft arena',
               '/bonus-games/arenas/extra.webp', '/bonus-games/arenas/extra.webp', 'active', true)`,
      [extraArenaId],
    );
    await pool.query(
      `insert into bonus_game
         (id, slug, title, description, sort_order, status, access_type,
          unlock_price_stars, target_goals, total_periods, break_duration_ms,
          period_rules, reward_coins, reward_stars, reward_experience,
          arena_theme_id, goalkeeper_ready_url, goalkeeper_save_url, revision)
       values ($1, 'extra-draft', 'Extra draft game', '', 1, 'draft', 'free',
               0, 1, 1, 0,
               '[{"periodNumber":1,"durationMs":240000,"shotsLimit":30,"goalFrequency":0.45,"goalieFrequency":0.5,"shooterFrequency":0.65,"puckSpeedPerMs":1.2,"goaliePattern":"linear","goalieAmplitude":1,"goalAmplitude":220}]'::jsonb,
               0, 0, 0, $2, '/ready.webp', '/save.webp', 1)`,
      [extraGameId, extraArenaId],
    );
    await pool.query(
      `insert into arena_theme
         (id, slug, title, artwork_url, thumbnail_url, status, is_selectable)
       values ($1, 'extra-archived-arena', 'Extra archived arena',
               '/bonus-games/arenas/extra-archived.webp',
               '/bonus-games/arenas/extra-archived.webp', 'archived', false)`,
      [archivedExtraArenaId],
    );
    await pool.query(
      `insert into bonus_game
         (id, slug, title, description, sort_order, status, access_type,
          unlock_price_stars, target_goals, total_periods, break_duration_ms,
          period_rules, reward_coins, reward_stars, reward_experience,
          arena_theme_id, goalkeeper_ready_url, goalkeeper_save_url, revision, archived_at)
       values ($1, 'extra-archived', 'Extra archived game', '', 20, 'archived', 'free',
               0, 2, 1, 0,
               '[{"periodNumber":1,"durationMs":240000,"shotsLimit":30,"goalFrequency":0.45,"goalieFrequency":0.5,"shooterFrequency":0.65,"puckSpeedPerMs":1.2,"goaliePattern":"linear","goalieAmplitude":1,"goalAmplitude":220}]'::jsonb,
               0, 0, 0, $2, '/ready.webp', '/save.webp', 1, now())`,
      [archivedExtraGameId, archivedExtraArenaId],
    );

    const applied = await applyMigrations(pool, MIGRATIONS_DIR);
    expect(applied.applied).toEqual([
      '069_bonus_game_qualifications.sql',
      '069_official_dialogs.sql',
      '070_bonus_game_preview_location_cards.sql',
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

    const accuracy = await pool.query<{
      count: number;
      extra_duplicated: boolean;
    }>(
      `select count(*) filter (where skill_code = 'accuracy')::int as count,
              bool_or(skill_code = 'accuracy'
                and slug in ('accuracy-extra-draft', 'accuracy-extra-archived')) as extra_duplicated
         from bonus_game`,
    );
    expect(accuracy.rows[0]).toEqual({ count: 13, extra_duplicated: false });

    const preservedExtras = await pool.query<{
      id: string;
      status: string;
      skill_code: string;
      qualification_rules: unknown;
    }>(
      `select id, status, skill_code, qualification_rules
         from bonus_game
        where id = any($1::uuid[])
        order by id`,
      [[extraGameId, archivedExtraGameId]],
    );
    expect(preservedExtras.rows).toEqual([
      {
        id: extraGameId,
        status: 'draft',
        skill_code: 'speed',
        qualification_rules: {
          type: 'goals_from_shots',
          targetGoals: 1,
          shotsLimit: 30,
        },
      },
      {
        id: archivedExtraGameId,
        status: 'archived',
        skill_code: 'speed',
        qualification_rules: {
          type: 'goals_from_shots',
          targetGoals: 2,
          shotsLimit: 30,
        },
      },
    ]);

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
