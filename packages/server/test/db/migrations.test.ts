import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';
import { applyMigrations } from '../../src/db/migrations.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

async function createMigrationsDirBefore(cutoff: string): Promise<string> {
  const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hockey-migrations-before-'));
  const files = (await fs.readdir(MIGRATIONS_DIR))
    .filter((file) => file.endsWith('.sql') && file.localeCompare(cutoff) < 0)
    .sort((a, b) => a.localeCompare(b));

  await Promise.all(
    files.map((file) => fs.copyFile(path.join(MIGRATIONS_DIR, file), path.join(targetDir, file))),
  );

  return targetDir;
}

describe.skipIf(!hasIntegrationEnv)('applyMigrations', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('applies pending migrations and is idempotent', async () => {
    const first = await applyMigrations(pool, MIGRATIONS_DIR);
    expect(first.applied).toContain('001_init.sql');

    const second = await applyMigrations(pool, MIGRATIONS_DIR);
    expect(second.applied).toEqual([]);

    const achievementIndexes = await pool.query<{ indexdef: string }>(
      `select indexdef
         from pg_indexes
        where schemaname = 'public'
          and indexname in (
            'event_log_daily_period_closed_achievement_idx',
            'event_log_daily_period_achievements_evaluated_idx'
          )
        order by indexname`,
    );
    expect(achievementIndexes.rows).toHaveLength(2);
    expect(achievementIndexes.rows.every(({ indexdef }) => indexdef.includes('CREATE'))).toBe(true);

    const { rows } = await pool.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
    );
    const names = rows.map((r) => r.table_name);
    expect(names).toContain('users');
    expect(names).toContain('day_pool');
    expect(names).toContain('training_session');
    expect(names).toContain('achievements');
    expect(names).toContain('user_achievements');
    expect(names).toContain('shot_session');
    expect(names).toContain('event_log');
    expect(names).toContain('game_settings');
    expect(names).toContain('push_subscriptions');
    expect(names).toContain('user_push_preferences');
    expect(names).toContain('push_notification_templates');
    expect(names).toContain('push_delivery_log');
    expect(names).toContain('channel_post_comments');
    expect(names).toContain('channel_post_comment_reactions');
    expect(names).toContain('channel_post_polls');
    expect(names).toContain('channel_post_poll_options');
    expect(names).toContain('channel_post_poll_votes');
    expect(names).toContain('channel_post_views');
    expect(names).toContain('amateur_duel_template');
    expect(names).toContain('amateur_duel_match');
    expect(names).toContain('amateur_duel_participant');
    expect(names).toContain('amateur_duel_period_log');
    expect(names).toContain('amateur_duel_rating');
    expect(names).toContain('user_currency_account');
    expect(names).toContain('currency_ledger');
    expect(names).toContain('user_inventory_item');
    expect(names).toContain('weekly_challenges');
    expect(names).toContain('weekly_challenge_tasks');
    expect(names).toContain('weekly_challenge_participants');
    expect(names).toContain('weekly_challenge_declines');
    expect(names).toContain('weekly_challenge_reward_claims');
    expect(names).toContain('achievement_progress');
    expect(names).toContain('feedback_messages');
    expect(names).toEqual(
      expect.arrayContaining([
        'arena_theme',
        'bonus_game',
        'bonus_game_attempt',
        'bonus_game_period_log',
        'user_bonus_game_unlock',
        'user_bonus_game_completion',
        'user_arena_unlock',
        'bonus_game_economy_event',
        'user_bonus_game_preview_preference',
        'bonus_game_period_loadout',
      ]),
    );
    expect(names).toContain('_migrations');

    const seededBonusGames = await pool.query<{
      slug: string;
      title: string;
      skill_code: 'speed' | 'accuracy';
      sort_order: number;
      unlock_price_stars: number;
      reward_stars: number;
      qualification_rules: {
        type: string;
        targetGoals?: number;
        shotsLimit?: number;
        activeTimeMs?: number;
        requiredGoalStreak?: number;
      };
      period_rules: Array<{ durationMs: number; shotsLimit: number | null }>;
      preview_artwork_url: string;
      goalkeeper_ready_url: string;
      goalkeeper_save_url: string;
      arena_slug: string;
      arena_artwork_url: string;
      arena_thumbnail_url: string;
    }>(
      `select game.slug, game.title, game.skill_code, game.sort_order,
              game.unlock_price_stars, game.reward_stars, game.qualification_rules,
              game.period_rules,
              game.preview_artwork_url, game.goalkeeper_ready_url, game.goalkeeper_save_url,
              arena.slug as arena_slug, arena.artwork_url as arena_artwork_url,
              arena.thumbnail_url as arena_thumbnail_url
         from bonus_game game
         join arena_theme arena on arena.id = game.arena_theme_id
        where game.status = 'active'
        order by game.skill_code, game.sort_order`,
    );
    expect(seededBonusGames.rows).toHaveLength(23);
    const speedTrack = seededBonusGames.rows.filter((game) => game.skill_code === 'speed');
    const accuracyTrack = seededBonusGames.rows.filter((game) => game.skill_code === 'accuracy');
    expect(speedTrack).toHaveLength(10);
    expect(accuracyTrack).toHaveLength(13);
    expect(speedTrack.map((game) => game.sort_order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(accuracyTrack.map((game) => game.sort_order)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13,
    ]);
    expect(speedTrack.map((game) => game.slug)).toEqual([
      'speed-beach',
      'speed-ski-resort',
      'speed-cyberpunk-yard',
      'speed-abandoned-waterpark',
      'speed-pirate-bay',
      'speed-north-pole',
      'speed-desert',
      'speed-volcanic-ice',
      'speed-castle',
      'speed-space',
    ]);
    expect(accuracyTrack.map((game) => game.slug)).toEqual([
      'accuracy-moscow',
      'accuracy-istanbul',
      'accuracy-rome',
      'accuracy-paris',
      'accuracy-london',
      'accuracy-new-york',
      'accuracy-rio-de-janeiro',
      'accuracy-cape-town',
      'accuracy-dubai',
      'accuracy-mumbai',
      'accuracy-singapore',
      'accuracy-beijing',
      'accuracy-tokyo',
    ]);
    expect(speedTrack.every((game) => game.qualification_rules.type === 'goals_in_time')).toBe(
      true,
    );
    expect(
      accuracyTrack.every((game) => game.qualification_rules.type === 'goals_from_shots'),
    ).toBe(true);
    expect(
      accuracyTrack.map((game) => ({
        title: game.title,
        targetGoals: game.qualification_rules.targetGoals,
        shotsLimit: game.qualification_rules.shotsLimit,
        requiredGoalStreak: game.qualification_rules.requiredGoalStreak ?? 0,
      })),
    ).toEqual([
      { title: 'Москва', targetGoals: 18, shotsLimit: 30, requiredGoalStreak: 0 },
      { title: 'Стамбул', targetGoals: 21, shotsLimit: 30, requiredGoalStreak: 0 },
      { title: 'Рим', targetGoals: 23, shotsLimit: 30, requiredGoalStreak: 3 },
      { title: 'Париж', targetGoals: 30, shotsLimit: 45, requiredGoalStreak: 0 },
      { title: 'Лондон', targetGoals: 36, shotsLimit: 50, requiredGoalStreak: 3 },
      { title: 'Нью-Йорк', targetGoals: 40, shotsLimit: 50, requiredGoalStreak: 4 },
      { title: 'Рио-де-Жанейро', targetGoals: 42, shotsLimit: 50, requiredGoalStreak: 4 },
      { title: 'Кейптаун', targetGoals: 47, shotsLimit: 55, requiredGoalStreak: 4 },
      { title: 'Дубай', targetGoals: 49, shotsLimit: 60, requiredGoalStreak: 5 },
      { title: 'Мумбаи', targetGoals: 52, shotsLimit: 60, requiredGoalStreak: 6 },
      { title: 'Сингапур', targetGoals: 66, shotsLimit: 80, requiredGoalStreak: 6 },
      { title: 'Пекин', targetGoals: 76, shotsLimit: 90, requiredGoalStreak: 7 },
      { title: 'Токио', targetGoals: 90, shotsLimit: 90, requiredGoalStreak: 7 },
    ]);
    for (const game of accuracyTrack) {
      const citySlug = game.slug.replace('accuracy-', '');
      expect(game.period_rules.reduce((total, period) => total + (period.shotsLimit ?? 0), 0)).toBe(
        game.qualification_rules.shotsLimit,
      );
      expect(game.period_rules.every((period) => period.durationMs === 240_000)).toBe(true);
      expect(game.preview_artwork_url).toBe(`/bonus-games/world-tour/previews/${citySlug}.webp`);
      expect(game.goalkeeper_ready_url).toBe(
        `/bonus-games/world-tour/goalkeepers/${citySlug}-ready.webp`,
      );
      expect(game.goalkeeper_save_url).toBe(
        `/bonus-games/world-tour/goalkeepers/${citySlug}-save.webp`,
      );
      expect(game.arena_slug).toBe(`accuracy-world-tour-${citySlug}`);
      expect(game.arena_artwork_url).toBe(`/bonus-games/world-tour/arenas/${citySlug}.webp`);
      expect(game.arena_thumbnail_url).toBe(`/bonus-games/world-tour/previews/${citySlug}.webp`);
    }

    const nonLinearBonusPeriods = await pool.query<{ count: string }>(
      `select count(*)::text as count
         from bonus_game
         cross join lateral jsonb_array_elements(period_rules) as period
        where period->>'goaliePattern' <> 'linear'`,
    );
    expect(nonLinearBonusPeriods.rows[0]?.count).toBe('0');

    const attemptColumns = await pool.query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'bonus_game_attempt'`,
    );
    expect(attemptColumns.rows.map((row) => row.column_name)).toEqual(
      expect.arrayContaining([
        'rules_snapshot',
        'reward_snapshot',
        'arena_theme_id_snapshot',
        'game_core_version',
        'period_started_at',
        'break_started_at',
        'current_goal_streak',
        'best_goal_streak',
        'preview_acknowledged_at',
      ]),
    );

    const activeDuelTemplateKinds = await pool.query<{ duel_kind: string; count: string }>(
      `select duel_kind, count(*)::text as count
         from amateur_duel_template
        where deleted_at is null and is_active
        group by duel_kind
        order by duel_kind`,
    );
    expect(activeDuelTemplateKinds.rows.every((row) => Number(row.count) <= 1)).toBe(true);

    const activeDuelTemplateKindIndex = await pool.query<{ indexname: string }>(
      `select indexname
         from pg_indexes
        where schemaname = 'public'
          and tablename = 'amateur_duel_template'
          and indexname = 'amateur_duel_template_one_active_kind_idx'`,
    );
    expect(activeDuelTemplateKindIndex.rows).toHaveLength(1);

    const achievementColumns = await pool.query<{ column_name: string }>(
      `select column_name
         from information_schema.columns
        where table_schema = 'public' and table_name = 'achievements'
        order by column_name`,
    );
    expect(achievementColumns.rows.map((row) => row.column_name)).toEqual(
      expect.arrayContaining([
        'availability',
        'category',
        'future_tag',
        'reward_currency',
        'reward_experience',
        'reward_stars',
        'updated_at',
      ]),
    );

    const userAchievementColumns = await pool.query<{ column_name: string }>(
      `select column_name
         from information_schema.columns
        where table_schema = 'public' and table_name = 'user_achievements'
        order by column_name`,
    );
    expect(userAchievementColumns.rows.map((row) => row.column_name)).toEqual(
      expect.arrayContaining(['claimed_at', 'completed_at', 'completion_context']),
    );

    const duelParticipantColumns = await pool.query<{ column_name: string }>(
      `select column_name
         from information_schema.columns
        where table_schema = 'public' and table_name = 'amateur_duel_participant'
        order by column_name`,
    );
    expect(duelParticipantColumns.rows.map((row) => row.column_name)).toContain(
      'experience_snapshot',
    );

    const inventoryColumns = await pool.query<{ column_name: string }>(
      `select column_name
         from information_schema.columns
        where table_schema = 'public' and table_name = 'admin_inventory_items'
        order by column_name`,
    );
    expect(inventoryColumns.rows.map((row) => row.column_name)).toEqual(
      expect.arrayContaining([
        'resource_unit',
        'effect_puck_speed_points',
        'effect_stumble_interval_min_ms',
        'effect_stumble_interval_max_ms',
        'effect_stumble_duration_min_ms',
        'effect_stumble_duration_max_ms',
        'effect_nutrition_slowdown_ms',
        'effect_nutrition_stop_ms',
        'effect_fatigue_delay_ms',
        'effect_fatigue_speed_multiplier',
      ]),
    );

    const inventory = await pool.query<{
      title: string;
      item_kind: string;
      resource_unit: string;
      currency_price: number;
      charges_per_purchase: number;
      effect_puck_speed_points: number;
    }>(
      `select title, item_kind, resource_unit, currency_price, charges_per_purchase,
              effect_puck_speed_points
         from admin_inventory_items
        where deleted_at is null
          and item_kind in ('stick', 'skates', 'nutrition')
        order by item_kind, currency_price, title`,
    );
    expect(inventory.rows).toEqual([
      {
        title: 'Изотоник',
        item_kind: 'nutrition',
        resource_unit: 'energy_ms',
        currency_price: 1490,
        charges_per_purchase: 5_700_000,
        effect_puck_speed_points: 0,
      },
      {
        title: 'Энерго-заряд',
        item_kind: 'nutrition',
        resource_unit: 'energy_ms',
        currency_price: 2490,
        charges_per_purchase: 8_400_000,
        effect_puck_speed_points: 0,
      },
      {
        title: 'Энерго-комплекс',
        item_kind: 'nutrition',
        resource_unit: 'energy_ms',
        currency_price: 3490,
        charges_per_purchase: 10_800_000,
        effect_puck_speed_points: 0,
      },
      {
        title: 'Разгон',
        item_kind: 'skates',
        resource_unit: 'distance',
        currency_price: 2490,
        charges_per_purchase: 12_500,
        effect_puck_speed_points: 0,
      },
      {
        title: 'Старт',
        item_kind: 'skates',
        resource_unit: 'distance',
        currency_price: 2990,
        charges_per_purchase: 8500,
        effect_puck_speed_points: 0,
      },
      {
        title: 'Профи',
        item_kind: 'skates',
        resource_unit: 'distance',
        currency_price: 3740,
        charges_per_purchase: 16_000,
        effect_puck_speed_points: 0,
      },
      {
        title: 'Ультимейт Ван 1',
        item_kind: 'stick',
        resource_unit: 'shot',
        currency_price: 1490,
        charges_per_purchase: 1300,
        effect_puck_speed_points: 10,
      },
      {
        title: 'Ультимейт Ван 2',
        item_kind: 'stick',
        resource_unit: 'shot',
        currency_price: 2490,
        charges_per_purchase: 1950,
        effect_puck_speed_points: 10,
      },
      {
        title: 'Ультимейт Ван 3',
        item_kind: 'stick',
        resource_unit: 'shot',
        currency_price: 3740,
        charges_per_purchase: 2500,
        effect_puck_speed_points: 10,
      },
    ]);

    const notifications = await pool.query<{ key: string; click_url: string }>(
      `select key, click_url
         from push_notification_templates
        order by key`,
    );
    expect(notifications.rows).toEqual(
      expect.arrayContaining([
        { key: 'news.posted', click_url: '/chat/{{chatId}}' },
        { key: 'daily.unlocked_after_training', click_url: '/?view=hub' },
        { key: 'daily.period_ending', click_url: '/?view=daily' },
        { key: 'training.available', click_url: '/?view=training' },
        { key: 'duel.challenge_received', click_url: '/?view=amateur' },
        { key: 'duel.result_ready', click_url: '/?view=amateur' },
      ]),
    );
  });

  it('records applied migrations in the ledger', async () => {
    const { rows } = await pool.query<{ name: string }>(
      'select name from _migrations order by name',
    );
    expect(rows.map((r) => r.name)).toEqual([
      '001_init.sql',
      '002_grip.sql',
      '003_day_pool.sql',
      '004_chat.sql',
      '005_chat_reaction_user_unique.sql',
      '006_chat_rename_system_default.sql',
      '007_chat_pinned.sql',
      '008_backfill_legacy_timezone.sql',
      '009_chat_description.sql',
      '010_vk_auth_and_display_source.sql',
      '011_training_session.sql',
      '012_achievements.sql',
      '013_refresh_profile_achievements.sql',
      '014_training_daily_locks.sql',
      '015_admin_roles_and_game_settings.sql',
      '016_admin_user_blocking.sql',
      '017_push_subscriptions.sql',
      '018_channel_posts.sql',
      '019_push_preferences.sql',
      '020_admin_payments_inventory.sql',
      '021_feedback_messages.sql',
      '022_seed_admin_inventory_items.sql',
      '023_channel_comment_threads.sql',
      '024_push_notification_templates.sql',
      '025_push_delivery_log.sql',
      '026_channel_post_polls.sql',
      '027_amateur_duels.sql',
      '028_chat_message_metadata.sql',
      '028_duel_kinds_period_rules.sql',
      '029_amateur_duel_rooms_inventory.sql',
      '030_inventory_energy_label.sql',
      '030_media_objects.sql',
      '031_matchmaking_duel_kind_preferences.sql',
      '032_channel_comment_metadata.sql',
      '033_relax_amateur_duel_ranked_limits.sql',
      '034_duel_template_rewards.sql',
      '035_training_daily_cooldown_setting.sql',
      '036_repair_user_profile_columns.sql',
      '037_duel_template_star_rewards.sql',
      '038_duel_one_open_pair.sql',
      '039_user_equipment_inventory_items.sql',
      '040_dev_access_codes.sql',
      '041_shop_inventory_variants.sql',
      '042_dedupe_shop_inventory_variants.sql',
      '043_training_daily_cooldown_30_minutes.sql',
      '044_delete_accidental_telegram_user.sql',
      '045_weekly_challenges.sql',
      '046_weekly_challenge_declines.sql',
      '047_achievements_rework.sql',
      '048_duel_achievement_experience_snapshot.sql',
      '049_amateur_unlock_300_goals.sql',
      '050_duel_inventory_usage_resources.sql',
      '051_dedupe_active_duel_templates.sql',
      '052_backfill_duel_inventory_gameplay_fields.sql',
      '053_duel_challenge_ttl_admin_default.sql',
      '054_inventory_item_instances.sql',
      '055_inventory_skates_energy_balance.sql',
      '056_inventory_low_stock_threshold.sql',
      '057_amateur_no_inventory_penalty_settings.sql',
      '058_bonus_games_and_home_arenas.sql',
      '059_seed_bonus_games.sql',
      '060_bonus_games_linear_goalies.sql',
      '061_tournaments.sql',
      '062_tournament_duel_concurrency.sql',
      '063_tournament_manual_push.sql',
      '064_tournament_live_proposal_active.sql',
      '065_tournament_fixture_venue.sql',
      '066_enable_tournaments.sql',
      '067_tournament_artwork.sql',
      '068_tournament_revision_history.sql',
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
    ]);
    const achievementEventIndexes = await pool.query<{
      indexname: string;
      indexdef: string;
    }>(
      `select indexname, indexdef
         from pg_indexes
        where schemaname = 'public'
          and indexname in (
            'event_log_daily_period_closed_achievement_idx',
            'event_log_daily_period_achievements_evaluated_idx'
          )
        order by indexname`,
    );
    expect(achievementEventIndexes.rows).toHaveLength(2);
    for (const index of achievementEventIndexes.rows) {
      expect(index.indexdef).toContain('(user_id, ((payload ->>');
      expect(index.indexdef).toContain("'day_pool_id'::text");
      expect(index.indexdef).toContain("'period_number'::text");
      expect(index.indexdef).toContain('WHERE (type =');
    }
    const ratingVisibility = await pool.query<{ value: string }>(
      `select value #>> '{}' as value from game_settings where key = 'amateur.rating_visibility'`,
    );
    expect(ratingVisibility.rows[0]?.value).toBe('enabled');

    const mixTemplate = await pool.query<{ period_speed_presets: unknown }>(
      `select period_speed_presets
         from amateur_duel_template
        where duel_kind = 'express_plus'
          and deleted_at is null`,
    );
    expect(mixTemplate.rows).toHaveLength(1);
    expect(mixTemplate.rows[0]?.period_speed_presets).toEqual([
      {
        periodNumber: 1,
        goalFrequency: 0.5,
        goalieFrequency: 0.6,
        shooterFrequency: 0.75,
        puckSpeedPerMs: 1.25,
      },
      {
        periodNumber: 2,
        goalFrequency: 0.5,
        goalieFrequency: 0.6,
        shooterFrequency: 0.7,
        puckSpeedPerMs: 1.25,
      },
    ]);

    const customPresets = [
      {
        periodNumber: 1,
        goalFrequency: 0.41,
        goalieFrequency: 0.52,
        shooterFrequency: 0.63,
        puckSpeedPerMs: 1.14,
      },
    ];
    const migration080 = await fs.readFile(
      path.join(MIGRATIONS_DIR, '080_sync_mix_period_speeds.sql'),
      'utf8',
    );
    await pool.query('begin');
    try {
      await pool.query(
        `update amateur_duel_template
            set period_speed_presets = $1::jsonb
          where duel_kind = 'express_plus'
            and deleted_at is null`,
        [JSON.stringify(customPresets)],
      );
      await pool.query(migration080);
      const customisedMix = await pool.query<{ period_speed_presets: unknown }>(
        `select period_speed_presets
           from amateur_duel_template
          where duel_kind = 'express_plus'
            and deleted_at is null`,
      );
      expect(customisedMix.rows[0]?.period_speed_presets).toEqual(customPresets);
    } finally {
      await pool.query('rollback');
    }
  });

  it('enforces the bonus snapshot, index, and enum constraint contract', async () => {
    const userId = '00000000-0000-4000-8000-000000000581';
    const invalidUserId = '00000000-0000-4000-8000-000000000582';
    const arenaThemeId = '00000000-0000-4000-8000-000000000583';
    const bonusGameId = '00000000-0000-4000-8000-000000000584';
    const attemptId = '00000000-0000-4000-8000-000000000585';
    const periodRule = {
      periodNumber: 1,
      durationMs: 240_000,
      shotsLimit: 30,
      goalFrequency: 0.45,
      goalieFrequency: 0.5,
      shooterFrequency: 0.65,
      puckSpeedPerMs: 1.2,
      goaliePattern: 'linear',
      goalieAmplitude: 1,
      goalAmplitude: 220,
    };
    const arenaSnapshot = {
      id: arenaThemeId,
      slug: 'migration-contract-arena',
      title: 'Migration Contract Arena',
      artworkUrl: '/bonus-games/arenas/migration-contract.webp',
      thumbnailUrl: '/bonus-games/arenas/migration-contract-thumb.webp',
    };
    const rulesSnapshot = {
      gameId: bonusGameId,
      slug: 'migration-contract-game',
      title: 'Migration Contract Game',
      revision: 1,
      targetGoals: 18,
      totalPeriods: 1,
      breakDurationMs: 30_000,
      periods: [periodRule],
      goalkeeperReadyUrl: '/bonus-games/goalkeepers/migration-contract-ready.webp',
      goalkeeperSaveUrl: '/bonus-games/goalkeepers/migration-contract-save.webp',
      arena: arenaSnapshot,
    };

    await pool.query(
      `insert into users (id, display_name, timezone)
       values
         ($1, 'Bonus Migration Contract', 'Europe/Moscow'),
         ($2, 'Invalid Bonus Snapshot', 'Europe/Moscow')`,
      [userId, invalidUserId],
    );
    await pool.query(
      `insert into arena_theme
         (id, slug, title, artwork_url, thumbnail_url)
       values ($1, $2, $3, $4, $5)`,
      [
        arenaThemeId,
        arenaSnapshot.slug,
        arenaSnapshot.title,
        arenaSnapshot.artworkUrl,
        arenaSnapshot.thumbnailUrl,
      ],
    );
    await pool.query(
      `insert into bonus_game
         (id, slug, title, skill_code, sort_order, target_goals, qualification_rules,
          total_periods, break_duration_ms, period_rules, arena_theme_id,
          goalkeeper_ready_url, goalkeeper_save_url)
       values ($1, $2, $3, 'accuracy', 1, 18, $4::jsonb, 1, 30000, $5::jsonb, $6, $7, $8)`,
      [
        bonusGameId,
        rulesSnapshot.slug,
        rulesSnapshot.title,
        JSON.stringify({ type: 'goals_from_shots', targetGoals: 18, shotsLimit: 30 }),
        JSON.stringify([periodRule]),
        arenaThemeId,
        rulesSnapshot.goalkeeperReadyUrl,
        rulesSnapshot.goalkeeperSaveUrl,
      ],
    );

    const insertAttempt = (id: string, attemptUserId: string, snapshot: unknown) =>
      pool.query(
        `insert into bonus_game_attempt
           (id, user_id, bonus_game_id, attempt_seed, game_core_version,
            definition_revision, rules_snapshot, reward_snapshot,
            arena_theme_id_snapshot, arena_snapshot, goalkeeper_ready_url,
            goalkeeper_save_url)
         values ($1, $2, $3, $4, 1, 1, $5::jsonb, $6::jsonb, $7, $8::jsonb, $9, $10)`,
        [
          id,
          attemptUserId,
          bonusGameId,
          `bonus-attempt:${id}`,
          JSON.stringify(snapshot),
          JSON.stringify({ coins: 100, stars: 1, experience: 50 }),
          arenaThemeId,
          JSON.stringify(arenaSnapshot),
          rulesSnapshot.goalkeeperReadyUrl,
          rulesSnapshot.goalkeeperSaveUrl,
        ],
      );

    await expect(insertAttempt(attemptId, userId, rulesSnapshot)).resolves.toMatchObject({
      rowCount: 1,
    });
    const persistedAttempt = await pool.query<{ rules_snapshot: unknown }>(
      'select rules_snapshot from bonus_game_attempt where id = $1',
      [attemptId],
    );
    expect(persistedAttempt.rows[0]?.rules_snapshot).toEqual(rulesSnapshot);
    await expect(
      insertAttempt('00000000-0000-4000-8000-000000000586', invalidUserId, [periodRule]),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      insertAttempt('00000000-0000-4000-8000-000000000587', invalidUserId, {
        periods: [periodRule],
      }),
    ).rejects.toMatchObject({ code: '23514' });

    await expect(
      pool.query(
        `insert into shot_session
           (user_id, mode, bonus_game_attempt_id, period_number, shot_index, seed,
            input_payload, server_result, game_core_version)
         values ($1, 'bonus', $2, 1, 1, 'bonus-shot:1', '{}'::jsonb, 'goal', 1)`,
        [userId, attemptId],
      ),
    ).resolves.toMatchObject({ rowCount: 1 });
    await expect(
      pool.query(
        `insert into shot_session
           (user_id, mode, period_number, shot_index, seed, input_payload,
            server_result, game_core_version)
         values ($1, 'bonus', 1, 2, 'bonus-shot:2', '{}'::jsonb, 'save', 1)`,
        [userId],
      ),
    ).rejects.toMatchObject({ code: '23514' });

    const partialUniqueIndexes = await pool.query<{
      indexname: string;
      indexdef: string;
    }>(
      `select indexname, indexdef
         from pg_indexes
        where schemaname = 'public'
          and indexname = any($1::text[])
        order by indexname`,
      [['bonus_game_attempt_one_active_user_idx', 'bonus_game_economy_one_first_clear_reward_idx']],
    );
    expect(partialUniqueIndexes.rows).toHaveLength(2);
    for (const index of partialUniqueIndexes.rows) {
      expect(index.indexdef).toContain('CREATE UNIQUE INDEX');
      expect(index.indexdef).toContain(' WHERE ');
    }

    const unlockPurchaseIndex = await pool.query<{ indexdef: string }>(
      `select indexdef
         from pg_indexes
        where schemaname = 'public'
          and indexname = 'bonus_game_economy_unlock_purchase_idx'`,
    );
    expect(unlockPurchaseIndex.rows).toHaveLength(1);
    expect(unlockPurchaseIndex.rows[0]?.indexdef).toContain('CREATE INDEX');
    expect(unlockPurchaseIndex.rows[0]?.indexdef).not.toContain('CREATE UNIQUE INDEX');
    expect(unlockPurchaseIndex.rows[0]?.indexdef).toContain('(user_id, bonus_game_id)');
    expect(unlockPurchaseIndex.rows[0]?.indexdef).toContain(
      "WHERE (kind = 'unlock_purchase'::text)",
    );

    const bonusShotIndex = await pool.query<{ indexdef: string }>(
      `select indexdef
         from pg_indexes
        where schemaname = 'public'
          and indexname = 'shot_session_bonus_attempt_idx'`,
    );
    expect(bonusShotIndex.rows[0]?.indexdef).toContain(
      '(bonus_game_attempt_id, period_number, shot_index)',
    );
    expect(bonusShotIndex.rows[0]?.indexdef).toContain(' WHERE ');

    const constraintDefinitions = await pool.query<{
      conname: string;
      definition: string;
    }>(
      `select conname, pg_get_constraintdef(oid) as definition
         from pg_constraint
        where conname = any($1::text[])`,
      [
        [
          'shot_session_mode_check',
          'shot_session_check',
          'currency_ledger_reason_check',
          'media_objects_purpose_check',
        ],
      ],
    );
    const constraints = new Map(
      constraintDefinitions.rows.map((row) => [row.conname, row.definition]),
    );
    expect(constraints.get('shot_session_mode_check')).toContain("'bonus'::text");
    expect(constraints.get('shot_session_check')).toContain('bonus_game_attempt_id');
    expect(constraints.get('shot_session_check')).toContain('period_number');
    expect(constraints.get('currency_ledger_reason_check')).toContain("'bonus_game_reward'::text");
    expect(constraints.get('media_objects_purpose_check')).toContain("'bonus_game_media'::text");
  });
});

