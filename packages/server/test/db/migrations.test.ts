import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';
import { applyMigrations } from '../../src/db/migrations.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

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
    expect(names).toContain('_migrations');

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
        charges_per_purchase: 8_400_000,
        effect_puck_speed_points: 0,
      },
      {
        title: 'Энерго-заряд',
        item_kind: 'nutrition',
        resource_unit: 'energy_ms',
        currency_price: 2490,
        charges_per_purchase: 15_000_000,
        effect_puck_speed_points: 0,
      },
      {
        title: 'Энерго-комплекс',
        item_kind: 'nutrition',
        resource_unit: 'energy_ms',
        currency_price: 3490,
        charges_per_purchase: 21_600_000,
        effect_puck_speed_points: 0,
      },
      {
        title: 'Старт',
        item_kind: 'skates',
        resource_unit: 'distance',
        currency_price: 2990,
        charges_per_purchase: 1000,
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
    ]);
  });
});
