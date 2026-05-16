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
    expect(names).toContain('feedback_messages');
    expect(names).toContain('_migrations');

    const inventory = await pool.query<{ title: string; photo_url: string }>(
      `select title, photo_url
         from admin_inventory_items
        where deleted_at is null
        order by title`,
    );
    expect(inventory.rows).toEqual([
      { title: 'Клюшки', photo_url: '/inventory/sticks.webp' },
      { title: 'Коньки', photo_url: '/inventory/skates.webp' },
      { title: 'Энергия', photo_url: '/inventory/nutrition.webp' },
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
    ]);
  });
});