describe.skipIf(!hasIntegrationEnv)('089 player onboarding migration', () => {
  let pool: Pool;
  let migrationsBefore089Dir: string | undefined;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    migrationsBefore089Dir = await createMigrationsDirBefore('089_player_onboarding.sql');
  });

  afterAll(async () => {
    await pool.end();
    if (migrationsBefore089Dir) {
      await fs.rm(migrationsBefore089Dir, { recursive: true, force: true });
    }
  });

  it('preserves existing users and defaults onboarding state for new users', async () => {
    await applyMigrations(pool, migrationsBefore089Dir!);

    const existingUserId = '00000000-0000-4060-8060-000000000001';
    const createdUserId = '00000000-0000-4060-8060-000000000002';
    await pool.query(
      `insert into users (id, display_name, timezone)
       values ($1, 'Existing onboarding user', 'Europe/Moscow')`,
      [existingUserId],
    );

    await applyMigrations(pool, MIGRATIONS_DIR);

    await pool.query(
      `insert into users (id, display_name, timezone)
       values ($1, 'Created onboarding user', 'Europe/Moscow')`,
      [createdUserId],
    );
    const existing = await pool.query(
      `select beginner_onboarding_completed, amateur_onboarding_completed
         from users where id = $1`,
      [existingUserId],
    );
    const createdAfter = await pool.query(
      `select beginner_onboarding_completed, amateur_onboarding_completed
         from users where id = $1`,
      [createdUserId],
    );

    expect(existing.rows[0]).toMatchObject({
      beginner_onboarding_completed: true,
      amateur_onboarding_completed: true,
    });
    expect(createdAfter.rows[0]).toMatchObject({
      beginner_onboarding_completed: false,
      amateur_onboarding_completed: false,
    });
  });

  it('enforces onboarding table, event, index, and media contracts', async () => {
    const userId = '00000000-0000-4060-8060-000000000010';
    const secondUserId = '00000000-0000-4060-8060-000000000011';
    const mediaId = '00000000-0000-4060-8060-000000000012';
    const chainKey = 'beginner';
    const versionId = '00000000-0000-4060-8060-000000000013';
    const secondVersionId = '00000000-0000-4060-8060-000000000014';
    const runId = '00000000-0000-4060-8060-000000000015';
    const secondRunId = '00000000-0000-4060-8060-000000000016';
    const sessionId = '00000000-0000-4060-8060-000000000017';
    const stepId = '00000000-0000-4060-8060-000000000018';
    const tutorialStepId = '00000000-0000-4060-8060-000000000019';

    await pool.query(
      `insert into users (id, display_name, timezone)
       values ($1, 'Onboarding contract user', 'Europe/Moscow'),
              ($2, 'Onboarding contract creator', 'Europe/Moscow')`,
      [userId, secondUserId],
    );
    await pool.query(
      `insert into media_objects
         (id, owner_user_id, purpose, object_key, url, content_type, size_bytes)
       values ($1, $2, 'onboarding_image', 'onboarding-contract',
               '/onboarding-contract.webp', 'image/webp', 1)`,
      [mediaId, secondUserId],
    );
    await pool.query(
      `insert into onboarding_chain (key) values ('beginner'), ('amateur')
       on conflict (key) do nothing`,
    );
    await pool.query(
      `insert into onboarding_version (id, chain_key, status, created_by)
       values ($1, $2, 'draft', $3), ($4, $2, 'published', $3)`,
      [versionId, chainKey, secondUserId, secondVersionId],
    );
    await expect(
      pool.query(
        `insert into onboarding_version (chain_key, status)
         values ('beginner', 'draft')`,
      ),
    ).rejects.toMatchObject({ code: '23505' });

    await pool.query(
      `insert into onboarding_step
         (id, version_id, position, kind, title, description, cta_label, media_object_id)
       values ($1, $2, 1, 'informational', 'Welcome', 'Welcome to hockey', 'Continue', $3)`,
      [stepId, versionId, mediaId],
    );
    await expect(
      pool.query(
        `insert into onboarding_step
           (version_id, position, kind, title, description, cta_label, media_object_id)
         values ($1, 1, 'informational', 'Duplicate', 'Duplicate position', 'Continue', $2)`,
        [versionId, mediaId],
      ),
    ).rejects.toMatchObject({ code: '23505' });
    await expect(
      pool.query(
        `insert into onboarding_step
           (version_id, position, kind, title, description, cta_label)
         values ($1, 2, 'informational', 'Missing media', 'Invalid step', 'Continue')`,
        [versionId],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      pool.query(
        `insert into onboarding_step
           (version_id, position, kind, title, description, cta_label)
         values ($1, 2, 'tutorial_shot', 'Missing config', 'Invalid tutorial', 'Shoot')`,
        [versionId],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await pool.query(
      `insert into onboarding_step
         (id, version_id, position, kind, title, description, cta_label, tutorial_config)
       values ($1, $2, 2, 'tutorial_shot', 'Tutorial', 'Take a shot', 'Shoot', '{"period":1}')`,
      [tutorialStepId, versionId],
    );

    await pool.query(
      `insert into onboarding_run
         (id, user_id, chain_key, version_id, client_session_id, source)
       values ($1, $2, 'beginner', $3, $4, 'natural'),
              ($5, $2, 'beginner', $3, '00000000-0000-4060-8060-000000000020', 'preview')`,
      [runId, userId, versionId, sessionId, secondRunId],
    );
    await expect(
      pool.query(
        `insert into onboarding_run
           (user_id, chain_key, version_id, client_session_id, source)
         values ($1, 'beginner', $2, $3, 'natural')`,
        [userId, versionId, sessionId],
      ),
    ).rejects.toMatchObject({ code: '23505' });

    await pool.query(
      `insert into onboarding_event
         (run_id, user_id, chain_key, version_id, step_id, kind, attempt_number)
       values ($1, $2, 'beginner', $3, $4, 'step_viewed', 1),
              ($1, $2, 'beginner', $3, $5, 'tutorial_goal', 1),
              ($1, $2, 'beginner', $3, null, 'completed', 1)`,
      [runId, userId, versionId, stepId, tutorialStepId],
    );
    for (const kind of ['step_viewed', 'tutorial_attempt', 'tutorial_goal'] as const) {
      await expect(
        pool.query(
          `insert into onboarding_event
             (run_id, user_id, chain_key, version_id, kind, attempt_number)
           values ($1, $2, 'beginner', $3, $4, 1)`,
          [secondRunId, userId, versionId, kind],
        ),
      ).rejects.toMatchObject({ code: '23514' });
    }
    await expect(
      pool.query(
        `insert into onboarding_event
           (run_id, user_id, chain_key, version_id, step_id, kind, attempt_number)
         values ($1, $2, 'beginner', $3, $4, 'step_viewed', 1)`,
        [runId, userId, versionId, stepId],
      ),
    ).rejects.toMatchObject({ code: '23505' });
    await expect(
      pool.query(
        `insert into onboarding_event
           (run_id, user_id, chain_key, version_id, step_id, kind, attempt_number)
         values ($1, $2, 'beginner', $3, $4, 'tutorial_goal', 1)`,
        [runId, userId, versionId, tutorialStepId],
      ),
    ).rejects.toMatchObject({ code: '23505' });
    await expect(
      pool.query(
        `insert into onboarding_event
           (run_id, user_id, chain_key, version_id, kind, attempt_number)
         values ($1, $2, 'beginner', $3, 'invalid', 1)`,
        [runId, userId, versionId],
      ),
    ).rejects.toMatchObject({ code: '23514' });

    const indexes = await pool.query<{ indexname: string; indexdef: string }>(
      `select indexname, indexdef from pg_indexes
        where schemaname = 'public'
          and indexname = any($1::text[])
        order by indexname`,
      [
        [
          'onboarding_version_one_draft_idx',
          'onboarding_run_user_started_idx',
          'onboarding_run_natural_version_started_idx',
          'onboarding_event_version_created_idx',
          'onboarding_event_step_viewed_once_idx',
          'onboarding_event_tutorial_goal_once_idx',
          'onboarding_event_completed_once_idx',
        ],
      ],
    );
    expect(indexes.rows).toHaveLength(7);
    expect(
      indexes.rows.find((index) => index.indexname === 'onboarding_version_one_draft_idx')
        ?.indexdef,
    ).toContain('CREATE UNIQUE INDEX');
    expect(
      indexes.rows.find((index) => index.indexname === 'onboarding_event_version_created_idx')
        ?.indexdef,
    ).toContain('(version_id, created_at');
    const naturalStatsIndex = indexes.rows.find(
      (index) => index.indexname === 'onboarding_run_natural_version_started_idx',
    );
    expect(naturalStatsIndex?.indexdef).toContain('(version_id, started_at)');
    expect(naturalStatsIndex?.indexdef).toContain("WHERE (source = 'natural'::text)");
    await pool.query('set enable_seqscan = off');
    const plan = await pool.query<{ 'QUERY PLAN': string }>(
      `explain (costs off)
       select * from onboarding_run
        where source = 'natural' and version_id = $1 and started_at >= now() - interval '1 day'`,
      [versionId],
    );
    expect(plan.rows.map((row) => row['QUERY PLAN']).join('\n')).toContain(
      'onboarding_run_natural_version_started_idx',
    );
    await pool.query('reset enable_seqscan');
    expect(
      indexes.rows
        .filter((index) => index.indexname.endsWith('_once_idx'))
        .every(
          (index) =>
            index.indexdef.includes('CREATE UNIQUE INDEX') && index.indexdef.includes(' WHERE '),
        ),
    ).toBe(true);
  });
});

describe.skipIf(!hasIntegrationEnv)('050 duel inventory resource migration', () => {
  let pool: Pool;
  let migrationsBefore050Dir: string | undefined;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    migrationsBefore050Dir = await createMigrationsDirBefore(
      '050_duel_inventory_usage_resources.sql',
    );
  });

  afterAll(async () => {
    await pool.end();
    if (migrationsBefore050Dir) {
      await fs.rm(migrationsBefore050Dir, { recursive: true, force: true });
    }
  });

  it('preserves old inventory balances and equipped items when replacing catalogue', async () => {
    await applyMigrations(pool, migrationsBefore050Dir!);

    const userId = '00000000-0000-4000-8000-000000000501';
    const opponentId = '00000000-0000-4000-8000-000000000502';
    const matchId = '00000000-0000-4000-8000-000000000503';
    await pool.query(
      `insert into users (id, display_name, timezone)
       values
         ($1, 'Migration Keeper', 'Europe/Moscow'),
         ($2, 'Migration Opponent', 'Europe/Moscow')`,
      [userId, opponentId],
    );
    await pool.query(
      `insert into user_equipment (user_id)
       values ($1)`,
      [userId],
    );

    const oldItems = await pool.query<{
      id: string;
      item_kind: string;
      rarity: string;
      title: string;
    }>(
      `select id, item_kind, rarity, title
         from admin_inventory_items
        where deleted_at is null
          and item_kind in ('stick', 'skates', 'nutrition')`,
    );
    const oldItemByKindRarity = new Map(
      oldItems.rows.map((item) => [`${item.item_kind}:${item.rarity}`, item.id]),
    );

    await pool.query(
      `insert into user_inventory_item
         (user_id, inventory_item_id, charges_available, charges_reserved)
       values
         ($1, $2, 7, 2),
         ($1, $3, 11, 3),
         ($1, $4, 4, 1),
         ($1, $5, 5, 2)`,
      [
        userId,
        oldItemByKindRarity.get('stick:common'),
        oldItemByKindRarity.get('nutrition:rare'),
        oldItemByKindRarity.get('skates:common'),
        oldItemByKindRarity.get('skates:legendary'),
      ],
    );
    await pool.query(
      `update user_equipment
          set equipped_stick_item_id = $2,
              equipped_nutrition_item_id = $3,
              equipped_skates_item_id = $4
        where user_id = $1`,
      [
        userId,
        oldItemByKindRarity.get('stick:common'),
        oldItemByKindRarity.get('nutrition:rare'),
        oldItemByKindRarity.get('skates:legendary'),
      ],
    );
    await pool.query(
      `insert into amateur_duel_match
         (id, challenger_user_id, opponent_user_id, status, rules_snapshot, match_seed,
          starts_at, ends_at, game_core_version)
       values
         ($1, $2, $3, 'active', '{}'::jsonb, 'migration-seed', now(), now() + interval '1 hour', 1)`,
      [matchId, userId, opponentId],
    );
    await pool.query(
      `insert into amateur_duel_participant
         (match_id, user_id, side, state, loadout_snapshot, reserved_inventory_item_id,
          reserved_inventory_charges)
       values
         ($1, $2, 'challenger', 'accepted', $3::jsonb, $4, 2)`,
      [
        matchId,
        userId,
        JSON.stringify({
          items: [
            {
              id: oldItemByKindRarity.get('stick:common'),
              kind: 'stick',
              title: 'Бронзовая клюшка',
              rarity: 'common',
              powerScore: 24,
              duelPeriodCost: 1,
              chargesReserved: 2,
              effects: { puckSpeedDelta: 0 },
            },
          ],
          powerScore: 24,
          powerCap: 100,
        }),
        oldItemByKindRarity.get('stick:common'),
      ],
    );

    const applied = await applyMigrations(pool, MIGRATIONS_DIR);
    expect(applied.applied).toEqual([
      '050_duel_inventory_usage_resources.sql',
      '051_dedupe_active_duel_templates.sql',
      '052_backfill_duel_inventory_gameplay_fields.sql',
      '053_duel_challenge_ttl_admin_default.sql',
      '054_inventory_item_instances.sql',
      '055_inventory_skates_energy_balance.sql',
      '056_inventory_low_stock_threshold.sql',
      '057_amateur_no_inventory_penalty_settings.sql',
      '058_bonus_games_and_home_arenas.sql',
      '059_seed_bonus_games.sql',
      '060_bonus_games_linear_goalies.sql',
      '061_tournaments.sql',
      '062_tournament_duel_concurrency.sql',
      '063_tournament_manual_push.sql',
      '064_tournament_live_proposal_active.sql',
      '065_tournament_fixture_venue.sql',
      '066_enable_tournaments.sql',
      '067_tournament_artwork.sql',
      '068_tournament_revision_history.sql',
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
    ]);

    const activeInventory = await pool.query<{
      item_kind: string;
      title: string;
      resource_unit: string;
      currency_price: number;
      charges_per_purchase: number;
      effect_puck_speed_points: number;
    }>(
      `select item_kind, title, resource_unit, currency_price, charges_per_purchase,
              effect_puck_speed_points
         from admin_inventory_items
        where deleted_at is null
          and item_kind in ('stick', 'skates', 'nutrition')
        order by item_kind, currency_price, title`,
    );
    expect(activeInventory.rows).toEqual([
      {
        item_kind: 'nutrition',
        title: 'Изотоник',
        resource_unit: 'energy_ms',
        currency_price: 1490,
        charges_per_purchase: 5_700_000,
        effect_puck_speed_points: 0,
      },
      {
        item_kind: 'nutrition',
        title: 'Энерго-заряд',
        resource_unit: 'energy_ms',
        currency_price: 2490,
        charges_per_purchase: 8_400_000,
        effect_puck_speed_points: 0,
      },
      {
        item_kind: 'nutrition',
        title: 'Энерго-комплекс',
        resource_unit: 'energy_ms',
        currency_price: 3490,
        charges_per_purchase: 10_800_000,
        effect_puck_speed_points: 0,
      },
      {
        item_kind: 'skates',
        title: 'Разгон',
        resource_unit: 'distance',
        currency_price: 2490,
        charges_per_purchase: 12_500,
        effect_puck_speed_points: 0,
      },
      {
        item_kind: 'skates',
        title: 'Старт',
        resource_unit: 'distance',
        currency_price: 2990,
        charges_per_purchase: 8500,
        effect_puck_speed_points: 0,
      },
      {
        item_kind: 'skates',
        title: 'Профи',
        resource_unit: 'distance',
        currency_price: 3740,
        charges_per_purchase: 16_000,
        effect_puck_speed_points: 0,
      },
      {
        item_kind: 'stick',
        title: 'Ультимейт Ван 1',
        resource_unit: 'shot',
        currency_price: 1490,
        charges_per_purchase: 1300,
        effect_puck_speed_points: 10,
      },
      {
        item_kind: 'stick',
        title: 'Ультимейт Ван 2',
        resource_unit: 'shot',
        currency_price: 2490,
        charges_per_purchase: 1950,
        effect_puck_speed_points: 10,
      },
      {
        item_kind: 'stick',
        title: 'Ультимейт Ван 3',
        resource_unit: 'shot',
        currency_price: 3740,
        charges_per_purchase: 2500,
        effect_puck_speed_points: 10,
      },
    ]);

    const transferredInventory = await pool.query<{
      title: string;
      charges_available: number;
      charges_reserved: number;
    }>(
      `select item.title, inventory.charges_available, inventory.charges_reserved
         from user_inventory_item inventory
         join admin_inventory_items item on item.id = inventory.inventory_item_id
        where inventory.user_id = $1
          and item.deleted_at is null
        order by item.title`,
      [userId],
    );
    expect(transferredInventory.rows).toEqual([
      { title: 'Старт', charges_available: 9, charges_reserved: 3 },
      { title: 'Ультимейт Ван 1', charges_available: 7, charges_reserved: 2 },
      { title: 'Энерго-заряд', charges_available: 11, charges_reserved: 3 },
    ]);

    const oldInventory = await pool.query<{
      title: string;
      charges_available: number;
      charges_reserved: number;
    }>(
      `select item.title, inventory.charges_available, inventory.charges_reserved
         from user_inventory_item inventory
         join admin_inventory_items item on item.id = inventory.inventory_item_id
        where inventory.user_id = $1
          and inventory.inventory_item_id in ($2, $3, $4, $5)
          and item.deleted_at is not null
        order by item.title`,
      [
        userId,
        oldItemByKindRarity.get('stick:common'),
        oldItemByKindRarity.get('nutrition:rare'),
        oldItemByKindRarity.get('skates:common'),
        oldItemByKindRarity.get('skates:legendary'),
      ],
    );
    expect(oldInventory.rows).toEqual([
      { title: 'Бронзовая клюшка', charges_available: 0, charges_reserved: 0 },
      { title: 'Бронзовые коньки', charges_available: 0, charges_reserved: 0 },
      { title: 'Золотые коньки', charges_available: 0, charges_reserved: 0 },
      { title: 'Серебряное питание', charges_available: 0, charges_reserved: 0 },
    ]);

    const remappedParticipant = await pool.query<{
      loadout_snapshot: {
        items: Array<{ id: string; title: string; chargesReserved: number }>;
      };
      reserved_inventory_item_id: string | null;
    }>(
      `select loadout_snapshot, reserved_inventory_item_id
         from amateur_duel_participant
        where match_id = $1 and user_id = $2`,
      [matchId, userId],
    );
    const remappedStick = transferredInventory.rows.find(
      (item) => item.title === 'Ультимейт Ван 1',
    );
    const newStick = await pool.query<{ id: string }>(
      `select id
         from admin_inventory_items
        where deleted_at is null
          and item_kind = 'stick'
          and title = 'Ультимейт Ван 1'`,
    );
    expect(remappedParticipant.rows[0]).toEqual({
      loadout_snapshot: {
        items: [
          expect.objectContaining({
            id: newStick.rows[0]?.id,
            title: 'Ультимейт Ван 1',
            chargesReserved: 2,
          }),
        ],
        powerScore: 24,
        powerCap: 100,
      },
      reserved_inventory_item_id: newStick.rows[0]?.id,
    });
    expect(remappedStick).toEqual({
      title: 'Ультимейт Ван 1',
      charges_available: 7,
      charges_reserved: 2,
    });

    const equipment = await pool.query<{
      equipped_stick: string | null;
      equipped_skates: string | null;
      equipped_nutrition: string | null;
    }>(
      `select stick.title as equipped_stick,
              skates.title as equipped_skates,
              nutrition.title as equipped_nutrition
         from user_equipment equipment
         left join admin_inventory_items stick
           on stick.id = equipment.equipped_stick_item_id
         left join admin_inventory_items skates
           on skates.id = equipment.equipped_skates_item_id
         left join admin_inventory_items nutrition
           on nutrition.id = equipment.equipped_nutrition_item_id
        where equipment.user_id = $1`,
      [userId],
    );
    expect(equipment.rows).toEqual([
      {
        equipped_stick: 'Ультимейт Ван 1',
        equipped_skates: 'Старт',
        equipped_nutrition: 'Энерго-заряд',
      },
    ]);
  });
});
