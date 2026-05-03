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
    expect(names).toContain('channel_post_comments');
    expect(names).toContain('channel_post_comment_reactions');
    expect(names).toContain('channel_post_views');
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
      { title: 'Спортпитание', photo_url: '/inventory/nutrition.webp' },
    ]);
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
    ]);
  });
});
