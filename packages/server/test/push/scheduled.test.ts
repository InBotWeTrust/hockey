import { createECDH, randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyMigrations } from '../../src/db/migrations.js';
import {
  PUSH_SCHEDULER_LOCK_KEY,
  PUSH_SCHEDULER_LOCK_NAMESPACE,
  runScheduledPushes,
} from '../../src/push/scheduled.js';
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

async function createUser(pool: ReturnType<typeof createTestPool>, name: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into users (id, display_name, timezone)
     values (gen_random_uuid(), $1, 'Europe/Moscow')
     returning id`,
    [name],
  );
  return rows[0]!.id;
}

async function addSubscription(
  pool: ReturnType<typeof createTestPool>,
  userId: string,
  endpoint: string,
): Promise<void> {
  const keys = createP256KeyPair();
  await pool.query(
    `insert into push_subscriptions (user_id, endpoint, p256dh, auth)
     values ($1, $2, $3, $4)`,
    [userId, endpoint, keys.publicKey, randomBytes(16).toString('base64url')],
  );
}

async function addTrainingShot(
  pool: ReturnType<typeof createTestPool>,
  userId: string,
  createdAt: Date,
): Promise<void> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into training_session
       (user_id, day_date, selected_period, state, game_core_version,
        training_seed, started_at)
     values ($1, '2026-05-04'::date, 1, 'active', 1, 'training-seed', $2)
     returning id`,
    [userId, createdAt],
  );
  await pool.query(
    `insert into shot_session
       (user_id, mode, training_session_id, period_number, shot_index, seed,
        input_payload, server_result, game_core_version, created_at)
     values ($1, 'training', $2, 1, 1, 'shot-seed', '{}'::jsonb, 'goal', 1, $3)`,
    [userId, rows[0]!.id, createdAt],
  );
}

