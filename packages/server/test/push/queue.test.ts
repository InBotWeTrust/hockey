import { createECDH, randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyMigrations } from '../../src/db/migrations.js';
import { cleanupPushDeliveryLog, processPushDeliveryQueue } from '../../src/push/queue.js';
import type { FcmSendResult } from '../../src/push/fcm.js';
import type { ResolvedPushVapidOptions } from '../../src/push/service.js';
import {
  createTestPool,
  getTestUrls,
  hasIntegrationEnv,
  resetDatabase,
} from '../helpers/testDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');
const sendFcmMock = vi.hoisted(() => vi.fn());

vi.mock('../../src/push/fcm.js', () => ({ sendFcm: sendFcmMock }));

const fcmOptions = {
  projectId: 'ultimate-hockey',
  clientEmail: 'sender@example.test',
  privateKey: 'private-key',
};

function fcmResult(overrides: Partial<FcmSendResult> = {}): FcmSendResult {
  return {
    ok: true,
    invalid: false,
    retryable: false,
    status: 200,
    diagnostic: 'sent',
    ...overrides,
  };
}

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
    sendFcmMock.mockReset();
    sendFcmMock.mockResolvedValue(fcmResult());
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

  it('delivers through FCM when Web Push is not configured', async () => {
    const user = await pool.query<{ id: string }>(
      `insert into users (id, display_name, timezone)
       values (gen_random_uuid(), 'Android player', 'UTC') returning id`,
    );
    const userId = user.rows[0]!.id;
    await pool.query(
      `insert into android_push_installations
         (user_id, installation_id, fcm_token, platform, app_version_code)
       values ($1, gen_random_uuid(), 'android-token', 'android', 1)`,
      [userId],
    );
    await pool.query(
      `insert into push_delivery_log (user_id, event_type, event_key, status, payload)
       values ($1, 'daily.available', 'fcm-only', 'queued', $2::jsonb)`,
      [userId, JSON.stringify({ title: 'Игра', body: 'Пора на лёд', url: '/?view=daily' })],
    );

    const result = await processPushDeliveryQueue(pool, { fcm: fcmOptions });
    expect(result).toMatchObject({ enabled: true, claimed: 1, sent: 1, failed: 0 });
    expect(sendFcmMock).toHaveBeenCalledWith(
      'android-token',
      fcmOptions,
      expect.objectContaining({ deliveryId: expect.any(String), url: '/?view=daily' }),
    );
    const delivery = await pool.query<{
      status: string;
      subscription_count: number;
      sent_count: number;
      web_subscription_count: number;
      web_sent_count: number;
      fcm_installation_count: number;
      fcm_sent_count: number;
    }>(
      `select status, subscription_count, sent_count,
              web_subscription_count, web_sent_count,
              fcm_installation_count, fcm_sent_count
         from push_delivery_log where event_key = 'fcm-only'`,
    );
    expect(delivery.rows[0]).toEqual({
      status: 'sent',
      subscription_count: 1,
      sent_count: 1,
      web_subscription_count: 0,
      web_sent_count: 0,
      fcm_installation_count: 1,
      fcm_sent_count: 1,
    });
  });

  it('marks a mixed delivery partial when Web Push succeeds and FCM fails permanently', async () => {
    const user = await pool.query<{ id: string }>(
      `insert into users (id, display_name, timezone)
       values (gen_random_uuid(), 'Mixed player', 'UTC') returning id`,
    );
    const userId = user.rows[0]!.id;
    const keys = createP256KeyPair();
    await pool.query(
      `insert into push_subscriptions (user_id, endpoint, p256dh, auth)
       values ($1, 'https://push.example.test/send/mixed', $2, $3)`,
      [userId, keys.publicKey, randomBytes(16).toString('base64url')],
    );
    await pool.query(
      `insert into android_push_installations
         (user_id, installation_id, fcm_token, platform, app_version_code)
       values ($1, gen_random_uuid(), 'permanent-token', 'android', 1)`,
      [userId],
    );
    await pool.query(
      `insert into push_delivery_log (user_id, event_type, event_key, status, payload)
       values ($1, 'daily.available', 'mixed', 'queued', $2::jsonb)`,
      [userId, JSON.stringify({ title: 'Игра', body: 'Пора', url: '/' })],
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 201 })),
    );
    sendFcmMock.mockResolvedValue(
      fcmResult({
        ok: false,
        status: 400,
        diagnostic: 'HTTP 400: INVALID_ARGUMENT',
      }),
    );

    const result = await processPushDeliveryQueue(pool, { ...vapid, fcm: fcmOptions });
    expect(result).toMatchObject({ sent: 1, failed: 1, retried: 0 });
    const delivery = await pool.query<{
      status: string;
      web_sent_count: number;
      fcm_sent_count: number;
    }>(
      `select status, web_sent_count, fcm_sent_count
         from push_delivery_log where event_key = 'mixed'`,
    );
    expect(delivery.rows[0]).toEqual({ status: 'partial', web_sent_count: 1, fcm_sent_count: 0 });
  });

  it('disables an invalid FCM token without retrying the delivery', async () => {
    const user = await pool.query<{ id: string }>(
      `insert into users (id, display_name, timezone)
       values (gen_random_uuid(), 'Invalid token player', 'UTC') returning id`,
    );
    const userId = user.rows[0]!.id;
    await pool.query(
      `insert into android_push_installations
         (user_id, installation_id, fcm_token, platform, app_version_code)
       values ($1, gen_random_uuid(), 'invalid-token', 'android', 1)`,
      [userId],
    );
    await pool.query(
      `insert into push_delivery_log (user_id, event_type, event_key, status, payload)
       values ($1, 'daily.available', 'invalid-token', 'queued', $2::jsonb)`,
      [userId, JSON.stringify({ title: 'Игра', body: 'Пора', url: '/' })],
    );
    sendFcmMock.mockResolvedValue(
      fcmResult({
        ok: false,
        invalid: true,
        status: 404,
        diagnostic: 'HTTP 404: UNREGISTERED',
      }),
    );

    const result = await processPushDeliveryQueue(pool, { fcm: fcmOptions });
    expect(result).toMatchObject({ sent: 0, failed: 1, retried: 0 });
    const installation = await pool.query<{ disabled: boolean }>(
      `select disabled_at is not null as disabled
         from android_push_installations where fcm_token = 'invalid-token'`,
    );
    expect(installation.rows[0]?.disabled).toBe(true);
  });

  it('retries only when every transport fails and a failure is retryable', async () => {
    const user = await pool.query<{ id: string }>(
      `insert into users (id, display_name, timezone)
       values (gen_random_uuid(), 'Retry player', 'UTC') returning id`,
    );
    const userId = user.rows[0]!.id;
    await pool.query(
      `insert into android_push_installations
         (user_id, installation_id, fcm_token, platform, app_version_code)
       values ($1, gen_random_uuid(), 'retry-token', 'android', 1)`,
      [userId],
    );
    await pool.query(
      `insert into push_delivery_log (user_id, event_type, event_key, status, payload)
       values ($1, 'daily.available', 'retry-fcm', 'queued', $2::jsonb)`,
      [userId, JSON.stringify({ title: 'Игра', body: 'Пора', url: '/' })],
    );
    sendFcmMock.mockResolvedValue(
      fcmResult({
        ok: false,
        retryable: true,
        status: 503,
        diagnostic: 'HTTP 503: UNAVAILABLE',
      }),
    );

    const result = await processPushDeliveryQueue(pool, { fcm: fcmOptions });
    expect(result).toMatchObject({ sent: 0, failed: 0, retried: 1 });
    const delivery = await pool.query<{ status: string }>(
      `select status from push_delivery_log where event_key = 'retry-fcm'`,
    );
    expect(delivery.rows[0]?.status).toBe('queued');
  });

  it('stays disabled only when neither delivery transport is configured', async () => {
    await expect(processPushDeliveryQueue(pool, {})).resolves.toMatchObject({ enabled: false });
    await expect(processPushDeliveryQueue(pool, { fcm: fcmOptions })).resolves.toMatchObject({
      enabled: true,
      claimed: 0,
    });
  });
});
