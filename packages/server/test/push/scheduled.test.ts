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
import { rescheduleTournamentFixture } from '../../src/tournament/service.js';
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

async function createScheduledTournamentFixture(
  pool: ReturnType<typeof createTestPool>,
  input: {
    adminId: string;
    slug: string;
    rulesSnapshot: Record<string, unknown>;
    participants: Array<{ userId: string; state: string }>;
    scheduledStartsAt: Date;
    windowEndsAt: Date;
  },
): Promise<{ tournamentId: string; fixtureId: string }> {
  const tournament = await pool.query<{ id: string }>(
    `insert into tournament
       (slug, title, status, regular_source, current_revision, created_by)
     values ($1, $2, 'regular', 'head_to_head', 1, $3)
     returning id`,
    [input.slug, input.slug, input.adminId],
  );
  const tournamentId = tournament.rows[0]!.id;
  const revision = await pool.query<{ id: string }>(
    `insert into tournament_revision
       (tournament_id, revision, rules_snapshot, is_published, created_by, published_at)
     values ($1, 1, $2, true, $3, now())
     returning id`,
    [tournamentId, JSON.stringify(input.rulesSnapshot), input.adminId],
  );
  await pool.query(`update tournament set published_revision_id = $2 where id = $1`, [
    tournamentId,
    revision.rows[0]!.id,
  ]);

  const participantIds: string[] = [];
  for (const participantInput of input.participants) {
    const participant = await pool.query<{ id: string }>(
      `insert into tournament_participant (tournament_id, user_id, state)
       values ($1, $2, $3)
       returning id`,
      [tournamentId, participantInput.userId, participantInput.state],
    );
    participantIds.push(participant.rows[0]!.id);
  }
  const round = await pool.query<{ id: string }>(
    `insert into tournament_round (tournament_id, stage, number)
     values ($1, 'regular', 1)
     returning id`,
    [tournamentId],
  );
  const fixture = await pool.query<{ id: string }>(
    `insert into tournament_fixture
       (tournament_id, round_id, fixture_number, home_participant_id, away_participant_id,
        scheduled_starts_at, window_ends_at, status)
     values ($1, $2, 1, $3, $4, $5, $6, 'scheduled')
     returning id`,
    [
      tournamentId,
      round.rows[0]!.id,
      participantIds[0]!,
      participantIds[1] ?? null,
      input.scheduledStartsAt,
      input.windowEndsAt,
    ],
  );
  return { tournamentId, fixtureId: fixture.rows[0]!.id };
}

