import { createECDH, randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyMigrations } from '../../src/db/migrations.js';
import { cleanupPushDeliveryLog, processPushDeliveryQueue } from '../../src/push/queue.js';
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
  const privateBytes = ecdh.getPrivateKey();
  if (privateBytes.length > 32) {
    throw new Error('unexpected P-256 private key length');
  }
  const normalizedPrivateKey =
    privateBytes.length === 32
      ? privateBytes
      : Buffer.concat([Buffer.alloc(32 - privateBytes.length), privateBytes]);
  return { publicKey, privateKey: normalizedPrivateKey.toString('base64url') };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

describe.skipIf(!hasIntegrationEnv)('push delivery queue', () => {
  let pool: ReturnType<typeof createTestPool>;
  let vapid: ResolvedPushVapidOptions;

  beforeEach(async () => {
    getTestUrls();
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);
    vapid = {
      ...createP256KeyPair(),
      subject: 'mailto:test@example.com',
    };
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await pool.end();
  });

  it('processes queued deliveries with the configured concurrency limit', async () => {
    const users = await pool.query<{ id: string }>(
      `insert into users (id, display_name, timezone)
       values (gen_random_uuid(), 'Player 1', 'UTC'),
              (gen_random_uuid(), 'Player 2', 'UTC'),
              (gen_random_uuid(), 'Player 3', 'UTC'),
              (gen_random_uuid(), 'Player 4', 'UTC')
       returning id`,
    );

    for (const [index, user] of users.rows.entries()) {
      const keys = createP256KeyPair();
      await pool.query(
        `insert into push_subscriptions (user_id, endpoint, p256dh, auth)
         values ($1, $2, $3, $4)`,
        [
          user.id,
          `https://push.example.test/send/${index}`,
          keys.publicKey,
          randomBytes(16).toString('base64url'),
        ],
      );
      await pool.query(
        `insert into push_delivery_log
           (user_id, event_type, event_key, status, payload)
         values ($1, 'daily.available', $2, 'queued', $3::jsonb)`,
        [
          user.id,
          `daily:2026-05-04:${index}`,
          JSON.stringify({
            title: 'Ежедневная игра доступна',
            body: 'Новый игровой день уже открыт.',
            url: '/?view=hub',
          }),
        ],
      );
    }

    let active = 0;
    let maxActive = 0;
    const fetchMock = vi.fn(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await wait(15);
      active -= 1;
      return new Response('', { status: 201 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await processPushDeliveryQueue(pool, {
      ...vapid,
      batchSize: 4,
      concurrency: 2,
    });

    expect(result).toMatchObject({
      enabled: true,
      claimed: 4,
      sent: 4,
      failed: 0,
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it('cleans up old finalized deliveries but keeps active queue rows', async () => {
    const user = await pool.query<{ id: string }>(
      `insert into users (id, display_name, timezone)
       values (gen_random_uuid(), 'Cleanup player', 'UTC')
       returning id`,
    );
    const userId = user.rows[0]!.id;
    await pool.query(
      `insert into push_delivery_log
         (user_id, event_type, event_key, status, payload, created_at, updated_at)
       values
         ($1, 'daily.available', 'old-sent', 'sent', '{}'::jsonb, now() - interval '120 days', now() - interval '120 days'),
         ($1, 'daily.available', 'old-failed', 'failed', '{}'::jsonb, now() - interval '120 days', now() - interval '120 days'),
         ($1, 'daily.available', 'old-queued', 'queued', '{}'::jsonb, now() - interval '120 days', now() - interval '120 days'),
         ($1, 'daily.available', 'fresh-sent', 'sent', '{}'::jsonb, now(), now())`,
      [userId],
    );

    const deleted = await cleanupPushDeliveryLog(pool, { retentionDays: 90 });
    expect(deleted).toBe(2);

    const remaining = await pool.query<{ event_key: string }>(
      `select event_key from push_delivery_log order by event_key`,
    );
    expect(remaining.rows.map((row) => row.event_key)).toEqual(['fresh-sent', 'old-queued']);
  });
});
