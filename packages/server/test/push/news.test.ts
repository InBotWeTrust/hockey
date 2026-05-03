import { createECDH, randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyMigrations } from '../../src/db/migrations.js';
import { sendNewsPostPush } from '../../src/push/news.js';
import type { ResolvedPushVapidOptions } from '../../src/push/service.js';
import {
  createTestPool,
  getTestUrls,
  hasIntegrationEnv,
  resetDatabase,
} from '../helpers/testDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

function createP256KeyPair(): { publicKey: string; privateKey: string } {
  const ecdh = createECDH('prime256v1');
  const publicKey = ecdh.generateKeys().toString('base64url');
  const privateKey = ecdh.getPrivateKey().toString('base64url');
  return { publicKey, privateKey };
}

describe.skipIf(!hasIntegrationEnv)('news push delivery', () => {
  let pool: ReturnType<typeof createTestPool>;

  beforeEach(async () => {
    getTestUrls();
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await pool.end();
  });

  it('skips subscriptions when game news notifications are disabled', async () => {
    const vapid: ResolvedPushVapidOptions = {
      ...createP256KeyPair(),
      subject: 'mailto:test@example.com',
    };
    const enabledKeys = createP256KeyPair();
    const disabledKeys = createP256KeyPair();
    const fetchMock = vi.fn(async () => new Response('', { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

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
        enabledKeys.publicKey,
        randomBytes(16).toString('base64url'),
        muted.id,
        disabledKeys.publicKey,
        randomBytes(16).toString('base64url'),
      ],
    );

    const result = await sendNewsPostPush(pool, vapid, {
      senderUserId: admin.id,
      title: 'Новости игры',
      body: 'Большое обновление уже на льду',
      url: '/chat/news',
      tag: 'news-test',
    });

    expect(result).toEqual({ total: 2, sent: 1, skipped: 1, failed: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://push.example.test/send/enabled');
  });
});
