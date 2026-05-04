import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyMigrations } from '../../src/db/migrations.js';
import { sendNewsPostPush } from '../../src/push/news.js';
import {
  createTestPool,
  getTestUrls,
  hasIntegrationEnv,
  resetDatabase,
} from '../helpers/testDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

describe.skipIf(!hasIntegrationEnv)('news push delivery', () => {
  let pool: ReturnType<typeof createTestPool>;

  beforeEach(async () => {
    getTestUrls();
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);
  });

  afterEach(async () => {
    await pool.end();
  });

  it('queues deliveries and skips users when game news notifications are disabled', async () => {
    const users = await pool.query<{ id: string; display_name: string }>(
      `insert into users (id, display_name, timezone)
       values (gen_random_uuid(), 'Admin', 'UTC'),
              (gen_random_uuid(), 'News enabled', 'UTC'),
              (gen_random_uuid(), 'News muted', 'UTC')
       returning id, display_name`,
    );
    const admin = users.rows.find((user) => user.display_name === 'Admin')!;
    const enabled = users.rows.find((user) => user.display_name === 'News enabled')!;
    const muted = users.rows.find((user) => user.display_name === 'News muted')!;

    await pool.query(
      `insert into user_push_preferences (user_id, game_news)
       values ($1, false)`,
      [muted.id],
    );
    await pool.query(
      `insert into push_subscriptions (user_id, endpoint, p256dh, auth)
       values ($1, 'https://push.example.test/send/enabled', $2, $3),
              ($4, 'https://push.example.test/send/muted', $5, $6)`,
      [
        enabled.id,
        randomBytes(65).toString('base64url'),
        randomBytes(16).toString('base64url'),
        muted.id,
        randomBytes(65).toString('base64url'),
        randomBytes(16).toString('base64url'),
      ],
    );

    const result = await sendNewsPostPush(pool, {
      senderUserId: admin.id,
      title: 'Новости игры',
      body: 'Большое обновление уже на льду',
      url: '/chat/news',
      tag: 'news-test',
    });

    expect(result).toEqual({ total: 2, queued: 1, skipped: 1 });
    const queued = await pool.query<{
      user_id: string;
      event_type: string;
      event_key: string;
      payload: { title: string; body: string; url: string; tag: string };
    }>(`select user_id::text, event_type, event_key, payload from push_delivery_log`);
    expect(queued.rows).toEqual([
      expect.objectContaining({
        user_id: enabled.id,
        event_type: 'news.posted',
        event_key: 'news:news-test',
        payload: expect.objectContaining({
          title: 'Новости игры',
          body: 'Большое обновление уже на льду',
          url: '/chat/news',
          tag: 'news-test',
        }),
      }),
    ]);
  });
});
