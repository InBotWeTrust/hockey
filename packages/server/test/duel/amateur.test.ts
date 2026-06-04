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
      challengeTtlMs?: number;
      readyDurationMs?: number;
      winStarReward?: number;
    } = {},
  ) {
    const startsAt = opts.startsAt ?? '2026-01-01T00:00:00.000Z';
    const endsAt = opts.endsAt ?? '2100-01-01T00:00:00.000Z';
    const { rows } = await pool.query<{ id: string }>(
      `insert into amateur_duel_template
         (title, description, starts_at, ends_at, duel_kind, total_periods, shots_per_period,
          period_duration_ms, break_duration_ms, goalie_id, period_speed_presets,
          stake_amount, entry_fee_amount, ranked_enabled, duel_variant, period_rules,
          challenge_ttl_ms, ready_duration_ms, win_star_reward)
       values ('Test duel', '', $1, $2, $10, $6, 1, $7, $12, 'rookie', $3, $4, $5, $8, $9, $11,
               $13, $14, $15)
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
        opts.challengeTtlMs ?? 900000,
        opts.readyDurationMs ?? 900000,
        opts.winStarReward ?? 0,
      ],
    );
    return rows[0]!.id;
  }

  async function createOpponent(index: number) {
    const user = await findOrCreateTelegramUser(pool, {
      providerUid: `amateur-opponent-${index}`,
      displayName: `Opponent ${index}`,
      timezone: 'Europe/Moscow',
    });
    await pool.query(`update users set level = 2 where id = $1`, [user.id]);
    await pool.query(
      `insert into user_currency_account (user_id, balance)
       values ($1, 100)
       on conflict (user_id) do update set balance = excluded.balance, reserved_balance = 0`,
      [user.id],
    );
    return user.id;
  }

  async function challenge(templateId: string, opponentUserId = userB) {
    const res = await app.inject({
      method: 'POST',
      url: '/duel/amateur/challenge',
      headers: auth(tokenA),
      payload: { template_id: templateId, opponent_user_id: opponentUserId },
    });
    return res;
  }

  async function createInventoryItem(kind: 'stick' | 'skates' | 'nutrition', title: string) {
    const { rows } = await pool.query<{ id: string }>(
      `insert into admin_inventory_items
         (photo_url, title, description, price_rub, item_kind, charges_per_purchase,
          duel_period_cost, power_score, rarity)
       values ('', $1, '', 0, $2, 10, 1, 10, 'epic')
       returning id`,
      [title, kind],
    );
    return rows[0]!.id;
  }

  async function acceptReadyAndStart(
    matchId: string,
    opts: { token?: string; loadout?: Record<string, string | null> } = {},
  ) {
    await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/accept`,
      headers: auth(tokenB),
    });
    await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/ready`,
      headers: auth(opts.token ?? tokenA),
      payload: { loadout: opts.loadout ?? {} },
    });
    await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/ready`,
      headers: auth(tokenB),
      payload: { loadout: {} },
    });
    return app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/period/start`,
      headers: auth(opts.token ?? tokenA),
    });
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
    expect(inviteMessage.rows[0]?.content).toContain('Ответить: в течение 15 мин');
    expect(inviteMessage.rows[0]?.content.split('\n')[0]).toBe('Player A вызывает вас на дуэль.');
    expect(inviteMessage.rows[0]?.content).not.toContain('Окно:');
    expect(Date.parse(String(inviteMessage.rows[0]?.metadata.endsAt))).toBeLessThan(
      Date.parse('2100-01-01T00:00:00.000Z'),
    );
    const unreadInvite = await pool.query<{ cnt: string }>(
      `select count(m.id)::int as cnt
         from messages m
         left join chat_members cm on cm.chat_id = m.chat_id and cm.user_id = $1
        where m.metadata->>'type' = 'amateur_duel_invite'
          and m.sender_id != $1
          and m.created_at > coalesce(cm.last_read_at, '1970-01-01'::timestamptz)`,
      [userB],
    );
    expect(Number(unreadInvite.rows[0]?.cnt)).toBe(0);

    const duplicate = await challenge(templateId);
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().error.message).toBe('open duel already exists for this opponent');
  });

  it('rejects another open challenge against the same opponent with another template', async () => {
    const templateId = await createTemplate({ duelKind: 'express' });
    const anotherTemplateId = await createTemplate({ duelKind: 'classic' });

    const first = await challenge(templateId);
    expect(first.statusCode).toBe(200);

    const duplicatePair = await challenge(anotherTemplateId);
    expect(duplicatePair.statusCode).toBe(409);
    expect(duplicatePair.json().error.message).toBe('open duel already exists for this opponent');
  });

  it('limits one player to five open duel slots', async () => {
    const templateId = await createTemplate();
    const opponentIds = await Promise.all(
      Array.from({ length: 6 }, (_, index) => createOpponent(index)),
    );

    for (const opponentId of opponentIds.slice(0, 5)) {
      const created = await challenge(templateId, opponentId);
      expect(created.statusCode).toBe(200);
      expect(created.json().match.status).toBe('invited');
    }

    const blocked = await challenge(templateId, opponentIds[5]);
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

  it('keeps null period rules as SQL null when admin updates a duel template', async () => {
    await pool.query(`update users set role = 'admin' where id = $1`, [userA]);
    const templateId = await createTemplate({
      totalPeriods: 2,
      periodRules: [
        { periodNumber: 1, mode: 'quota', durationMs: 180000, shotsLimit: 30 },
        { periodNumber: 2, mode: 'time_attack', durationMs: 180000, shotsLimit: null },
      ],
    });

    const patch = await app.inject({
      method: 'PATCH',
      url: `/admin/duel-templates/${templateId}`,
      headers: auth(tokenA),
      payload: { periodRules: null },
    });

    expect(patch.statusCode).toBe(200);
    expect(patch.json().template.periodRules).toHaveLength(2);
    const stored = await pool.query<{ period_rules: unknown }>(
      `select period_rules from amateur_duel_template where id = $1`,
      [templateId],
    );
    expect(stored.rows[0]?.period_rules).toBeNull();
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

    const acceptedMessage = await pool.query<{ chat_id: string; content: string }>(
      `select chat_id, content
         from messages
        where content like '%принял дуэль%'
        order by created_at desc
        limit 1`,
    );
    expect(acceptedMessage.rows[0]?.content).toBe('Player B принял дуэль «Test duel».');

    const unreadForChallenger = await app.inject({
      method: 'GET',
      url: '/chat/unread',
      headers: auth(tokenA),
    });
    expect(unreadForChallenger.statusCode).toBe(200);
    expect(unreadForChallenger.json()).not.toHaveProperty(acceptedMessage.rows[0]!.chat_id);

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
    const acceptedAt = Date.parse(String(secondReady.json().match.accepted_at));
    const endsAt = Date.parse(String(secondReady.json().match.ends_at));
    expect(endsAt - acceptedAt).toBe(1200000);

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

  it('uses active equipment as the default duel loadout', async () => {
    const stickId = await createInventoryItem('stick', 'Test stick');
    const skatesId = await createInventoryItem('skates', 'Test skates');
    const nutritionId = await createInventoryItem('nutrition', 'Test nutrition');
    await pool.query(
      `insert into user_inventory_item (user_id, inventory_item_id, charges_available)
       values ($1, $2, 10), ($1, $3, 10), ($1, $4, 10)
       on conflict (user_id, inventory_item_id)
       do update set charges_available = excluded.charges_available`,
      [userA, stickId, skatesId, nutritionId],
    );
    await pool.query(
      `insert into user_equipment
         (user_id, equipped_stick_item_id, equipped_skates_item_id, equipped_nutrition_item_id)
       values ($1, $2, $3, $4)
       on conflict (user_id) do update
          set equipped_stick_item_id = excluded.equipped_stick_item_id,
              equipped_skates_item_id = excluded.equipped_skates_item_id,
              equipped_nutrition_item_id = excluded.equipped_nutrition_item_id`,
      [userA, stickId, skatesId, nutritionId],
    );
    const templateId = await createTemplate({ totalPeriods: 2 });
    const created = await challenge(templateId);
    const matchId = created.json().match.id;
    await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/accept`,
      headers: auth(tokenB),
    });

    const ready = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/ready`,
      headers: auth(tokenA),
      payload: { loadout: {} },
    });

    expect(ready.statusCode).toBe(200);
    const itemIds = ready
      .json()
      .match.me.loadout.items.map((item: { id: string }) => item.id)
      .sort();
    expect(itemIds).toEqual([nutritionId, skatesId, stickId].sort());
    expect(ready.json().match.me.loadout.powerScore).toBe(30);
  });

  it('snapshots duel inventory resource units and timing', async () => {
    const stickId = await createInventoryItem('stick', 'Ультимейт Ван 1');
    await pool.query(
      `update admin_inventory_items
          set resource_unit = 'shot',
              charges_per_purchase = 1300,
              effect_puck_speed_points = 10,
              effect_puck_speed_delta = 0.10,
              duel_period_cost = 0
        where id = $1`,
      [stickId],
    );
    await pool.query(
      `insert into user_inventory_item (user_id, inventory_item_id, charges_available)
       values ($1, $2, 1300)
       on conflict (user_id, inventory_item_id)
       do update set charges_available = excluded.charges_available`,
      [userA, stickId],
    );
    await pool.query(
      `insert into user_equipment (user_id, equipped_stick_item_id)
       values ($1, $2)
       on conflict (user_id) do update
          set equipped_stick_item_id = excluded.equipped_stick_item_id`,
      [userA, stickId],
    );
    const templateId = await createTemplate();
    const created = await challenge(templateId);
    const matchId = created.json().match.id;
    await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/accept`,
      headers: auth(tokenB),
    });

    const ready = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/ready`,
      headers: auth(tokenA),
      payload: { loadout: {} },
    });

    expect(ready.statusCode).toBe(200);
    const stick = ready
      .json()
      .match.me.loadout.items.find((item: { id: string }) => item.id === stickId);
    expect(stick).toMatchObject({
      id: stickId,
      title: 'Ультимейт Ван 1',
      resourceUnit: 'shot',
      resourceAvailable: 1300,
      effectPuckSpeedPoints: 10,
      timing: {
        nutritionSlowdownMs: 2000,
        nutritionStopMs: 5000,
      },
    });
  });

  it('returns inventory state and updates active equipment', async () => {
    const stickId = await createInventoryItem('stick', 'Locker stick');
    const oneShotStickId = await createInventoryItem('stick', 'One shot stick');
    const twoShotStickId = await createInventoryItem('stick', 'Two shot stick');
    const fiveShotStickId = await createInventoryItem('stick', 'Five shot stick');
    const twentyOneShotStickId = await createInventoryItem('stick', 'Twenty one shot stick');
    const energyNutritionId = await createInventoryItem('nutrition', 'Energy nutrition');
    await pool.query(
      `insert into user_inventory_item (user_id, inventory_item_id, charges_available)
       values ($1, $2, 3),
              ($1, $3, 1),
              ($1, $4, 2),
              ($1, $5, 5),
              ($1, $6, 21),
              ($1, $7, 59999)`,
      [
        userA,
        stickId,
        oneShotStickId,
        twoShotStickId,
        fiveShotStickId,
        twentyOneShotStickId,
        energyNutritionId,
      ],
    );
    await pool.query(
      `update admin_inventory_items
          set resource_unit = case id
                when $1 then 'shot'
                when $2 then 'shot'
                when $3 then 'shot'
                when $4 then 'shot'
                when $5 then 'energy_ms'
                else resource_unit
              end
        where id = any($6::uuid[])`,
      [
        oneShotStickId,
        twoShotStickId,
        fiveShotStickId,
        twentyOneShotStickId,
        energyNutritionId,
        [oneShotStickId, twoShotStickId, fiveShotStickId, twentyOneShotStickId, energyNutritionId],
      ],
    );

    const saved = await app.inject({
      method: 'PATCH',
      url: '/inventory/equipment',
      headers: auth(tokenA),
      payload: { stickItemId: stickId },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().equipped.stickItemId).toBe(stickId);

    const state = await app.inject({
      method: 'GET',
      url: '/inventory/me',
      headers: auth(tokenA),
    });
    expect(state.statusCode).toBe(200);
    const stick = state.json().items.stick.find((item: { id: string }) => item.id === stickId);
    expect(stick?.chargesAvailable).toBe(3);
    const labelById = new Map(
      [...state.json().items.stick, ...state.json().items.nutrition].map(
        (item: { id: string; resourceLabel: string }) => [item.id, item.resourceLabel],
      ),
    );
    expect(labelById.get(oneShotStickId)).toBe('1 бросок');
    expect(labelById.get(twoShotStickId)).toBe('2 броска');
    expect(labelById.get(fiveShotStickId)).toBe('5 бросков');
    expect(labelById.get(twentyOneShotStickId)).toBe('21 бросок');
    expect(labelById.get(energyNutritionId)).toBe('1 минута энергии');
  });

  it('purchases inventory with currency balance', async () => {
    const stickId = await createInventoryItem('stick', 'Bronze shop stick');
    await pool.query(
      `update admin_inventory_items
          set currency_price = 40,
              charges_per_purchase = 5
        where id = $1`,
      [stickId],
    );

    const purchased = await app.inject({
      method: 'POST',
      url: `/inventory/items/${stickId}/purchase`,
      headers: auth(tokenA),
    });

    expect(purchased.statusCode).toBe(200);
    expect(purchased.json().balances.tokens).toBe(60);
    const stick = purchased.json().items.stick.find((item: { id: string }) => item.id === stickId);
    expect(stick?.chargesAvailable).toBe(5);
    expect(stick?.chargesPerPurchase).toBe(5);
    expect(purchased.json().purchaseHistory[0]).toMatchObject({
      title: 'Bronze shop stick',
      tokensSpent: 40,
      chargesAdded: 5,
    });

    const ledger = await pool.query<{ available_delta: number; balance_after: number }>(
      `select available_delta, balance_after
         from currency_ledger
        where user_id = $1 and reason = 'inventory_purchase'`,
      [userA],
    );
    expect(ledger.rows).toEqual([{ available_delta: -40, balance_after: 60 }]);

    await pool.query(
      `insert into currency_ledger
         (user_id, reason, available_delta, reserved_delta, balance_after, reserved_after, metadata)
       values ($1, 'weekly_challenge_reward', 25, 0, 85, 0, $2)`,
      [userA, JSON.stringify({ stars: 2, experience: 10, title: 'Недельная награда' })],
    );
    await pool.query(
      `insert into payments (user_id, title, amount_rub, status, paid_at)
       values ($1, 'Игровой запас', 299, 'paid', now())`,
      [userA],
    );

    const state = await app.inject({
      method: 'GET',
      url: '/inventory/me',
      headers: auth(tokenA),
    });
    expect(state.statusCode).toBe(200);
    expect(state.json().transactionHistory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'Bronze shop stick',
          category: 'inventory',
          flow: 'debit',
          amounts: [{ currency: 'coin', value: -40 }],
        }),
        expect.objectContaining({
          title: 'Недельная награда',
          category: 'reward',
          flow: 'credit',
          amounts: [
            { currency: 'coin', value: 25 },
            { currency: 'star', value: 2 },
            { currency: 'experience', value: 10 },
          ],
        }),
        expect.objectContaining({
          title: 'Игровой запас',
          category: 'bank',
          flow: 'debit',
          amounts: [{ currency: 'ruble', value: -299 }],
        }),
      ]),
    );
  });

  it('rejects inventory purchase when currency balance is too low', async () => {
    const skatesId = await createInventoryItem('skates', 'Gold shop skates');
    await pool.query(
      `update admin_inventory_items
          set currency_price = 140,
              charges_per_purchase = 5
        where id = $1`,
      [skatesId],
    );

    const purchased = await app.inject({
      method: 'POST',
      url: `/inventory/items/${skatesId}/purchase`,
      headers: auth(tokenA),
    });

    expect(purchased.statusCode).toBe(409);
    const account = await pool.query<{ balance: number }>(
      `select balance from user_currency_account where user_id = $1`,
      [userA],
    );
    expect(account.rows[0]?.balance).toBe(100);
  });

  it('keeps a classic duel active long enough for all periods and breaks', async () => {
    const templateId = await createTemplate({
      totalPeriods: 3,
      periodDurationMs: 1200000,
      breakDurationMs: 120000,
      readyDurationMs: 900000,
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
    expect(ready.json().match.status).toBe('active');
    const acceptedAt = Date.parse(String(ready.json().match.accepted_at));
    const endsAt = Date.parse(String(ready.json().match.ends_at));
    expect(endsAt - acceptedAt).toBe(4440000);
  });

  it('cancels an active duel without rating when both ready players never start', async () => {
    const templateId = await createTemplate({ readyDurationMs: 15000 });
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
    expect(settled.json().match.status).toBe('cancelled');
    expect(settled.json().match.settled_reason).toBe('no_play');
    const rating = await pool.query(
      `select * from amateur_duel_rating where user_id = any($1::uuid[])`,
      [[userA, userB]],
    );
    expect(rating.rowCount).toBe(0);
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

  it('omits cancelled and expired duels from the match list', async () => {
    const templateId = await createTemplate();

    const settled = await challenge(templateId);
    const settledMatchId = settled.json().match.id;
    await pool.query(
      `update amateur_duel_match
          set status = 'settled',
              season_key = '2026-01',
              accepted_at = now(),
              settled_at = now(),
              settled_reason = 'completed',
              winner_user_id = $2,
              outcome = 'challenger_win'
        where id = $1`,
      [settledMatchId, userA],
    );
    await pool.query(
      `update amateur_duel_participant
          set state = 'completed',
              shots_taken = case when user_id = $2 then 5 else 4 end,
              goals = case when user_id = $2 then 3 else 1 end,
              result_points = case when user_id = $2 then 3 else 0 end
        where match_id = $1`,
      [settledMatchId, userA],
    );

    const cancelled = await challenge(templateId);
    await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${cancelled.json().match.id}/cancel`,
      headers: auth(tokenA),
    });

    const expired = await challenge(templateId);
    await pool.query(
      `update amateur_duel_match
          set status = 'expired',
              settled_at = now(),
              settled_reason = 'not_accepted'
        where id = $1`,
      [expired.json().match.id],
    );

    const listed = await app.inject({
      method: 'GET',
      url: '/duel/amateur/matches',
      headers: auth(tokenA),
    });

    expect(listed.statusCode).toBe(200);
    expect(listed.json().matches.map((match: { id: string }) => match.id)).toEqual([
      settledMatchId,
    ]);

    const history = await app.inject({
      method: 'GET',
      url: '/duel/amateur/history?season_key=2026-01',
      headers: auth(tokenA),
    });

    expect(history.statusCode).toBe(200);
    expect(history.json().matches.map((match: { id: string }) => match.id)).toEqual([
      settledMatchId,
    ]);
    expect(history.json().stats).toEqual({ duels: 1, wins: 1, points: 3 });
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

  it('settles a player as forfeit five minutes after intermission is ready', async () => {
    const templateId = await createTemplate({
      totalPeriods: 2,
      periodDurationMs: 1200000,
      breakDurationMs: 120000,
      readyDurationMs: 900000,
      periodRules: [
        { periodNumber: 1, mode: 'quota', durationMs: 1200000, shotsLimit: 1 },
        { periodNumber: 2, mode: 'quota', durationMs: 1200000, shotsLimit: 1 },
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
    await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/ready`,
      headers: auth(tokenB),
      payload: { loadout: {} },
    });

    await pool.query(
      `update amateur_duel_participant
          set state = 'completed',
              current_period = 2,
              shots_taken = 2,
              goals = 2,
              completed_at = now() - interval '6 minutes'
        where match_id = $1 and user_id = $2`,
      [matchId, userA],
    );
    await pool.query(
      `update amateur_duel_participant
          set state = 'accepted',
              current_period = 1,
              shots_taken = 1,
              goals = 1,
              ready_at = now() - interval '6 minutes'
        where match_id = $1 and user_id = $2`,
      [matchId, userB],
    );
    await pool.query(
      `insert into amateur_duel_period_log
         (match_id, user_id, period_number, started_at, ended_at, shots_taken, goals, duration_ms, closed_reason)
       values ($1, $2, 1, now() - interval '10 minutes', now() - interval '7 minutes', 1, 1, 180000, 'quota')`,
      [matchId, userB],
    );

    const settled = await app.inject({
      method: 'GET',
      url: `/duel/amateur/matches/${matchId}`,
      headers: auth(tokenA),
    });

    expect(settled.statusCode).toBe(200);
    expect(settled.json().match.status).toBe('settled');
    expect(settled.json().match.winner_user_id).toBe(userA);
    expect(settled.json().match.opponent.state).toBe('forfeit');
  });

  it('settles no-show as a win for the player who completed the duel', async () => {
    const templateId = await createTemplate({ winStarReward: 7 });
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
    const stars = await pool.query<{ xp: number }>(`select xp from users where id = $1`, [userA]);
    expect(Number(stars.rows[0]?.xp)).toBe(7);
  });

  it('normalizes legacy stick snapshots and applies the stick speed bonus on duel shot', async () => {
    const stickId = await createInventoryItem('stick', 'Ультимейт Ван test');
    await pool.query(
      `update admin_inventory_items
          set resource_unit = 'period',
              charges_per_purchase = 2,
              duel_period_cost = 0,
              effect_puck_speed_points = 0,
              effect_puck_speed_delta = 0.10
        where id = $1`,
      [stickId],
    );
    await pool.query(
      `insert into user_inventory_item (user_id, inventory_item_id, charges_available)
       values ($1, $2, 2)
       on conflict (user_id, inventory_item_id)
       do update set charges_available = excluded.charges_available, charges_reserved = 0`,
      [userA, stickId],
    );
    const templateId = await createTemplate();
    const created = await challenge(templateId);
    const matchId = created.json().match.id;
    const started = await acceptReadyAndStart(matchId, { loadout: { stick: stickId } });
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
    const inventory = await pool.query<{
      charges_available: number;
      charges_reserved: number;
    }>(
      `select charges_available, charges_reserved
         from user_inventory_item
        where user_id = $1 and inventory_item_id = $2`,
      [userA, stickId],
    );
    expect(inventory.rows[0]).toEqual({ charges_available: 1, charges_reserved: 0 });
    const storedShot = await pool.query<{ input_payload: { puckSpeedPerMs: number } }>(
      `select input_payload
         from shot_session
        where amateur_duel_match_id = $1 and user_id = $2 and shot_index = 1`,
      [matchId, userA],
    );
    expect(storedShot.rows[0]?.input_payload.puckSpeedPerMs).toBe(1.4);
    const consumed = shot
      .json()
      .match.me.inventory_report.flatMap(
        (report: { consumed: Array<{ id: string; charges: number }> }) => report.consumed,
      )
      .find((item: { id: string }) => item.id === stickId);
    expect(consumed?.charges).toBe(1);
  });

  it('does not reset shot-stick resource on the next duel period', async () => {
    const stickId = await createInventoryItem('stick', 'One duel shot stick');
    await pool.query(
      `update admin_inventory_items
          set resource_unit = 'shot',
              charges_per_purchase = 1,
              duel_period_cost = 0,
              effect_puck_speed_points = 10,
              effect_puck_speed_delta = 0
        where id = $1`,
      [stickId],
    );
    await pool.query(
      `insert into user_inventory_item (user_id, inventory_item_id, charges_available)
       values ($1, $2, 1)
       on conflict (user_id, inventory_item_id)
       do update set charges_available = excluded.charges_available, charges_reserved = 0`,
      [userA, stickId],
    );
    const templateId = await createTemplate({
      totalPeriods: 2,
      periodRules: [
        { periodNumber: 1, mode: 'quota', durationMs: 1200000, shotsLimit: 1 },
        { periodNumber: 2, mode: 'quota', durationMs: 1200000, shotsLimit: 1 },
      ],
    });
    const created = await challenge(templateId);
    const matchId = created.json().match.id;
    const started = await acceptReadyAndStart(matchId, { loadout: { stick: stickId } });
    expect(started.statusCode).toBe(200);

    const first = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/shot`,
      headers: auth(tokenA),
      payload: {
        shot_index: 1,
        input: { tapTime: 1000 },
        claimed_result: 'goal',
      },
    });
    expect(first.statusCode).toBe(200);
    await pool.query(
      `update amateur_duel_participant
          set state = 'accepted',
              current_period = 1,
              break_started_at = null
        where match_id = $1 and user_id = $2`,
      [matchId, userA],
    );
    const secondStarted = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/period/start`,
      headers: auth(tokenA),
    });
    expect(secondStarted.statusCode).toBe(200);

    const second = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/shot`,
      headers: auth(tokenA),
      payload: {
        shot_index: 1,
        input: { tapTime: 1000 },
        claimed_result: 'goal',
      },
    });
    expect(second.statusCode).toBe(200);
    const storedShots = await pool.query<{
      period_number: number;
      input_payload: { puckSpeedPerMs: number };
    }>(
      `select period_number, input_payload
         from shot_session
        where amateur_duel_match_id = $1 and user_id = $2
        order by period_number`,
      [matchId, userA],
    );
    expect(storedShots.rows.map((row) => row.input_payload.puckSpeedPerMs)).toEqual([1.4, 1.3]);
    const inventory = await pool.query<{ charges_available: number }>(
      `select charges_available
         from user_inventory_item
        where user_id = $1 and inventory_item_id = $2`,
      [userA, stickId],
    );
    expect(inventory.rows[0]?.charges_available).toBe(0);
  });

  it('can switch shot-stick loadout before starting the next duel period', async () => {
    const firstStickId = await createInventoryItem('stick', 'One shot stick');
    const secondStickId = await createInventoryItem('stick', 'Fresh shot stick');
    await pool.query(
      `update admin_inventory_items
          set resource_unit = 'shot',
              charges_per_purchase = 1,
              duel_period_cost = 0,
              effect_puck_speed_points = 10,
              effect_puck_speed_delta = 0
        where id = any($1::uuid[])`,
      [[firstStickId, secondStickId]],
    );
    await pool.query(
      `insert into user_inventory_item (user_id, inventory_item_id, charges_available)
       values ($1, $2, 1), ($1, $3, 1)
       on conflict (user_id, inventory_item_id)
       do update set charges_available = excluded.charges_available, charges_reserved = 0`,
      [userA, firstStickId, secondStickId],
    );
    const templateId = await createTemplate({
      totalPeriods: 2,
      periodRules: [
        { periodNumber: 1, mode: 'quota', durationMs: 1200000, shotsLimit: 1 },
        { periodNumber: 2, mode: 'quota', durationMs: 1200000, shotsLimit: 1 },
      ],
    });
    const created = await challenge(templateId);
    const matchId = created.json().match.id;
    const started = await acceptReadyAndStart(matchId, { loadout: { stick: firstStickId } });
    expect(started.statusCode).toBe(200);

    const first = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/shot`,
      headers: auth(tokenA),
      payload: {
        shot_index: 1,
        input: { tapTime: 1000 },
        claimed_result: 'goal',
      },
    });
    expect(first.statusCode).toBe(200);
    await pool.query(
      `update amateur_duel_participant
          set state = 'accepted',
              current_period = 1,
              break_started_at = null
        where match_id = $1 and user_id = $2`,
      [matchId, userA],
    );
    const secondStarted = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/period/start`,
      headers: auth(tokenA),
      payload: { loadout: { stick: secondStickId } },
    });
    expect(secondStarted.statusCode).toBe(200);

    const second = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/shot`,
      headers: auth(tokenA),
      payload: {
        shot_index: 1,
        input: { tapTime: 1000 },
        claimed_result: 'goal',
      },
    });
    expect(second.statusCode).toBe(200);
    const storedShots = await pool.query<{
      period_number: number;
      input_payload: { puckSpeedPerMs: number };
    }>(
      `select period_number, input_payload
         from shot_session
        where amateur_duel_match_id = $1 and user_id = $2
        order by period_number`,
      [matchId, userA],
    );
    expect(storedShots.rows.map((row) => row.input_payload.puckSpeedPerMs)).toEqual([1.4, 1.4]);
  });

  it('can switch exhausted shot-stick loadout during an active duel period', async () => {
    const firstStickId = await createInventoryItem('stick', 'One shot stick');
    const secondStickId = await createInventoryItem('stick', 'Fresh shot stick');
    await pool.query(
      `update admin_inventory_items
          set resource_unit = 'shot',
              charges_per_purchase = 1,
              duel_period_cost = 0,
              effect_puck_speed_points = 10,
              effect_puck_speed_delta = 0
        where id = any($1::uuid[])`,
      [[firstStickId, secondStickId]],
    );
    await pool.query(
      `insert into user_inventory_item (user_id, inventory_item_id, charges_available)
       values ($1, $2, 1), ($1, $3, 1)
       on conflict (user_id, inventory_item_id)
       do update set charges_available = excluded.charges_available, charges_reserved = 0`,
      [userA, firstStickId, secondStickId],
    );
    const templateId = await createTemplate({
      periodRules: [{ periodNumber: 1, mode: 'quota', durationMs: 1200000, shotsLimit: 3 }],
    });
    const created = await challenge(templateId);
    const matchId = created.json().match.id;
    const started = await acceptReadyAndStart(matchId, { loadout: { stick: firstStickId } });
    expect(started.statusCode).toBe(200);

    const first = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/shot`,
      headers: auth(tokenA),
      payload: {
        shot_index: 1,
        input: { tapTime: 1000 },
        claimed_result: 'goal',
      },
    });
    expect(first.statusCode).toBe(200);

    const switched = await app.inject({
      method: 'PATCH',
      url: `/duel/amateur/matches/${matchId}/loadout`,
      headers: auth(tokenA),
      payload: { loadout: { stick: secondStickId } },
    });
    expect(switched.statusCode).toBe(200);
    expect(
      switched.json().match.me.loadout.items.find((item: { kind: string }) => item.kind === 'stick')
        ?.id,
    ).toBe(secondStickId);

    const second = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/shot`,
      headers: auth(tokenA),
      payload: {
        shot_index: 2,
        input: { tapTime: 2000 },
        claimed_result: 'goal',
      },
    });
    expect(second.statusCode).toBe(200);

    const storedShots = await pool.query<{
      shot_index: number;
      input_payload: { puckSpeedPerMs: number };
    }>(
      `select shot_index, input_payload
         from shot_session
        where amateur_duel_match_id = $1 and user_id = $2
        order by shot_index`,
      [matchId, userA],
    );
    expect(storedShots.rows.map((row) => row.input_payload.puckSpeedPerMs)).toEqual([1.4, 1.4]);

    const inventory = await pool.query<{ inventory_item_id: string; charges_available: number }>(
      `select inventory_item_id, charges_available
         from user_inventory_item
        where user_id = $1 and inventory_item_id = any($2::uuid[])
        order by inventory_item_id`,
      [userA, [firstStickId, secondStickId]],
    );
    expect(
      inventory.rows.map((row) => ({
        id: row.inventory_item_id,
        charges: row.charges_available,
      })),
    ).toEqual([firstStickId, secondStickId].sort().map((id) => ({ id, charges: 0 })));
  });

  it('rejects duel shots during deterministic exhausted stop', async () => {
    const nutritionId = await createInventoryItem('nutrition', 'Tiny nutrition');
    await pool.query(
      `update admin_inventory_items
          set resource_unit = 'energy_ms',
              charges_per_purchase = 1000,
              duel_period_cost = 0,
              effect_nutrition_slowdown_ms = 2000,
              effect_nutrition_stop_ms = 5000
        where id = $1`,
      [nutritionId],
    );
    await pool.query(
      `insert into user_inventory_item (user_id, inventory_item_id, charges_available)
       values ($1, $2, 1000)
       on conflict (user_id, inventory_item_id)
       do update set charges_available = excluded.charges_available, charges_reserved = 0`,
      [userA, nutritionId],
    );
    const templateId = await createTemplate();
    const created = await challenge(templateId);
    const matchId = created.json().match.id;
    const started = await acceptReadyAndStart(matchId, { loadout: { nutrition: nutritionId } });
    expect(started.statusCode).toBe(200);
    await pool.query(
      `update amateur_duel_participant
          set period_started_at = now() - interval '3500 milliseconds'
        where match_id = $1 and user_id = $2`,
      [matchId, userA],
    );

    const shot = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/shot`,
      headers: auth(tokenA),
      payload: {
        shot_index: 1,
        input: { tapTime: 3500 },
        claimed_result: 'goal',
      },
    });

    expect(shot.statusCode).toBe(409);
    expect(shot.json().error.message).toContain('player cannot shoot');
  });

  it('consumes only nutrition delta between accepted duel shots', async () => {
    const nutritionId = await createInventoryItem('nutrition', 'Delta nutrition');
    await pool.query(
      `update admin_inventory_items
          set resource_unit = 'energy_ms',
              charges_per_purchase = 10000,
              duel_period_cost = 0
        where id = $1`,
      [nutritionId],
    );
    await pool.query(
      `insert into user_inventory_item (user_id, inventory_item_id, charges_available)
       values ($1, $2, 10000)
       on conflict (user_id, inventory_item_id)
       do update set charges_available = excluded.charges_available, charges_reserved = 0`,
      [userA, nutritionId],
    );
    const templateId = await createTemplate({
      periodRules: [{ periodNumber: 1, mode: 'quota', durationMs: 1200000, shotsLimit: 3 }],
    });
    const created = await challenge(templateId);
    const matchId = created.json().match.id;
    const started = await acceptReadyAndStart(matchId, { loadout: { nutrition: nutritionId } });
    expect(started.statusCode).toBe(200);
    await pool.query(
      `update amateur_duel_participant
          set period_started_at = now() - interval '2000 milliseconds'
        where match_id = $1 and user_id = $2`,
      [matchId, userA],
    );

    const first = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/shot`,
      headers: auth(tokenA),
      payload: {
        shot_index: 1,
        input: { tapTime: 2000 },
        claimed_result: 'goal',
      },
    });
    expect(first.statusCode).toBe(200);

    await pool.query(
      `update amateur_duel_participant
          set period_started_at = now() - interval '3000 milliseconds'
        where match_id = $1 and user_id = $2`,
      [matchId, userA],
    );
    const second = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/shot`,
      headers: auth(tokenA),
      payload: {
        shot_index: 2,
        input: { tapTime: 3000 },
        claimed_result: 'goal',
      },
    });
    expect(second.statusCode).toBe(200);

    const inventory = await pool.query<{ charges_available: number }>(
      `select charges_available
         from user_inventory_item
        where user_id = $1 and inventory_item_id = $2`,
      [userA, nutritionId],
    );
    expect(inventory.rows[0]?.charges_available).toBe(7000);
    const participant = await pool.query<{ inventory_report: unknown }>(
      `select inventory_report
         from amateur_duel_participant
        where match_id = $1 and user_id = $2`,
      [matchId, userA],
    );
    const consumed = (
      participant.rows[0]?.inventory_report as Array<{
        consumed: Array<{ id: string; charges: number }>;
      }>
    ).flatMap((report) => report.consumed);
    expect(consumed.filter((item) => item.id === nutritionId).map((item) => item.charges)).toEqual([
      2000, 1000,
    ]);
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