describe.skipIf(!hasIntegrationEnv)('scheduled push delivery', () => {
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

  it('sends daily available once at the configured local morning hour', async () => {
    const userId = await createUser(pool, 'Daily player');
    await pool.query(
      `insert into user_push_preferences (user_id, training_available)
       values ($1, false)`,
      [userId],
    );
    await addSubscription(pool, userId, 'https://push.example.test/send/daily');
    const fetchMock = vi.fn(async () => new Response('', { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    const first = await runScheduledPushes(pool, {
      ...vapid,
      now: new Date('2026-05-04T06:15:00.000Z'),
    });
    const second = await runScheduledPushes(pool, {
      ...vapid,
      now: new Date('2026-05-04T06:16:00.000Z'),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first.events.find((event) => event.eventType === 'daily.available')).toMatchObject({
      targets: 1,
      claimed: 1,
      sent: 1,
      failed: 0,
    });
    expect(second.events.find((event) => event.eventType === 'daily.available')).toMatchObject({
      targets: 0,
      claimed: 0,
      skipped: 0,
    });

    const deliveries = await pool.query<{ event_type: string; event_key: string; status: string }>(
      `select event_type, event_key, status
         from push_delivery_log
        order by event_type`,
    );
    expect(deliveries.rows).toEqual([
      { event_type: 'daily.available', event_key: 'daily:2026-05-04', status: 'sent' },
    ]);
  });

  it('skips scheduling when another worker holds the scheduler advisory lock', async () => {
    const userId = await createUser(pool, 'Locked scheduler player');
    await pool.query(
      `insert into user_push_preferences (user_id, training_available)
       values ($1, false)`,
      [userId],
    );
    await addSubscription(pool, userId, 'https://push.example.test/send/locked');
    const fetchMock = vi.fn(async () => new Response('', { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query('select pg_advisory_xact_lock($1::int, $2::int)', [
        PUSH_SCHEDULER_LOCK_NAMESPACE,
        PUSH_SCHEDULER_LOCK_KEY,
      ]);

      const locked = await runScheduledPushes(pool, {
        ...vapid,
        now: new Date('2026-05-04T06:15:00.000Z'),
      });

      expect(locked.events).toEqual([]);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      await client.query('rollback').catch(() => undefined);
      client.release();
    }

    const unlocked = await runScheduledPushes(pool, {
      ...vapid,
      now: new Date('2026-05-04T06:16:00.000Z'),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(unlocked.events.find((event) => event.eventType === 'daily.available')).toMatchObject({
      targets: 1,
      claimed: 1,
      sent: 1,
      failed: 0,
    });
  });

  it('sends daily unlock after the training cooldown expires', async () => {
    await pool.query(
      `insert into game_settings (key, value, label, description)
       values (
         'training.daily_cooldown_minutes',
         to_jsonb(30),
         'Блокировка дневной игры',
         'test'
       )
       on conflict (key) do update set value = excluded.value`,
    );

    const userId = await createUser(pool, 'Training cooldown player');
    await pool.query(
      `insert into user_push_preferences (user_id, training_available)
       values ($1, false)`,
      [userId],
    );
    await addSubscription(pool, userId, 'https://push.example.test/send/daily-unlock');
    await addTrainingShot(pool, userId, new Date('2026-05-04T04:30:00.000Z'));
    const fetchMock = vi.fn(async () => new Response('', { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await runScheduledPushes(pool, {
      ...vapid,
      now: new Date('2026-05-04T05:00:00.000Z'),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      result.events.find((event) => event.eventType === 'daily.unlocked_after_training'),
    ).toMatchObject({
      targets: 1,
      claimed: 1,
      sent: 1,
      failed: 0,
    });

    const deliveries = await pool.query<{ event_type: string; event_key: string; status: string }>(
      `select event_type, event_key, status
         from push_delivery_log`,
    );
    expect(deliveries.rows[0]).toMatchObject({
      event_type: 'daily.unlocked_after_training',
      status: 'sent',
    });
    expect(deliveries.rows[0]?.event_key).toMatch(
      /^daily-training-unlock:2026-05-04:/,
    );
  });

  it('sends active-period warning and break-finished pushes', async () => {
    const periodUserId = await createUser(pool, 'Period player');
    const breakUserId = await createUser(pool, 'Break player');
    await pool.query(
      `insert into user_push_preferences (user_id, training_available)
       values ($1, false), ($2, false)`,
      [periodUserId, breakUserId],
    );
    await addSubscription(pool, periodUserId, 'https://push.example.test/send/period');
    await addSubscription(pool, breakUserId, 'https://push.example.test/send/break');

    await pool.query(
      `insert into day_pool
         (user_id, day_date, state, current_period, period_started_at,
          game_core_version, daily_seed)
       values
         ($1, '2026-05-04'::date, 'period_active', 1, $3, 1, 'seed-period'),
         ($2, '2026-05-04'::date, 'break_active', 1, null, 1, 'seed-break')`,
      [
        periodUserId,
        breakUserId,
        new Date('2026-05-04T05:00:00.000Z'),
      ],
    );
    await pool.query(
      `update day_pool
          set break_started_at = $2
        where user_id = $1`,
      [breakUserId, new Date('2026-05-04T05:00:00.000Z')],
    );

    const fetchMock = vi.fn(async () => new Response('', { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await runScheduledPushes(pool, {
      ...vapid,
      now: new Date('2026-05-04T05:15:00.000Z'),
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.events.find((event) => event.eventType === 'daily.period_ending')).toMatchObject(
      {
        targets: 1,
        claimed: 1,
        sent: 1,
        failed: 0,
      },
    );
    expect(result.events.find((event) => event.eventType === 'daily.break_finished')).toMatchObject(
      {
        targets: 1,
        claimed: 1,
        sent: 1,
        failed: 0,
      },
    );

    const deliveries = await pool.query<{ event_type: string; status: string }>(
      `select event_type, status
         from push_delivery_log
        order by event_type`,
    );
    expect(deliveries.rows).toEqual([
      { event_type: 'daily.break_finished', status: 'sent' },
      { event_type: 'daily.period_ending', status: 'sent' },
    ]);
  });
});
