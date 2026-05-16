import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { buildApp } from '../../src/app.js';
import { createJwt } from '../../src/auth/jwt.js';
import { findOrCreateTelegramUser } from '../../src/auth/users.js';
import { applyMigrations } from '../../src/db/migrations.js';
import {
  createTestPool,
  createTestRedis,
  getTestUrls,
  hasIntegrationEnv,
  resetDatabase,
  resetRedis,
} from '../helpers/testDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

const JWT_SECRET = 'access-secret-at-least-16-chars';
const REFRESH_SECRET = 'refresh-secret-at-least-16-chars';
const DAILY_SEED_SECRET = 'daily-seed-secret-at-least-16!!';

const SPEEDS = [
  {
    periodNumber: 1,
    goalFrequency: 0.55,
    goalieFrequency: 0.65,
    shooterFrequency: 0.8,
    puckSpeedPerMs: 1.3,
  },
];

function speedsFor(totalPeriods: number) {
  return Array.from({ length: totalPeriods }, (_, index) => ({
    ...SPEEDS[0]!,
    periodNumber: index + 1,
  }));
}

describe.skipIf(!hasIntegrationEnv)('/duel/amateur/*', () => {
  const { databaseUrl, redisUrl } = hasIntegrationEnv
    ? getTestUrls()
    : { databaseUrl: '', redisUrl: '' };
  let app: FastifyInstance;
  let pool: Pool;
  let userA: string;
  let userB: string;
  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    const initPool = createTestPool();
    await resetDatabase(initPool);
    await applyMigrations(initPool, MIGRATIONS_DIR);
    await initPool.end();
    const redis = createTestRedis();
    await resetRedis(redis);
    redis.disconnect();

    app = await buildApp({
      config: {
        NODE_ENV: 'test',
        HOST: '0.0.0.0',
        PORT: 3000,
        LOG_LEVEL: 'warn',
        DATABASE_URL: databaseUrl,
        REDIS_URL: redisUrl,
        JWT_SECRET,
        REFRESH_SECRET,
        TELEGRAM_BOT_TOKEN: 'test-bot-token',
        DAILY_SEED_SECRET,
      },
      pushSchedulerEnabled: false,
      pushWorkerEnabled: false,
    });
    pool = app.pg;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await pool.query(
      `truncate users, auth_providers, user_wallet, user_equipment, user_sticks,
              user_currency_account, user_inventory_item,
              amateur_duel_template, amateur_duel_match, amateur_duel_participant,
              amateur_duel_period_log, amateur_duel_rating, amateur_duel_matchmaking_ticket,
              currency_ledger,
              training_session, day_pool, period_log, shot_session, event_log,
              chats, chat_members, messages, message_reactions, push_delivery_log
              restart identity cascade`,
    );
    const a = await findOrCreateTelegramUser(pool, {
      providerUid: 'amateur-a',
      displayName: 'Player A',
      timezone: 'Europe/Moscow',
    });
    const b = await findOrCreateTelegramUser(pool, {
      providerUid: 'amateur-b',
      displayName: 'Player B',
      timezone: 'Europe/Moscow',
    });
    userA = a.id;
    userB = b.id;
    await pool.query(`update users set level = 2 where id = any($1::uuid[])`, [[userA, userB]]);
    await pool.query(
      `insert into user_currency_account (user_id, balance)
       values ($1, 100), ($2, 100)
       on conflict (user_id) do update set balance = excluded.balance, reserved_balance = 0`,
      [userA, userB],
    );
    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    tokenA = await jwt.issueAccessToken({ sub: userA });
    tokenB = await jwt.issueAccessToken({ sub: userB });
  });

  function auth(token: string) {
    return { authorization: `Bearer ${token}` };
  }

  async function createTemplate(
    opts: {
      startsAt?: string;
      endsAt?: string;
      stake?: number;
      fee?: number;
      ranked?: boolean;
      variant?: 'classic' | 'time_attack';
      duelKind?: 'express' | 'express_plus' | 'classic';
      periodRules?: Array<{
        periodNumber: number;
        mode: 'quota' | 'time_attack';
        durationMs: number;
        shotsLimit: number | null;
      }>;
      totalPeriods?: number;
      periodDurationMs?: number;
      breakDurationMs?: number;
    } = {},
  ) {
    const startsAt = opts.startsAt ?? '2026-01-01T00:00:00.000Z';
    const endsAt = opts.endsAt ?? '2100-01-01T00:00:00.000Z';
    const { rows } = await pool.query<{ id: string }>(
      `insert into amateur_duel_template
         (title, description, starts_at, ends_at, duel_kind, total_periods, shots_per_period,
          period_duration_ms, break_duration_ms, goalie_id, period_speed_presets,
          stake_amount, entry_fee_amount, ranked_enabled, duel_variant, period_rules)
       values ('Test duel', '', $1, $2, $10, $6, 1, $7, $12, 'rookie', $3, $4, $5, $8, $9, $11)
       returning id`,
      [
        startsAt,
        endsAt,
        JSON.stringify(speedsFor(opts.totalPeriods ?? 1)),
        opts.stake ?? 0,
        opts.fee ?? 0,
        opts.totalPeriods ?? 1,
        opts.periodDurationMs ?? 1200000,
        opts.ranked ?? true,
        opts.variant ?? 'classic',
        opts.duelKind ?? 'classic',
        opts.periodRules ? JSON.stringify(opts.periodRules) : null,
        opts.breakDurationMs ?? (opts.duelKind === 'express_plus' ? 120000 : 0),
      ],
    );
    return rows[0]!.id;
  }

  async function challenge(templateId: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/duel/amateur/challenge',
      headers: auth(tokenA),
      payload: { template_id: templateId, opponent_user_id: userB },
    });
    return res;
  }

  it('creates a pending challenge and rejects duplicate open matches', async () => {
    const templateId = await createTemplate();
    const first = await challenge(templateId);
    expect(first.statusCode).toBe(200);
    expect(first.json().match.status).toBe('invited');

    const inviteMessage = await pool.query<{ content: string; metadata: Record<string, unknown> }>(
      `select content, metadata
         from messages
        where metadata->>'type' = 'amateur_duel_invite'
        order by created_at desc
        limit 1`,
    );
    expect(inviteMessage.rows[0]?.content).toContain('Ответить: в течение 30 мин');
    expect(inviteMessage.rows[0]?.content.split('\n')[0]).toBe('Player A вызывает вас на дуэль.');
    expect(inviteMessage.rows[0]?.content).not.toContain('Окно:');
    expect(Date.parse(String(inviteMessage.rows[0]?.metadata.endsAt))).toBeLessThan(
      Date.parse('2100-01-01T00:00:00.000Z'),
    );

    const duplicate = await challenge(templateId);
    expect(duplicate.statusCode).toBe(409);
  });

  it('limits one player to five open duel slots', async () => {
    const templateIds = await Promise.all(Array.from({ length: 6 }, () => createTemplate()));

    for (const templateId of templateIds.slice(0, 5)) {
      const created = await challenge(templateId);
      expect(created.statusCode).toBe(200);
      expect(created.json().match.status).toBe('invited');
    }

    const blocked = await challenge(templateIds[5]!);
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error.message).toBe('open duel slot limit reached');
  });

  it('rejects duel challenges from beginners and against beginners', async () => {
    const templateId = await createTemplate();

    await pool.query(`update users set level = 1, lifetime_goals_total = 0 where id = $1`, [userA]);
    const fromBeginner = await challenge(templateId);
    expect(fromBeginner.statusCode).toBe(403);

    await pool.query(`update users set level = 2 where id = $1`, [userA]);
    await pool.query(`update users set level = 1, lifetime_goals_total = 0 where id = $1`, [userB]);
    const againstBeginner = await challenge(templateId);
    expect(againstBeginner.statusCode).toBe(403);
  });

  it('does not expose duel opponents to beginners or include beginners', async () => {
    await pool.query(`update users set level = 1, lifetime_goals_total = 0 where id = $1`, [userA]);
    const lockedSearch = await app.inject({
      method: 'GET',
      url: '/duel/amateur/opponents',
      headers: auth(tokenA),
    });
    expect(lockedSearch.statusCode).toBe(403);

    await pool.query(`update users set level = 2 where id = $1`, [userA]);
    await pool.query(`update users set level = 1, lifetime_goals_total = 0 where id = $1`, [userB]);
    const opponents = await app.inject({
      method: 'GET',
      url: '/duel/amateur/opponents',
      headers: auth(tokenA),
    });
    expect(opponents.statusCode).toBe(200);
    expect(opponents.json().users).toEqual([]);
  });

  it('uses relaxed ranked limits for new duel templates by default', async () => {
    const templateId = await createTemplate();

    const templates = await app.inject({
      method: 'GET',
      url: '/duel/amateur/templates',
      headers: auth(tokenA),
    });

    expect(templates.statusCode).toBe(200);
    const template = templates
      .json()
      .templates.find((item: { id: string }) => item.id === templateId);
    expect(template.ranked_daily_limit).toBe(100);
    expect(template.ranked_same_opponent_limit).toBe(100);
  });

  it('accepts into a ready room without reserving stake or fee yet', async () => {
    const templateId = await createTemplate({
      startsAt: '2099-01-01T00:00:00.000Z',
      endsAt: '2100-01-01T00:00:00.000Z',
      stake: 10,
      fee: 2,
    });
    const created = await challenge(templateId);
    const matchId = created.json().match.id;

    const accepted = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/accept`,
      headers: auth(tokenB),
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json().match.status).toBe('ready_check');
    expect(accepted.json().match.ready_expires_at).toBeTruthy();

    const accounts = await pool.query<{ balance: number; reserved_balance: number }>(
      `select balance, reserved_balance
         from user_currency_account
        where user_id = any($1::uuid[])
        order by user_id`,
      [[userA, userB]],
    );
    expect(accounts.rows).toEqual([
      { balance: 100, reserved_balance: 0 },
      { balance: 100, reserved_balance: 0 },
    ]);
  });

  it('starts an active duel only after both players are ready without touching balances', async () => {
    const templateId = await createTemplate({ stake: 10, fee: 2 });
    const created = await challenge(templateId);
    const matchId = created.json().match.id;
    await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/accept`,
      headers: auth(tokenB),
    });

    const firstReady = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/ready`,
      headers: auth(tokenA),
      payload: { loadout: {} },
    });
    expect(firstReady.statusCode).toBe(200);
    expect(firstReady.json().match.status).toBe('ready_check');
    expect(firstReady.json().match.me.state).toBe('ready');

    const secondReady = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/ready`,
      headers: auth(tokenB),
      payload: { loadout: {} },
    });
    expect(secondReady.statusCode).toBe(200);
    expect(secondReady.json().match.status).toBe('active');
    expect(secondReady.json().match.accepted_at).toBeTruthy();

    const accounts = await pool.query<{ balance: number; reserved_balance: number }>(
      `select balance, reserved_balance
         from user_currency_account
        where user_id = any($1::uuid[])
        order by user_id`,
      [[userA, userB]],
    );
    expect(accounts.rows).toEqual([
      { balance: 100, reserved_balance: 0 },
      { balance: 100, reserved_balance: 0 },
    ]);
  });

  it('lets a challenger cancel an unanswered challenge without cooldown or reserves', async () => {
    const templateId = await createTemplate({ stake: 10, fee: 2 });
    const created = await challenge(templateId);
    const matchId = created.json().match.id;

    const cancelled = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/cancel`,
      headers: auth(tokenA),
    });
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json().match.status).toBe('cancelled');
    expect(cancelled.json().match.settled_reason).toBe('cancelled_by_challenger');
  });

  it('declines a pending challenge without reserving stake', async () => {
    const templateId = await createTemplate({ stake: 10, fee: 2 });
    const created = await challenge(templateId);
    const matchId = created.json().match.id;

    const declined = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/decline`,
      headers: auth(tokenB),
    });
    expect(declined.statusCode).toBe(200);
    expect(declined.json().match.status).toBe('cancelled');
    expect(declined.json().match.settled_reason).toBe('declined');

    const accounts = await pool.query<{ balance: number; reserved_balance: number }>(
      `select balance, reserved_balance
         from user_currency_account
        where user_id = any($1::uuid[])
        order by user_id`,
      [[userA, userB]],
    );
    expect(accounts.rows).toEqual([
      { balance: 100, reserved_balance: 0 },
      { balance: 100, reserved_balance: 0 },
    ]);

    const notification = await pool.query<{ content: string }>(
      `select content
         from messages
        where content like '%отклонил приглашение%'
        order by created_at desc
        limit 1`,
    );
    expect(notification.rows[0]?.content).toBe(
      'Player B отклонил приглашение на дуэль «Test duel».',
    );
  });

  it('pairs matchmaking players into a ready room', async () => {
    const templateId = await createTemplate();
    const first = await app.inject({
      method: 'POST',
      url: '/duel/amateur/matchmaking/join',
      headers: auth(tokenA),
      payload: { template_id: templateId },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().ticket.status).toBe('queued');

    const second = await app.inject({
      method: 'POST',
      url: '/duel/amateur/matchmaking/join',
      headers: auth(tokenB),
      payload: { template_id: templateId },
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().match.status).toBe('ready_check');
    expect(second.json().match.opponent.user_id).toBe(userA);
  });

  it('pairs matchmaking players only when duel kind preferences overlap', async () => {
    await createTemplate({ duelKind: 'express' });
    await createTemplate({ duelKind: 'classic' });
    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    const userC = await findOrCreateTelegramUser(pool, {
      providerUid: 'amateur-c',
      displayName: 'Player C',
      timezone: 'Europe/Moscow',
    });
    await pool.query(`update users set level = 2 where id = $1`, [userC.id]);
    await pool.query(`insert into user_currency_account (user_id, balance) values ($1, 100)`, [
      userC.id,
    ]);
    const tokenC = await jwt.issueAccessToken({ sub: userC.id });

    const first = await app.inject({
      method: 'POST',
      url: '/duel/amateur/matchmaking/join',
      headers: auth(tokenA),
      payload: { duel_kinds: ['express'] },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().ticket.status).toBe('queued');

    const second = await app.inject({
      method: 'POST',
      url: '/duel/amateur/matchmaking/join',
      headers: auth(tokenB),
      payload: { duel_kinds: ['classic'] },
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().ticket.status).toBe('queued');

    const third = await app.inject({
      method: 'POST',
      url: '/duel/amateur/matchmaking/join',
      headers: auth(tokenC),
      payload: { duel_kinds: ['express_plus', 'classic'] },
    });
    expect(third.statusCode).toBe(200);
    expect(third.json().match.status).toBe('ready_check');
    expect(third.json().match.rules.duelKind).toBe('classic');
    expect(third.json().match.opponent.user_id).toBe(userB);
  });

  it('settles no-show as a win for the player who completed the duel', async () => {
    const templateId = await createTemplate();
    const created = await challenge(templateId);
    const matchId = created.json().match.id;

    const accepted = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/accept`,
      headers: auth(tokenB),
    });
    expect(accepted.statusCode).toBe(200);
    await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/ready`,
      headers: auth(tokenA),
      payload: { loadout: {} },
    });
    await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/ready`,
      headers: auth(tokenB),
      payload: { loadout: {} },
    });

    const started = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/period/start`,
      headers: auth(tokenA),
    });
    expect(started.statusCode).toBe(200);

    const shot = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/shot`,
      headers: auth(tokenA),
      payload: {
        shot_index: 1,
        input: { tapTime: 1000 },
        claimed_result: 'goal',
      },
    });
    expect(shot.statusCode).toBe(200);

    await pool.query(
      `update amateur_duel_match
          set starts_at = now() - interval '2 seconds',
              ends_at = now() - interval '1 second'
        where id = $1`,
      [matchId],
    );
    const settled = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/settle`,
      headers: auth(tokenA),
    });
    expect(settled.statusCode).toBe(200);
    expect(settled.json().match.status).toBe('settled');
    expect(settled.json().match.winner_user_id).toBe(userA);
    expect(settled.json().match.outcome).toBe('challenger_win');
  });

  it('includes opponent live period shots in match state', async () => {
    const templateId = await createTemplate({ duelKind: 'express', variant: 'time_attack' });
    const created = await challenge(templateId);
    const matchId = created.json().match.id;
    await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/accept`,
      headers: auth(tokenB),
    });
    await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/ready`,
      headers: auth(tokenA),
      payload: { loadout: {} },
    });
    await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/ready`,
      headers: auth(tokenB),
      payload: { loadout: {} },
    });
    const started = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/period/start`,
      headers: auth(tokenB),
    });
    expect(started.statusCode).toBe(200);

    await pool.query(
      `insert into shot_session
         (user_id, mode, amateur_duel_match_id, period_number, shot_index, seed,
          input_payload, server_result, game_core_version)
       values
         ($1, 'amateur_duel', $2, 1, 1, 'opponent-live-1', '{}'::jsonb, 'goal', 1),
         ($1, 'amateur_duel', $2, 1, 2, 'opponent-live-2', '{}'::jsonb, 'save', 1)`,
      [userB, matchId],
    );

    const state = await app.inject({
      method: 'GET',
      url: `/duel/amateur/matches/${matchId}`,
      headers: auth(tokenA),
    });
    expect(state.statusCode).toBe(200);
    expect(state.json().match.opponent.state).toBe('period_active');
    expect(state.json().match.opponent.shots_taken).toBe(2);
    expect(state.json().match.opponent.goals).toBe(1);
  });

  it('snapshots express plus with mixed period rules and completes time attack on timeout', async () => {
    const templateId = await createTemplate({
      duelKind: 'express_plus',
      variant: 'classic',
      totalPeriods: 2,
      periodDurationMs: 180000,
      periodRules: [
        { periodNumber: 1, mode: 'quota', durationMs: 180000, shotsLimit: 30 },
        { periodNumber: 2, mode: 'time_attack', durationMs: 180000, shotsLimit: null },
      ],
    });
    const created = await challenge(templateId);
    const matchId = created.json().match.id;
    await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/accept`,
      headers: auth(tokenB),
    });
    await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/ready`,
      headers: auth(tokenA),
      payload: { loadout: {} },
    });
    const ready = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/ready`,
      headers: auth(tokenB),
      payload: { loadout: {} },
    });

    expect(ready.statusCode).toBe(200);
    expect(ready.json().match.rules).toMatchObject({
      duelKind: 'express_plus',
      totalPeriods: 2,
      breakDurationMs: 120000,
      periodRules: [
        { periodNumber: 1, mode: 'quota', durationMs: 180000, shotsLimit: 30 },
        { periodNumber: 2, mode: 'time_attack', durationMs: 180000, shotsLimit: null },
      ],
    });

    await pool.query(
      `update amateur_duel_participant
          set state = 'period_active',
              current_period = 2,
              period_started_at = now() - interval '4 minutes'
        where match_id = $1 and user_id = $2`,
      [matchId, userA],
    );
    await pool.query(
      `insert into amateur_duel_period_log
         (match_id, user_id, period_number, started_at, ended_at, shots_taken, goals, duration_ms, closed_reason)
       values ($1, $2, 1, now() - interval '3 minutes', now(), 30, 11, 180000, 'quota')`,
      [matchId, userB],
    );

    const reconciled = await app.inject({
      method: 'GET',
      url: `/duel/amateur/matches/${matchId}`,
      headers: auth(tokenA),
    });
    expect(reconciled.statusCode).toBe(200);
    expect(reconciled.json().match.me.state).toBe('completed');
    expect(reconciled.json().match.recent_periods[0]).toMatchObject({
      period_number: 2,
      closed_reason: 'timeout',
      duration_ms: 180000,
    });
    expect(reconciled.json().match.opponent_recent_periods[0]).toMatchObject({
      period_number: 1,
      shots_taken: 30,
      goals: 11,
      duration_ms: 180000,
    });
  });
});
