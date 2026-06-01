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
    files.map((file) =>
      fs.copyFile(path.join(MIGRATIONS_DIR, file), path.join(targetDir, file)),
    ),
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
    await pool.query(
      `insert into users (id, display_name, timezone)
       values ($1, 'Migration Keeper', 'Europe/Moscow')`,
      [userId],
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

    const applied = await applyMigrations(pool, MIGRATIONS_DIR);
    expect(applied.applied).toEqual(['050_duel_inventory_usage_resources.sql']);

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
        charges_per_purchase: 8_400_000,
        effect_puck_speed_points: 0,
      },
      {
        item_kind: 'nutrition',
        title: 'Энерго-заряд',
        resource_unit: 'energy_ms',
        currency_price: 2490,
        charges_per_purchase: 15_000_000,
        effect_puck_speed_points: 0,
      },
      {
        item_kind: 'nutrition',
        title: 'Энерго-комплекс',
        resource_unit: 'energy_ms',
        currency_price: 3490,
        charges_per_purchase: 21_600_000,
        effect_puck_speed_points: 0,
      },
      {
        item_kind: 'skates',
        title: 'Старт',
        resource_unit: 'distance',
        currency_price: 2990,
        charges_per_purchase: 1000,
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
