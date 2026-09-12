import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createJwt } from '../../src/auth/jwt.js';
import { applyMigrations } from '../../src/db/migrations.js';
import type { YooKassaPayment } from '../../src/payments/yookassaClient.js';
import {
  createTestPool,
  getTestUrls,
  hasIntegrationEnv,
  resetDatabase,
} from '../helpers/testDb.js';

const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../db/migrations',
);

describe.skipIf(!hasIntegrationEnv)('YooKassa webhook reconciliation', () => {
  let app: FastifyInstance;
  let noProviderApp: FastifyInstance;
  let packageId: string;
  let paymentId: string;
  let providerId: string;
  const userId = randomUUID();
  const otherUserId = randomUUID();
  let authorization: string;
  let otherAuthorization: string;
  const providerPayments = new Map<string, YooKassaPayment>();
  const getPayment = vi.fn(async (id: string): Promise<YooKassaPayment> => {
    const payment = providerPayments.get(id);
    if (!payment) throw new Error('provider fixture does not contain requested payment');
    return structuredClone(payment);
  });

  beforeAll(async () => {
    const pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);
    await pool.query(
      "insert into users (id, display_name, timezone) values ($1, 'Buyer', 'Europe/Moscow'), ($2, 'Other buyer', 'Europe/Moscow')",
      [userId, otherUserId],
    );
    packageId = (await pool.query("select id from coin_packages where slug = 'club'")).rows[0].id;
    await pool.end();
    const { databaseUrl, redisUrl } = getTestUrls();
    const config = {
      NODE_ENV: 'test' as const,
      HOST: '0.0.0.0',
      PORT: 3000,
      LOG_LEVEL: 'warn' as const,
      DATABASE_URL: databaseUrl,
      REDIS_URL: redisUrl,
      JWT_SECRET: 'access-secret-at-least-16-chars',
      REFRESH_SECRET: 'refresh-secret-at-least-16-chars',
      TELEGRAM_BOT_TOKEN: '111:fixture',
      DAILY_SEED_SECRET: 'daily-seed-secret-at-least-16!!',
      PUSH_WORKER_CONCURRENCY: 5,
      PUSH_WORKER_BATCH_SIZE: 50,
      OBJECT_STORAGE_MAX_UPLOAD_BYTES: 1024,
    };
    app = await buildApp({
      config,
      yookassaClient: {
        getPayment,
        createPayment: async () => {
          throw new Error('webhook/status endpoints must not create provider payments');
        },
      },
    });
    noProviderApp = await buildApp({ config });
    const jwt = createJwt({
      accessSecret: config.JWT_SECRET,
      refreshSecret: config.REFRESH_SECRET,
    });
    authorization = `Bearer ${await jwt.issueAccessToken({ sub: userId })}`;
    otherAuthorization = `Bearer ${await jwt.issueAccessToken({ sub: otherUserId })}`;
  }, 30000);

  async function seedPayment(attached = true) {
    const localId = randomUUID();
    const externalId = `provider-${localId}`;
    await app.pg.query(
      `insert into payments
        (id, user_id, coin_package_id, purchase_attempt_id, title, amount_rub, coin_amount,
         status, provider, provider_payment_id)
       values ($1, $2, $3, $4, 'Игровой запас', 699, 40000, 'pending', 'yookassa', $5)`,
      [localId, userId, packageId, randomUUID(), attached ? externalId : null],
    );
    providerPayments.set(externalId, {
      id: externalId,
      status: 'succeeded',
      amount: { value: '699.00', currency: 'RUB' },
      metadata: { local_payment_id: localId },
    });
    return { localId, externalId };
  }

  beforeEach(async () => {
    getPayment.mockClear();
    providerPayments.clear();
    await app.pg.query('delete from currency_ledger');
    await app.pg.query('delete from payments');
    await app.pg.query('delete from user_currency_account');
    await app.pg.query(
      'insert into user_currency_account (user_id, balance, reserved_balance) values ($1, 100, 25)',
      [userId],
    );
    await app.pg.query(
      'update coin_packages set price_rub = 699, coin_amount = 40000, is_active = true where id = $1',
      [packageId],
    );
    const seeded = await seedPayment();
    paymentId = seeded.localId;
    providerId = seeded.externalId;
  });

  afterAll(async () => {
    await app?.close();
    await noProviderApp?.close();
  });

  const sendWebhook = (
    id = providerId,
    event = 'payment.succeeded',
    object: Record<string, unknown> = {},
  ) =>
    app.inject({
      method: 'POST',
      url: '/bank/payments/yookassa/webhook',
      payload: { type: 'notification', event, object: { id, ...object } },
    });

  const paymentState = async (id = paymentId) =>
    (
      await app.pg.query(
        'select status, provider_payment_id, paid_at, updated_at from payments where id = $1',
        [id],
      )
    ).rows[0];

  const accountState = async () =>
    (
      await app.pg.query(
        'select balance, reserved_balance from user_currency_account where user_id = $1',
        [userId],
      )
    ).rows[0];

  async function expectUncredited(status = 'pending') {
    expect(await accountState()).toEqual({ balance: 100, reserved_balance: 25 });
    expect((await app.pg.query('select id from currency_ledger')).rowCount).toBe(0);
    expect(await paymentState()).toMatchObject({ status, paid_at: null });
  }

  it('credits the verified provider result and ignores forged event, amount and metadata fields', async () => {
    const response = await sendWebhook(providerId, 'payment.canceled', {
      status: 'canceled',
      amount: { value: '0.01', currency: 'USD' },
      metadata: { local_payment_id: randomUUID() },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    expect(await accountState()).toEqual({ balance: 40100, reserved_balance: 25 });
    expect(await paymentState()).toMatchObject({ status: 'paid', paid_at: expect.any(Date) });
    expect(
      (
        await app.pg.query(
          `select user_id, reason, available_delta, reserved_delta, balance_after,
                  reserved_after, payment_id, metadata from currency_ledger`,
        )
      ).rows,
    ).toEqual([
      {
        user_id: userId,
        reason: 'purchase',
        available_delta: 40000,
        reserved_delta: 0,
        balance_after: 40100,
        reserved_after: 25,
        payment_id: paymentId,
        metadata: expect.objectContaining({ provider_payment_id: providerId }),
      },
    ]);
  });

  it('uses the saved coins and ruble price after a package changes and becomes inactive', async () => {
    await app.pg.query(
      'update coin_packages set price_rub = 1, coin_amount = 999999, is_active = false where id = $1',
      [packageId],
    );
    expect((await sendWebhook()).statusCode).toBe(200);
    expect(await accountState()).toEqual({ balance: 40100, reserved_balance: 25 });
  });

  it('does not change paid timestamps or create another credit on duplicate delivery', async () => {
    expect((await sendWebhook()).statusCode).toBe(200);
    const paid = await paymentState();
    expect((await sendWebhook()).statusCode).toBe(200);
    expect(await paymentState()).toEqual(paid);
    expect(await accountState()).toEqual({ balance: 40100, reserved_balance: 25 });
    expect((await app.pg.query('select id from currency_ledger')).rowCount).toBe(1);
  });

  it('credits exactly once under eight concurrent duplicate deliveries', async () => {
    const responses = await Promise.all(Array.from({ length: 8 }, () => sendWebhook()));
    expect(responses.map((response) => response.statusCode)).toEqual(Array(8).fill(200));
    expect(await accountState()).toEqual({ balance: 40100, reserved_balance: 25 });
    expect((await app.pg.query('select id from currency_ledger')).rowCount).toBe(1);
  });

  it('retains both credits when distinct payments settle concurrently for the same buyer', async () => {
    const second = await seedPayment();
    const responses = await Promise.all([sendWebhook(), sendWebhook(second.externalId)]);
    expect(responses.map((response) => response.statusCode)).toEqual([200, 200]);
    expect(await accountState()).toEqual({ balance: 80100, reserved_balance: 25 });
    expect((await app.pg.query('select id from currency_ledger')).rowCount).toBe(2);
  });

  it('creates a missing account inside settlement', async () => {
    await app.pg.query('delete from user_currency_account where user_id = $1', [userId]);
    expect((await sendWebhook()).statusCode).toBe(200);
    expect(await accountState()).toEqual({ balance: 40000, reserved_balance: 0 });
  });

  it('rejects packages above the approved maximum at the database boundary', async () => {
    await expect(
      app.pg.query('update coin_packages set coin_amount = 100000001 where id = $1', [packageId]),
    ).rejects.toMatchObject({ code: '23514' });
    await app.pg.query('update coin_packages set coin_amount = 100000000 where id = $1', [
      packageId,
    ]);
    const catalog = await app.inject({ method: 'GET', url: '/bank/packages' });
    expect(catalog.statusCode).toBe(200);
    expect(catalog.json().packages.find((p: { id: string }) => p.id === packageId).coinAmount).toBe(
      100000000,
    );
  });

  it('credits exactly up to the existing int32 balance limit', async () => {
    await app.pg.query('update user_currency_account set balance = 2147443647 where user_id = $1', [
      userId,
    ]);
    expect((await sendWebhook()).statusCode).toBe(200);
    expect(await accountState()).toEqual({ balance: 2147483647, reserved_balance: 25 });
    expect((await app.pg.query('select balance_after from currency_ledger')).rows).toEqual([
      { balance_after: 2147483647 },
    ]);
  });

  it('leaves a succeeded provider payment retryable without partial credit when balance headroom is exhausted', async () => {
    await app.pg.query('update user_currency_account set balance = 2147443648 where user_id = $1', [
      userId,
    ]);
    await app.pg.query('update payments set provider_payment_id = null where id = $1', [paymentId]);
    const response = await sendWebhook();
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('payment_balance_capacity');
    expect(await accountState()).toEqual({ balance: 2147443648, reserved_balance: 25 });
    expect(await paymentState()).toMatchObject({
      status: 'pending',
      paid_at: null,
      provider_payment_id: null,
    });
    expect((await app.pg.query('select id from currency_ledger')).rowCount).toBe(0);
    await app.pg.query('update user_currency_account set balance = 100 where user_id = $1', [
      userId,
    ]);
    expect((await sendWebhook()).statusCode).toBe(200);
    expect(await accountState()).toEqual({ balance: 40100, reserved_balance: 25 });
    expect((await app.pg.query('select id from currency_ledger')).rowCount).toBe(1);
  });

  it.each(['pending', 'waiting_for_capture'])(
    'does not credit provider status %s',
    async (status) => {
      providerPayments.get(providerId)!.status = status;
      expect((await sendWebhook()).statusCode).toBe(200);
      await expectUncredited();
    },
  );

  it('cancels a pending payment even when the incoming notification claims success', async () => {
    providerPayments.get(providerId)!.status = 'canceled';
    expect((await sendWebhook()).statusCode).toBe(200);
    await expectUncredited('canceled');
    expect((await sendWebhook()).statusCode).toBe(200);
    await expectUncredited('canceled');
  });

  it.each(['pending', 'waiting_for_capture', 'canceled'])(
    'does not regress paid state for later provider status %s',
    async (status) => {
      expect((await sendWebhook()).statusCode).toBe(200);
      const paid = await paymentState();
      providerPayments.get(providerId)!.status = status;
      expect((await sendWebhook()).statusCode).toBe(200);
      expect(await paymentState()).toEqual(paid);
      expect(await accountState()).toEqual({ balance: 40100, reserved_balance: 25 });
      expect((await app.pg.query('select id from currency_ledger')).rowCount).toBe(1);
    },
  );

  it('does not regress paid state when an older provider read finishes after success', async () => {
    let releaseRead: ((value: YooKassaPayment) => void) | undefined;
    let announceRead!: () => void;
    const started = new Promise<void>((resolve) => {
      announceRead = resolve;
    });
    getPayment.mockImplementationOnce(() => {
      announceRead();
      return new Promise<YooKassaPayment>((resolve) => {
        releaseRead = resolve;
      });
    });
    const older = sendWebhook().then((response) => {
      announceRead();
      return response;
    });
    await started;
    if (!releaseRead) {
      expect((await older).statusCode).toBe(200);
      return;
    }
    expect((await sendWebhook()).statusCode).toBe(200);
    releaseRead({ ...providerPayments.get(providerId)!, status: 'canceled' });
    expect((await older).statusCode).toBe(200);
    expect(await paymentState()).toMatchObject({ status: 'paid' });
    expect(await accountState()).toEqual({ balance: 40100, reserved_balance: 25 });
  });

  it.each(['canceled', 'failed', 'refunded'])(
    'does not credit a locally terminal %s payment',
    async (status) => {
      await app.pg.query('update payments set status = $2 where id = $1', [paymentId, status]);
      expect((await sendWebhook()).statusCode).toBe(200);
      await expectUncredited(status);
    },
  );

  it.each([
    ['different provider ID', { id: 'another-provider-payment' }],
    ['different local metadata', { metadata: { local_payment_id: randomUUID() } }],
    ['missing local metadata', { metadata: {} }],
    ['malformed local metadata', { metadata: { local_payment_id: 'not-a-uuid' } }],
    ['different price', { amount: { value: '698.00', currency: 'RUB' } }],
    ['different currency', { amount: { value: '699.00', currency: 'USD' } }],
    ['missing decimal digits', { amount: { value: '699', currency: 'RUB' } }],
    ['one decimal digit', { amount: { value: '699.0', currency: 'RUB' } }],
    ['three decimal digits', { amount: { value: '699.000', currency: 'RUB' } }],
    ['exponent amount', { amount: { value: '6.99e2', currency: 'RUB' } }],
    ['unsupported status', { status: 'refunded' }],
  ])('rejects %s from the provider without any local mutation', async (_label, override) => {
    const before = await paymentState();
    providerPayments.set(providerId, { ...providerPayments.get(providerId)!, ...override });
    expect((await sendWebhook()).statusCode).toBe(409);
    await expectUncredited();
    expect(await paymentState()).toEqual(before);
  });

  it('rejects a provider ID already different on the matching local payment', async () => {
    await app.pg.query('update payments set provider_payment_id = $2 where id = $1', [
      paymentId,
      'previous-provider-id',
    ]);
    expect((await sendWebhook()).statusCode).toBe(409);
    await expectUncredited();
    expect(await paymentState()).toMatchObject({ provider_payment_id: 'previous-provider-id' });
  });

  it('attaches a verified early webhook and credits once before creation has saved the provider ID', async () => {
    await app.pg.query('update payments set provider_payment_id = null where id = $1', [paymentId]);
    const responses = await Promise.all([sendWebhook(), sendWebhook()]);
    expect(responses.map((response) => response.statusCode)).toEqual([200, 200]);
    expect(await paymentState()).toMatchObject({ provider_payment_id: providerId, status: 'paid' });
    expect(await accountState()).toEqual({ balance: 40100, reserved_balance: 25 });
    expect((await app.pg.query('select id from currency_ledger')).rowCount).toBe(1);
  });

  it('does not attach a mismatched early webhook to an unattached payment', async () => {
    await app.pg.query('update payments set provider_payment_id = null where id = $1', [paymentId]);
    providerPayments.get(providerId)!.amount.value = '1.00';
    expect((await sendWebhook()).statusCode).toBe(409);
    await expectUncredited();
    expect(await paymentState()).toMatchObject({ provider_payment_id: null });
  });

  it('rolls back early attachment when the provider ID is already bound to another local payment', async () => {
    await app.pg.query('update payments set provider_payment_id = null where id = $1', [paymentId]);
    const second = await seedPayment();
    await app.pg.query('update payments set provider_payment_id = $2 where id = $1', [
      second.localId,
      providerId,
    ]);
    expect((await sendWebhook()).statusCode).toBe(409);
    await expectUncredited();
    expect(await paymentState()).toMatchObject({ provider_payment_id: null });
  });

  it('refuses manual and legacy payments without coin snapshots', async () => {
    await app.pg.query(
      "update payments set provider = 'manual', coin_amount = null where id = $1",
      [paymentId],
    );
    expect((await sendWebhook()).statusCode).toBe(409);
    await expectUncredited();
  });

  it('leaves a failed provider lookup retryable and credits once after recovery', async () => {
    getPayment.mockRejectedValueOnce(new Error('private provider response / secret'));
    const response = await sendWebhook();
    expect(response.statusCode).toBe(502);
    expect(response.body).not.toContain('private provider');
    await expectUncredited();
    expect((await sendWebhook()).statusCode).toBe(200);
    expect((await sendWebhook()).statusCode).toBe(200);
    expect(await accountState()).toEqual({ balance: 40100, reserved_balance: 25 });
    expect((await app.pg.query('select id from currency_ledger')).rowCount).toBe(1);
  });

  it('rolls back account credit, provider attachment and status if the ledger insert fails', async () => {
    await app.pg.query('update payments set provider_payment_id = null where id = $1', [paymentId]);
    await app.pg
      .query(`create function test_reject_purchase() returns trigger language plpgsql as $$
      begin raise exception 'test ledger failure'; end $$`);
    await app.pg.query(
      'create trigger test_reject_purchase before insert on currency_ledger for each row execute function test_reject_purchase()',
    );
    try {
      expect((await sendWebhook()).statusCode).toBe(500);
      await expectUncredited();
      expect(await paymentState()).toMatchObject({ provider_payment_id: null });
    } finally {
      await app.pg.query('drop trigger test_reject_purchase on currency_ledger');
      await app.pg.query('drop function test_reject_purchase()');
    }
    expect((await sendWebhook()).statusCode).toBe(200);
    expect(await accountState()).toEqual({ balance: 40100, reserved_balance: 25 });
    expect((await app.pg.query('select id from currency_ledger')).rowCount).toBe(1);
  });

  it('requires a supported notification with a nonempty provider ID', async () => {
    for (const payload of [
      {},
      { type: 'notification', event: 'refund.succeeded', object: { id: providerId } },
      { type: 'notification', event: 'payment.succeeded', object: { id: '' } },
    ]) {
      const response = await app.inject({
        method: 'POST',
        url: '/bank/payments/yookassa/webhook',
        payload,
      });
      expect(response.statusCode).toBe(400);
    }
    await expectUncredited();
  });

  it('returns retryable unavailable when the provider is not configured', async () => {
    const response = await noProviderApp.inject({
      method: 'POST',
      url: '/bank/payments/yookassa/webhook',
      payload: { type: 'notification', event: 'payment.succeeded', object: { id: providerId } },
    });
    expect(response.statusCode).toBe(503);
    await expectUncredited();
  });

  it('returns only the owner local status without consulting or mutating provider state', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/bank/payments/${paymentId}`,
      headers: { authorization },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'pending' });
    await expectUncredited();
    expect(getPayment).not.toHaveBeenCalled();
    await app.pg.query("update payments set status = 'paid' where id = $1", [paymentId]);
    const paid = await noProviderApp.inject({
      method: 'GET',
      url: `/bank/payments/${paymentId}`,
      headers: { authorization },
    });
    expect(paid.statusCode).toBe(200);
    expect(paid.json()).toEqual({ status: 'paid' });
  });

  it('requires authentication and hides other users and absent payment IDs identically', async () => {
    expect(
      (await app.inject({ method: 'GET', url: `/bank/payments/${paymentId}` })).statusCode,
    ).toBe(401);
    const other = await app.inject({
      method: 'GET',
      url: `/bank/payments/${paymentId}`,
      headers: { authorization: otherAuthorization },
    });
    const absent = await app.inject({
      method: 'GET',
      url: `/bank/payments/${randomUUID()}`,
      headers: { authorization },
    });
    expect(other.statusCode).toBe(404);
    expect(absent.statusCode).toBe(404);
    expect(other.json()).toEqual(absent.json());
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/bank/payments/invalid',
          headers: { authorization },
        })
      ).statusCode,
    ).toBe(400);
  });
});
