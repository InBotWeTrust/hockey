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

  it('sends each configured tournament live reminder exactly once', async () => {
    const adminId = await createUser(pool, 'Tournament scheduler admin');
    const playerId = await createUser(pool, 'Tournament scheduler player');
    await pool.query(
      `insert into user_push_preferences
         (user_id, daily_game, training_available, tournament_events)
       values ($1, false, false, true)`,
      [playerId],
    );
    await addSubscription(pool, playerId, 'https://push.example.test/send/tournament-live');
    const tournament = await pool.query<{ id: string }>(
      `insert into tournament
         (slug, title, status, regular_source, current_revision, created_by)
       values ('scheduler-cup', 'Scheduler Cup', 'regular', 'head_to_head', 1, $1)
       returning id`,
      [adminId],
    );
    const tournamentId = tournament.rows[0]!.id;
    const revision = await pool.query<{ id: string }>(
      `insert into tournament_revision
         (tournament_id, revision, rules_snapshot, is_published, created_by, published_at)
       values ($1, 1, $2, true, $3, now()) returning id`,
      [
        tournamentId,
        JSON.stringify({ notificationReminderOffsetsMs: [3_600_000] }),
        adminId,
      ],
    );
    await pool.query(`update tournament set published_revision_id = $2 where id = $1`, [
      tournamentId,
      revision.rows[0]!.id,
    ]);
    const participant = await pool.query<{ id: string }>(
      `insert into tournament_participant (tournament_id, user_id, state)
       values ($1, $2, 'approved') returning id`,
      [tournamentId, playerId],
    );
    const round = await pool.query<{ id: string }>(
      `insert into tournament_round (tournament_id, stage, number)
       values ($1, 'regular', 1) returning id`,
      [tournamentId],
    );
    await pool.query(
      `insert into tournament_fixture
         (tournament_id, round_id, fixture_number, home_participant_id,
          scheduled_starts_at, window_ends_at, status)
       values ($1, $2, 1, $3, $4, $5, 'scheduled')`,
      [
        tournamentId,
        round.rows[0]!.id,
        participant.rows[0]!.id,
        new Date('2026-05-04T10:00:00.000Z'),
        new Date('2026-05-04T11:00:00.000Z'),
      ],
    );
    const fetchMock = vi.fn(async () => new Response('', { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    const first = await runScheduledPushes(pool, {
      ...vapid,
      now: new Date('2026-05-04T09:00:00.000Z'),
    });
    const second = await runScheduledPushes(pool, {
      ...vapid,
      now: new Date('2026-05-04T09:01:00.000Z'),
    });

    expect(first.events.find((event) => event.eventType === 'tournament.live_soon')).toMatchObject({
      targets: 1,
      claimed: 1,
      sent: 1,
      failed: 0,
    });
    expect(second.events.find((event) => event.eventType === 'tournament.live_soon')).toMatchObject({
      targets: 0,
      claimed: 0,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends fixture-opened and deadline pushes once at their configured times', async () => {
    const adminId = await createUser(pool, 'Tournament window scheduler admin');
    const playerId = await createUser(pool, 'Tournament window scheduler player');
    await pool.query(
      `insert into user_push_preferences
         (user_id, daily_game, training_available, tournament_events)
       values ($1, false, false, true)`,
      [playerId],
    );
    await addSubscription(pool, playerId, 'https://push.example.test/send/tournament-window');
    const tournament = await pool.query<{ id: string }>(
      `insert into tournament
         (slug, title, status, regular_source, current_revision, created_by)
       values ('window-cup', 'Window Cup', 'regular', 'head_to_head', 1, $1)
       returning id`,
      [adminId],
    );
    const tournamentId = tournament.rows[0]!.id;
    const revision = await pool.query<{ id: string }>(
      `insert into tournament_revision
         (tournament_id, revision, rules_snapshot, is_published, created_by, published_at)
       values ($1, 1, $2, true, $3, now()) returning id`,
      [
        tournamentId,
        JSON.stringify({
          notificationReminderOffsetsMs: [],
          notificationDeadlineLeadMs: 30 * 60_000,
        }),
        adminId,
      ],
    );
    await pool.query(`update tournament set published_revision_id = $2 where id = $1`, [
      tournamentId,
      revision.rows[0]!.id,
    ]);
    const participant = await pool.query<{ id: string }>(
      `insert into tournament_participant (tournament_id, user_id, state)
       values ($1, $2, 'approved') returning id`,
      [tournamentId, playerId],
    );
    const round = await pool.query<{ id: string }>(
      `insert into tournament_round (tournament_id, stage, number)
       values ($1, 'regular', 1) returning id`,
      [tournamentId],
    );
    await pool.query(
      `insert into tournament_fixture
         (tournament_id, round_id, fixture_number, home_participant_id,
          scheduled_starts_at, window_ends_at, status)
       values ($1, $2, 1, $3, $4, $5, 'scheduled')`,
      [
        tournamentId,
        round.rows[0]!.id,
        participant.rows[0]!.id,
        new Date('2026-05-04T10:00:00.000Z'),
        new Date('2026-05-04T11:00:00.000Z'),
      ],
    );
    const fetchMock = vi.fn(async () => new Response('', { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    const opened = await runScheduledPushes(pool, {
      ...vapid,
      now: new Date('2026-05-04T10:00:00.000Z'),
    });
    const openedAgain = await runScheduledPushes(pool, {
      ...vapid,
      now: new Date('2026-05-04T10:01:00.000Z'),
    });
    const deadline = await runScheduledPushes(pool, {
      ...vapid,
      now: new Date('2026-05-04T10:30:00.000Z'),
    });
    const deadlineAgain = await runScheduledPushes(pool, {
      ...vapid,
      now: new Date('2026-05-04T10:31:00.000Z'),
    });

    expect(opened.events.find((event) => event.eventType === 'tournament.fixture_opened')).toMatchObject({
      targets: 1,
      claimed: 1,
      sent: 1,
    });
    expect(openedAgain.events.find((event) => event.eventType === 'tournament.fixture_opened')).toMatchObject({
      targets: 0,
      claimed: 0,
    });
    expect(deadline.events.find((event) => event.eventType === 'tournament.fixture_deadline')).toMatchObject({
      targets: 1,
      claimed: 1,
      sent: 1,
    });
    expect(deadlineAgain.events.find((event) => event.eventType === 'tournament.fixture_deadline')).toMatchObject({
      targets: 0,
      claimed: 0,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