describe.skipIf(!hasIntegrationEnv)('scheduled push delivery', () => {
  let pool: ReturnType<typeof createTestPool>;
  let vapid: ResolvedPushVapidOptions;

  beforeEach(async () => {
    getTestUrls();
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);
    await pool.query(
      `update game_settings
          set value = 'true'::jsonb
        where key = 'tournaments.enabled'`,
    );
    vapid = {
      ...createP256KeyPair(),
      subject: 'mailto:test@example.com',
    };
  });

  afterEach(async () => {
    try {
      await pool.query(
        `insert into game_settings (key, value, label, description)
         values ('tournaments.enabled', 'false'::jsonb, 'Турниры включены', 'test cleanup')
         on conflict (key) do update set value = excluded.value`,
      );
    } finally {
      try {
        vi.unstubAllGlobals();
      } finally {
        await pool.end();
      }
    }
  });

  it('enqueues each valid reminder offset only for active opted-in participants', async () => {
    const adminId = await createUser(pool, 'Reminder scheduler admin');
    const activeUserId = await createUser(pool, 'Active reminder player');
    const withdrawnUserId = await createUser(pool, 'Withdrawn reminder player');
    const optedOutUserId = await createUser(pool, 'Opted out reminder player');
    await pool.query(
      `insert into user_push_preferences
         (user_id, daily_game, training_available, tournament_events)
       values
         ($1, false, false, true),
         ($2, false, false, true),
         ($3, false, false, false)`,
      [activeUserId, withdrawnUserId, optedOutUserId],
    );
    await addSubscription(pool, activeUserId, 'https://push.example.test/send/reminder-active');
    await addSubscription(
      pool,
      withdrawnUserId,
      'https://push.example.test/send/reminder-withdrawn',
    );
    await addSubscription(
      pool,
      optedOutUserId,
      'https://push.example.test/send/reminder-opted-out',
    );
    const startsAt = new Date('2026-05-04T10:00:00.000Z');
    const windowEndsAt = new Date('2026-05-04T11:00:00.000Z');
    const activeFixture = await createScheduledTournamentFixture(pool, {
      adminId,
      slug: 'active-reminder-cup',
      rulesSnapshot: { notificationReminderOffsetsMs: [3_600_000, 1_800_000] },
      participants: [
        { userId: activeUserId, state: 'approved' },
        { userId: withdrawnUserId, state: 'withdrawn' },
      ],
      scheduledStartsAt: startsAt,
      windowEndsAt,
    });
    await createScheduledTournamentFixture(pool, {
      adminId,
      slug: 'opted-out-reminder-cup',
      rulesSnapshot: { notificationReminderOffsetsMs: [3_600_000, 1_800_000] },
      participants: [{ userId: optedOutUserId, state: 'approved' }],
      scheduledStartsAt: startsAt,
      windowEndsAt,
    });

    const first = await runScheduledPushes(pool, {
      ...vapid,
      now: new Date('2026-05-04T09:00:00.000Z'),
      processQueue: false,
    });
    const second = await runScheduledPushes(pool, {
      ...vapid,
      now: new Date('2026-05-04T09:30:00.000Z'),
      processQueue: false,
    });

    expect(first.events.find((event) => event.eventType === 'tournament.live_soon')).toMatchObject({
      targets: 1,
      claimed: 1,
      sent: 0,
      failed: 0,
    });
    expect(second.events.find((event) => event.eventType === 'tournament.live_soon')).toMatchObject(
      {
        targets: 1,
        claimed: 1,
        sent: 0,
        failed: 0,
      },
    );
    const deliveries = await pool.query<{ user_id: string; event_key: string }>(
      `select user_id::text, event_key
         from push_delivery_log
        where event_type = 'tournament.live_soon'
        order by event_key`,
    );
    expect(deliveries.rows).toHaveLength(2);
    expect(deliveries.rows.map((delivery) => delivery.user_id)).toEqual([
      activeUserId,
      activeUserId,
    ]);
    expect(deliveries.rows.map((delivery) => delivery.event_key)).toEqual([
      `${activeFixture.fixtureId}:live-soon:${startsAt.getTime()}:1800000`,
      `${activeFixture.fixtureId}:live-soon:${startsAt.getTime()}:3600000`,
    ]);
  });

  it('skips tournament reminders when disabled', async () => {
    const adminId = await createUser(pool, 'Disabled scheduler admin');
    const playerId = await createUser(pool, 'Disabled scheduler player');
    await pool.query(
      `insert into user_push_preferences
         (user_id, daily_game, training_available, tournament_events)
       values ($1, true, false, true)`,
      [playerId],
    );
    await addSubscription(pool, playerId, 'https://push.example.test/send/disabled-tournaments');
    await pool.query(
      `update game_settings
          set value = 'false'::jsonb
        where key = 'tournaments.enabled'`,
    );
    await createScheduledTournamentFixture(pool, {
      adminId,
      slug: 'disabled-live-soon-cup',
      rulesSnapshot: { notificationReminderOffsetsMs: [3_600_000] },
      participants: [{ userId: playerId, state: 'approved' }],
      scheduledStartsAt: new Date('2026-05-04T07:00:00.000Z'),
      windowEndsAt: new Date('2026-05-04T08:00:00.000Z'),
    });
    await createScheduledTournamentFixture(pool, {
      adminId,
      slug: 'disabled-window-cup',
      rulesSnapshot: { notificationReminderOffsetsMs: [] },
      participants: [{ userId: playerId, state: 'approved' }],
      scheduledStartsAt: new Date('2026-05-04T06:00:00.000Z'),
      windowEndsAt: new Date('2026-05-04T06:30:00.000Z'),
    });

    const result = await runScheduledPushes(pool, {
      ...vapid,
      now: new Date('2026-05-04T06:00:00.000Z'),
      processQueue: false,
    });

    expect(result.events.find((event) => event.eventType === 'daily.available')).toMatchObject({
      targets: 1,
      claimed: 1,
    });
    expect(result.events.filter((event) => event.eventType.startsWith('tournament.'))).toEqual([]);

    const deliveries = await pool.query<{ event_type: string }>(
      `select event_type
         from push_delivery_log
        where user_id = $1
        order by event_type`,
      [playerId],
    );
    expect(deliveries.rows).toEqual([{ event_type: 'daily.available' }]);
  });

  it('treats a malformed tournament flag as disabled without blocking daily scheduling', async () => {
    const adminId = await createUser(pool, 'Malformed scheduler admin');
    const playerId = await createUser(pool, 'Malformed scheduler player');
    await pool.query(
      `insert into user_push_preferences
         (user_id, daily_game, training_available, tournament_events)
       values ($1, true, false, true)`,
      [playerId],
    );
    await addSubscription(pool, playerId, 'https://push.example.test/send/malformed-tournaments');
    await pool.query(
      `update game_settings
          set value = '{}'::jsonb
        where key = 'tournaments.enabled'`,
    );
    await createScheduledTournamentFixture(pool, {
      adminId,
      slug: 'malformed-live-soon-cup',
      rulesSnapshot: { notificationReminderOffsetsMs: [3_600_000] },
      participants: [{ userId: playerId, state: 'approved' }],
      scheduledStartsAt: new Date('2026-05-04T07:00:00.000Z'),
      windowEndsAt: new Date('2026-05-04T08:00:00.000Z'),
    });
    await createScheduledTournamentFixture(pool, {
      adminId,
      slug: 'malformed-window-cup',
      rulesSnapshot: { notificationReminderOffsetsMs: [] },
      participants: [{ userId: playerId, state: 'approved' }],
      scheduledStartsAt: new Date('2026-05-04T06:00:00.000Z'),
      windowEndsAt: new Date('2026-05-04T06:30:00.000Z'),
    });

    const result = await runScheduledPushes(pool, {
      ...vapid,
      now: new Date('2026-05-04T06:00:00.000Z'),
      processQueue: false,
    });

    expect(result.events.find((event) => event.eventType === 'daily.available')).toMatchObject({
      targets: 1,
      claimed: 1,
    });
    expect(result.events.filter((event) => event.eventType.startsWith('tournament.'))).toEqual([]);

    const deliveries = await pool.query<{ event_type: string }>(
      `select event_type
         from push_delivery_log
        where user_id = $1
        order by event_type`,
      [playerId],
    );
    expect(deliveries.rows).toEqual([{ event_type: 'daily.available' }]);
  });

  it('renders the minutes template variable for a tournament live reminder', async () => {
    const adminId = await createUser(pool, 'Minutes template admin');
    const playerId = await createUser(pool, 'Minutes template player');
    await pool.query(
      `insert into user_push_preferences
         (user_id, daily_game, training_available, tournament_events)
       values ($1, false, false, true)`,
      [playerId],
    );
    await addSubscription(pool, playerId, 'https://push.example.test/send/reminder-minutes');
    await createScheduledTournamentFixture(pool, {
      adminId,
      slug: 'minutes-template-cup',
      rulesSnapshot: { notificationReminderOffsetsMs: [3_600_000] },
      participants: [{ userId: playerId, state: 'approved' }],
      scheduledStartsAt: new Date('2026-05-04T10:00:00.000Z'),
      windowEndsAt: new Date('2026-05-04T11:00:00.000Z'),
    });

    await runScheduledPushes(pool, {
      ...vapid,
      now: new Date('2026-05-04T09:00:00.000Z'),
      processQueue: false,
    });

    const delivery = await pool.query<{ body: string }>(
      `select payload->>'body' as body
         from push_delivery_log
        where event_type = 'tournament.live_soon'`,
    );
    expect(delivery.rows).toEqual([{ body: 'До согласованного старта осталось 60 мин.' }]);
  });

  it('ignores malformed notification rules without rolling back unrelated scheduled deliveries', async () => {
    const adminId = await createUser(pool, 'Malformed rules admin');
    const playerId = await createUser(pool, 'Malformed rules player');
    await pool.query(
      `insert into user_push_preferences
         (user_id, daily_game, training_available, tournament_events)
       values ($1, true, false, true)`,
      [playerId],
    );
    await addSubscription(pool, playerId, 'https://push.example.test/send/malformed-rules');
    const lateStart = new Date('2026-05-04T07:00:00.000Z');
    const lateEnd = new Date('2026-05-04T08:00:00.000Z');
    const deadlineStart = new Date('2026-05-04T05:30:00.000Z');
    const deadlineEnd = new Date('2026-05-04T06:30:00.000Z');
    await createScheduledTournamentFixture(pool, {
      adminId,
      slug: 'mixed-reminder-rules-cup',
      rulesSnapshot: { notificationReminderOffsetsMs: [3_600_000, 'bad', 1.5, 86_400_001] },
      participants: [{ userId: playerId, state: 'approved' }],
      scheduledStartsAt: lateStart,
      windowEndsAt: lateEnd,
    });
    await createScheduledTournamentFixture(pool, {
      adminId,
      slug: 'scalar-reminder-rules-cup',
      rulesSnapshot: { notificationReminderOffsetsMs: 'not-an-array' },
      participants: [{ userId: playerId, state: 'approved' }],
      scheduledStartsAt: lateStart,
      windowEndsAt: lateEnd,
    });
    await createScheduledTournamentFixture(pool, {
      adminId,
      slug: 'fractional-deadline-rules-cup',
      rulesSnapshot: {
        notificationReminderOffsetsMs: [],
        notificationDeadlineLeadMs: 1.5,
      },
      participants: [{ userId: playerId, state: 'approved' }],
      scheduledStartsAt: deadlineStart,
      windowEndsAt: deadlineEnd,
    });
    await createScheduledTournamentFixture(pool, {
      adminId,
      slug: 'oversized-deadline-rules-cup',
      rulesSnapshot: {
        notificationReminderOffsetsMs: [],
        notificationDeadlineLeadMs: 86_400_001,
      },
      participants: [{ userId: playerId, state: 'approved' }],
      scheduledStartsAt: deadlineStart,
      windowEndsAt: deadlineEnd,
    });

    const result = await runScheduledPushes(pool, {
      ...vapid,
      now: new Date('2026-05-04T06:00:00.000Z'),
      processQueue: false,
    });

    expect(result.enabled).toBe(true);
    const deliveries = await pool.query<{ event_type: string; count: string }>(
      `select event_type, count(*)::text as count
         from push_delivery_log
        group by event_type
        order by event_type`,
    );
    expect(deliveries.rows).toEqual([
      { event_type: 'daily.available', count: '1' },
      { event_type: 'tournament.fixture_deadline', count: '2' },
      { event_type: 'tournament.live_soon', count: '2' },
    ]);
  });

  it('case-guards fractional and scientific notification numbers without rolling back daily delivery', async () => {
    const adminId = await createUser(pool, 'Case guard rules admin');
    const playerId = await createUser(pool, 'Case guard rules player');
    await pool.query(
      `insert into user_push_preferences
         (user_id, daily_game, training_available, tournament_events)
       values ($1, true, false, true)`,
      [playerId],
    );
    await addSubscription(pool, playerId, 'https://push.example.test/send/case-guard-rules');
    const scientific = 1e100;
    await createScheduledTournamentFixture(pool, {
      adminId,
      slug: 'case-guard-live-rules-cup',
      rulesSnapshot: { notificationReminderOffsetsMs: [3_600_000, 0.5, scientific] },
      participants: [{ userId: playerId, state: 'approved' }],
      scheduledStartsAt: new Date('2026-05-04T07:00:00.000Z'),
      windowEndsAt: new Date('2026-05-04T08:00:00.000Z'),
    });
    await createScheduledTournamentFixture(pool, {
      adminId,
      slug: 'case-guard-fractional-deadline-cup',
      rulesSnapshot: {
        notificationReminderOffsetsMs: [],
        notificationDeadlineLeadMs: 0.5,
      },
      participants: [{ userId: playerId, state: 'approved' }],
      scheduledStartsAt: new Date('2026-05-04T05:30:00.000Z'),
      windowEndsAt: new Date('2026-05-04T06:30:00.000Z'),
    });
    await createScheduledTournamentFixture(pool, {
      adminId,
      slug: 'case-guard-scientific-deadline-cup',
      rulesSnapshot: {
        notificationReminderOffsetsMs: [],
        notificationDeadlineLeadMs: scientific,
      },
      participants: [{ userId: playerId, state: 'approved' }],
      scheduledStartsAt: new Date('2026-05-04T05:30:00.000Z'),
      windowEndsAt: new Date('2026-05-04T06:30:00.000Z'),
    });

    const result = await runScheduledPushes(pool, {
      ...vapid,
      now: new Date('2026-05-04T06:00:00.000Z'),
      processQueue: false,
    });

    expect(result.enabled).toBe(true);
    const deliveries = await pool.query<{ event_type: string; count: string }>(
      `select event_type, count(*)::text as count
         from push_delivery_log
        group by event_type
        order by event_type`,
    );
    expect(deliveries.rows).toEqual([
      { event_type: 'daily.available', count: '1' },
      { event_type: 'tournament.fixture_deadline', count: '2' },
      { event_type: 'tournament.live_soon', count: '1' },
    ]);
  });

  it('uses distinct but tick-deduplicated event keys for each rescheduled fixture window', async () => {
    const adminId = await createUser(pool, 'Reschedule scheduler admin');
    const playerId = await createUser(pool, 'Reschedule scheduler player');
    await pool.query(
      `insert into user_push_preferences
         (user_id, daily_game, training_available, tournament_events)
       values ($1, false, false, true)`,
      [playerId],
    );
    await addSubscription(pool, playerId, 'https://push.example.test/send/rescheduled-window');
    const firstStartsAt = new Date('2026-05-04T10:00:00.000Z');
    const firstEndsAt = new Date('2026-05-04T11:00:00.000Z');
    const fixture = await createScheduledTournamentFixture(pool, {
      adminId,
      slug: 'rescheduled-window-cup',
      rulesSnapshot: { notificationReminderOffsetsMs: [3_600_000] },
      participants: [{ userId: playerId, state: 'approved' }],
      scheduledStartsAt: firstStartsAt,
      windowEndsAt: firstEndsAt,
    });

    const firstLive = await runScheduledPushes(pool, {
      ...vapid,
      now: new Date('2026-05-04T09:00:00.000Z'),
      processQueue: false,
    });
    const firstLiveAgain = await runScheduledPushes(pool, {
      ...vapid,
      now: new Date('2026-05-04T09:01:00.000Z'),
      processQueue: false,
    });
    const firstOpened = await runScheduledPushes(pool, {
      ...vapid,
      now: new Date('2026-05-04T10:00:00.000Z'),
      processQueue: false,
    });
    const firstOpenedAgain = await runScheduledPushes(pool, {
      ...vapid,
      now: new Date('2026-05-04T10:01:00.000Z'),
      processQueue: false,
    });
    const firstDeadline = await runScheduledPushes(pool, {
      ...vapid,
      now: new Date('2026-05-04T10:30:00.000Z'),
      processQueue: false,
    });
    const firstDeadlineAgain = await runScheduledPushes(pool, {
      ...vapid,
      now: new Date('2026-05-04T10:31:00.000Z'),
      processQueue: false,
    });

    const secondStartsAt = new Date('2026-05-04T12:00:00.000Z');
    const secondEndsAt = new Date('2026-05-04T13:00:00.000Z');
    await rescheduleTournamentFixture(pool, {
      tournamentId: fixture.tournamentId,
      fixtureId: fixture.fixtureId,
      startsAt: secondStartsAt,
      endsAt: secondEndsAt,
      reason: 'test reschedule',
      adminUserId: adminId,
    });

    const secondLive = await runScheduledPushes(pool, {
      ...vapid,
      now: new Date('2026-05-04T11:00:00.000Z'),
      processQueue: false,
    });
    const secondLiveAgain = await runScheduledPushes(pool, {
      ...vapid,
      now: new Date('2026-05-04T11:01:00.000Z'),
      processQueue: false,
    });
    const secondOpened = await runScheduledPushes(pool, {
      ...vapid,
      now: new Date('2026-05-04T12:00:00.000Z'),
      processQueue: false,
    });
    const secondOpenedAgain = await runScheduledPushes(pool, {
      ...vapid,
      now: new Date('2026-05-04T12:01:00.000Z'),
      processQueue: false,
    });
    const secondDeadline = await runScheduledPushes(pool, {
      ...vapid,
      now: new Date('2026-05-04T12:30:00.000Z'),
      processQueue: false,
    });
    const secondDeadlineAgain = await runScheduledPushes(pool, {
      ...vapid,
      now: new Date('2026-05-04T12:31:00.000Z'),
      processQueue: false,
    });

    for (const [result, eventType] of [
      [firstLive, 'tournament.live_soon'],
      [firstOpened, 'tournament.fixture_opened'],
      [firstDeadline, 'tournament.fixture_deadline'],
      [secondLive, 'tournament.live_soon'],
      [secondOpened, 'tournament.fixture_opened'],
      [secondDeadline, 'tournament.fixture_deadline'],
    ] as const) {
      expect(result.events.find((event) => event.eventType === eventType)).toMatchObject({
        targets: 1,
        claimed: 1,
      });
    }
    for (const [result, eventType] of [
      [firstLiveAgain, 'tournament.live_soon'],
      [firstOpenedAgain, 'tournament.fixture_opened'],
      [firstDeadlineAgain, 'tournament.fixture_deadline'],
      [secondLiveAgain, 'tournament.live_soon'],
      [secondOpenedAgain, 'tournament.fixture_opened'],
      [secondDeadlineAgain, 'tournament.fixture_deadline'],
    ] as const) {
      expect(result.events.find((event) => event.eventType === eventType)).toMatchObject({
        targets: 0,
        claimed: 0,
      });
    }

    const deliveries = await pool.query<{ event_type: string; event_key: string }>(
      `select event_type, event_key
         from push_delivery_log
        where user_id = $1
        order by event_type, event_key`,
      [playerId],
    );
    expect(deliveries.rows).toEqual([
      {
        event_type: 'tournament.fixture_deadline',
        event_key: `${fixture.fixtureId}:deadline:${firstEndsAt.getTime()}:1800000`,
      },
      {
        event_type: 'tournament.fixture_deadline',
        event_key: `${fixture.fixtureId}:deadline:${secondEndsAt.getTime()}:1800000`,
      },
      {
        event_type: 'tournament.fixture_opened',
        event_key: `${fixture.fixtureId}:opened:${firstStartsAt.getTime()}`,
      },
      {
        event_type: 'tournament.fixture_opened',
        event_key: `${fixture.fixtureId}:opened:${secondStartsAt.getTime()}`,
      },
      {
        event_type: 'tournament.live_soon',
        event_key: `${fixture.fixtureId}:live-soon:${firstStartsAt.getTime()}:3600000`,
      },
      {
        event_type: 'tournament.live_soon',
        event_key: `${fixture.fixtureId}:live-soon:${secondStartsAt.getTime()}:3600000`,
      },
    ]);
  });

  it('does not enqueue fixture-opened or deadline pushes after the fixture window closes', async () => {
    const adminId = await createUser(pool, 'Closed window admin');
    const playerId = await createUser(pool, 'Closed window player');
    await pool.query(
      `insert into user_push_preferences
         (user_id, daily_game, training_available, tournament_events)
       values ($1, false, false, true)`,
      [playerId],
    );
    await addSubscription(pool, playerId, 'https://push.example.test/send/closed-window');
    await createScheduledTournamentFixture(pool, {
      adminId,
      slug: 'closed-window-cup',
      rulesSnapshot: {
        notificationReminderOffsetsMs: [],
        notificationDeadlineLeadMs: 0,
      },
      participants: [{ userId: playerId, state: 'approved' }],
      scheduledStartsAt: new Date('2026-05-04T10:00:00.000Z'),
      windowEndsAt: new Date('2026-05-04T10:15:00.000Z'),
    });

    const result = await runScheduledPushes(pool, {
      ...vapid,
      now: new Date('2026-05-04T10:16:00.000Z'),
      processQueue: false,
    });

    expect(
      result.events.find((event) => event.eventType === 'tournament.fixture_opened'),
    ).toMatchObject({
      targets: 0,
      claimed: 0,
    });
    expect(
      result.events.find((event) => event.eventType === 'tournament.fixture_deadline'),
    ).toMatchObject({
      targets: 0,
      claimed: 0,
    });
    const deliveries = await pool.query<{ count: string }>(
      `select count(*)::text as count
         from push_delivery_log
        where event_type in ('tournament.fixture_opened', 'tournament.fixture_deadline')`,
    );
    expect(deliveries.rows).toEqual([{ count: '0' }]);
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
    expect(deliveries.rows[0]?.event_key).toMatch(/^daily-training-unlock:2026-05-04:/);
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
      [periodUserId, breakUserId, new Date('2026-05-04T05:00:00.000Z')],
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
    expect(result.events.find((event) => event.eventType === 'daily.period_ending')).toMatchObject({
      targets: 1,
      claimed: 1,
      sent: 1,
      failed: 0,
    });
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
        JSON.stringify({
          notificationReminderOffsetsMs: [3_600_000],
          notificationOverrides: {
            'tournament.live_soon': {
              title: 'Override {{tournamentTitle}}',
              body: 'Осталось {{minutes}} минут',
              url: '/?view=amateur&section=tournaments',
            },
          },
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
    expect(second.events.find((event) => event.eventType === 'tournament.live_soon')).toMatchObject(
      {
        targets: 0,
        claimed: 0,
      },
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const delivery = await pool.query<{ title: string; body: string; url: string }>(
      `select payload->>'title' as title, payload->>'body' as body, payload->>'url' as url
         from push_delivery_log
        where event_type = 'tournament.live_soon'`,
    );
    expect(delivery.rows).toEqual([
      {
        title: 'Override Scheduler Cup',
        body: 'Осталось 60 минут',
        url: '/?view=amateur&section=tournaments',
      },
    ]);
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

    expect(
      opened.events.find((event) => event.eventType === 'tournament.fixture_opened'),
    ).toMatchObject({
      targets: 1,
      claimed: 1,
      sent: 1,
    });
    expect(
      openedAgain.events.find((event) => event.eventType === 'tournament.fixture_opened'),
    ).toMatchObject({
      targets: 0,
      claimed: 0,
    });
    expect(
      deadline.events.find((event) => event.eventType === 'tournament.fixture_deadline'),
    ).toMatchObject({
      targets: 1,
      claimed: 1,
      sent: 1,
    });
    expect(
      deadlineAgain.events.find((event) => event.eventType === 'tournament.fixture_deadline'),
    ).toMatchObject({
      targets: 0,
      claimed: 0,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
