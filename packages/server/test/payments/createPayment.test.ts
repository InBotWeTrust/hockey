import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createJwt } from '../../src/auth/jwt.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { createPool } from '../../src/db/pool.js';
import { createCoinPayment } from '../../src/payments/service.js';
import { createYooKassaClient } from '../../src/payments/yookassaClient.js';
import type {
  CreateYooKassaPaymentInput,
  YooKassaPayment,
} from '../../src/payments/yookassaClient.js';
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
const secret = 'access-secret-at-least-16-chars';

describe.skipIf(!hasIntegrationEnv)('coin payment creation', () => {
  let app: FastifyInstance;
  let noProviderApp: FastifyInstance;
  let packageId: string;
  const userId = randomUUID();
  const secondUserId = randomUUID();
  let authorization: string;
  let secondAuthorization: string;
  const createPayment = vi.fn(
    async (input: CreateYooKassaPaymentInput, _key: string): Promise<YooKassaPayment> => {
      // A separate pool query proves the snapshot committed before the network request.
      const saved = await app.pg.query(
        'select amount_rub, coin_amount from payments where id = $1',
        [input.localPaymentId],
      );
      expect(saved.rows).toEqual([{ amount_rub: 699, coin_amount: '40000' }]);
      return {
        id: `provider-${input.localPaymentId}`,
        status: 'pending',
        amount: { value: '699.00', currency: 'RUB' },
        metadata: { local_payment_id: input.localPaymentId },
        confirmation: { type: 'redirect', confirmationUrl: 'https://yookassa.ru/checkout/test' },
      };
    },
  );

  beforeAll(async () => {
    const pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);
    await pool.query(
      "insert into users (id, display_name, timezone) values ($1, 'Buyer', 'Europe/Moscow'), ($2, 'Other buyer', 'Europe/Moscow')",
      [userId, secondUserId],
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
      JWT_SECRET: secret,
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
        createPayment,
        getPayment: async () => {
          throw new Error('unused');
        },
      },
    });
    noProviderApp = await buildApp({ config });
    const jwt = createJwt({ accessSecret: secret, refreshSecret: config.REFRESH_SECRET });
    authorization = `Bearer ${await jwt.issueAccessToken({ sub: userId })}`;
    secondAuthorization = `Bearer ${await jwt.issueAccessToken({ sub: secondUserId })}`;
  }, 30000);

  beforeEach(async () => {
    createPayment.mockClear();
    await app.pg.query('delete from payments');
    await app.pg.query('delete from user_currency_account');
    await app.pg.query(
      "update coin_packages set title = 'Игровой запас', price_rub = 699, coin_amount = 40000, is_active = true where id = $1",
      [packageId],
    );
  });
  afterAll(async () => {
    await app?.close();
    await noProviderApp?.close();
  });

  const submit = (
    attemptId = randomUUID(),
    body: Record<string, unknown> = {},
    auth = authorization,
  ) =>
    app.inject({
      method: 'POST',
      url: '/bank/payments',
      headers: { authorization: auth },
      payload: { packageId, attemptId, ...body },
    });

  it('requires an authenticated existing user', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/bank/payments',
      payload: { packageId, attemptId: randomUUID() },
    });
    expect(response.statusCode).toBe(401);
    expect(createPayment).not.toHaveBeenCalled();
  });

  it('commits server-priced immutable snapshots before contacting the provider', async () => {
    const response = await submit();
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      paymentId: expect.any(String),
      status: 'pending',
      confirmationUrl: 'https://yookassa.ru/checkout/test',
    });
    expect(createPayment).toHaveBeenCalledWith(
      { amountRub: 699, description: 'Игровой запас', localPaymentId: response.json().paymentId },
      response.json().paymentId,
    );
    await app.pg.query('update coin_packages set price_rub = 1, coin_amount = 2 where id = $1', [
      packageId,
    ]);
    expect(
      (
        await app.pg.query(
          'select user_id, title, amount_rub, coin_amount, provider_payment_id from payments',
        )
      ).rows,
    ).toEqual([
      {
        user_id: userId,
        title: 'Игровой запас',
        amount_rub: 699,
        coin_amount: '40000',
        provider_payment_id: `provider-${response.json().paymentId}`,
      },
    ]);
  });

  it('rejects client-supplied amounts and invalid ids', async () => {
    expect((await submit(randomUUID(), { amountRub: 1, coinAmount: 999999 })).statusCode).toBe(400);
    expect((await submit('invalid')).statusCode).toBe(400);
    expect(createPayment).not.toHaveBeenCalled();
  });

  it('rejects inactive and missing packages before inserting an attempt', async () => {
    await app.pg.query('update coin_packages set is_active = false where id = $1', [packageId]);
    expect((await submit()).statusCode).toBe(409);
    expect((await submit(randomUUID(), { packageId: randomUUID() })).statusCode).toBe(409);
    expect((await app.pg.query('select id from payments')).rowCount).toBe(0);
    expect(createPayment).not.toHaveBeenCalled();
  });

  it('reuses a completed attempt even when the package has since changed or become inactive', async () => {
    const attempt = randomUUID();
    const first = await submit(attempt);
    await app.pg.query('update coin_packages set is_active = false, price_rub = 1 where id = $1', [
      packageId,
    ]);
    const second = await submit(attempt);
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual(first.json());
    expect(createPayment).toHaveBeenCalledTimes(1);
  });

  it('serializes concurrent requests to one local attempt and one provider creation', async () => {
    const attempt = randomUUID();
    const responses = await Promise.all([submit(attempt), submit(attempt), submit(attempt)]);
    expect(responses.map((response) => response.statusCode)).toEqual([200, 200, 200]);
    expect(new Set(responses.map((response) => response.json().paymentId)).size).toBe(1);
    expect((await app.pg.query('select id from payments')).rowCount).toBe(1);
    expect(createPayment).toHaveBeenCalledTimes(1);
  });

  it('scopes attempt ids to the authenticated buyer', async () => {
    const attempt = randomUUID();
    const first = await submit(attempt);
    const second = await submit(attempt, {}, secondAuthorization);
    expect(second.statusCode).toBe(200);
    expect(second.json().paymentId).not.toBe(first.json().paymentId);
    expect(createPayment).toHaveBeenCalledTimes(2);
  });

  it('deduplicates equivalent UUID spellings rather than treating uppercase as another attempt', async () => {
    const attempt = randomUUID();
    const first = await submit(attempt);
    const second = await submit(attempt.toUpperCase(), { packageId: packageId.toUpperCase() });
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual(first.json());
    expect(createPayment).toHaveBeenCalledTimes(1);
  });

  it('rejects reusing an attempt id for another package', async () => {
    const attempt = randomUUID();
    await submit(attempt);
    expect((await submit(attempt, { packageId: randomUUID() })).statusCode).toBe(409);
    expect(createPayment).toHaveBeenCalledTimes(1);
  });

  it('retries an uncertain provider failure using the saved snapshot and identical provider key', async () => {
    createPayment.mockRejectedValueOnce(new Error('private upstream detail'));
    const attempt = randomUUID();
    const first = await submit(attempt);
    expect(first.statusCode).toBe(502);
    expect(first.body).not.toContain('private upstream detail');
    const row = (await app.pg.query('select id from payments')).rows[0];
    await app.pg.query(
      'update coin_packages set price_rub = 1, coin_amount = 2, is_active = false where id = $1',
      [packageId],
    );
    const second = await submit(attempt);
    expect(second.statusCode).toBe(200);
    expect(second.json().paymentId).toBe(row.id);
    expect(createPayment.mock.calls.map((call) => call[1])).toEqual([row.id, row.id]);
    expect(createPayment.mock.calls[1]?.[0].amountRub).toBe(699);
  });

  it('does not repeat uncertain provider creation after the idempotency safety window', async () => {
    createPayment.mockRejectedValueOnce(new Error('timeout'));
    const attempt = randomUUID();
    await submit(attempt);
    await app.pg.query(
      "update payments set created_at = now() - interval '23 hours' where purchase_attempt_id = $1",
      [attempt],
    );
    const response = await submit(attempt);
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('payment_attempt_expired');
    expect(createPayment).toHaveBeenCalledTimes(1);
  });

  it('releases the database client and advisory lock after provider timeout and safely retries the same payment', async () => {
    const pool = createPool(getTestUrls().databaseUrl, { max: 1, connectionTimeoutMillis: 500 });
    const attempts: RequestInit[] = [];
    let cancelPendingFetch: (() => void) | undefined;
    const provider = createYooKassaClient({
      shopId: 'fixture-shop',
      secretKey: 'fixture-secret',
      returnUrl: 'https://example.test/return',
      requestTimeoutMs: 30,
      fetchImpl: async (_url, init) => {
        attempts.push(init!);
        if (attempts.length === 1) {
          return new Promise<Response>((_resolve, reject) => {
            cancelPendingFetch = () => reject(new Error('aborted pending network request'));
            init?.signal?.addEventListener('abort', cancelPendingFetch, { once: true });
          });
        }
        const request = JSON.parse(String(init?.body));
        return new Response(
          JSON.stringify({
            id: 'provider-timeout-retry',
            status: 'pending',
            amount: request.amount,
            metadata: request.metadata,
            confirmation: {
              type: 'redirect',
              confirmation_url: 'https://yookassa.ru/checkout/retry',
            },
          }),
          { status: 200 },
        );
      },
    });
    const attemptId = randomUUID();
    const first = createCoinPayment(pool, provider, userId, packageId, attemptId).catch(
      (error) => error as Error,
    );
    try {
      await delay(200);
      expect(attempts[0]?.signal?.aborted).toBe(true);
      await expect(first).resolves.toMatchObject({
        code: 'payment_provider_unavailable',
        statusCode: 502,
      });
      // A max-one pool query proves the timed-out service released its connection.
      const state = await pool.query(
        "select id, provider_payment_id, (select count(*)::int from pg_locks where pid = pg_backend_pid() and locktype = 'advisory') as advisory_locks from payments where purchase_attempt_id = $1",
        [attemptId],
      );
      expect(state.rows).toEqual([
        { id: expect.any(String), provider_payment_id: null, advisory_locks: 0 },
      ]);
      const paymentId = state.rows[0].id;
      const retried = await createCoinPayment(pool, provider, userId, packageId, attemptId);
      expect(retried).toEqual({
        paymentId,
        status: 'pending',
        confirmationUrl: 'https://yookassa.ru/checkout/retry',
      });
      expect(attempts).toHaveLength(2);
      expect(
        attempts.map((request) => new Headers(request.headers).get('Idempotence-Key')),
      ).toEqual([paymentId, paymentId]);
      expect(
        attempts.map((request) => JSON.parse(String(request.body)).metadata.local_payment_id),
      ).toEqual([paymentId, paymentId]);
    } finally {
      cancelPendingFetch?.();
      await first;
      await pool.end();
    }
  });

  it('rejects an attempt before provider creation when its snapshot cannot fit the current balance', async () => {
    await app.pg.query(
      'insert into user_currency_account (user_id, balance) values ($1, 2147443648)',
      [userId],
    );
    const response = await submit();
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('payment_balance_capacity');
    expect(createPayment).not.toHaveBeenCalled();
    expect(
      (await app.pg.query('select balance from user_currency_account where user_id = $1', [userId]))
        .rows,
    ).toEqual([{ balance: 2147443648 }]);
  });

  it('allows creation at the exact balance capacity boundary', async () => {
    await app.pg.query(
      'insert into user_currency_account (user_id, balance) values ($1, 2147443647)',
      [userId],
    );
    expect((await submit()).statusCode).toBe(200);
    expect(createPayment).toHaveBeenCalledTimes(1);
  });

  it('rechecks headroom using the immutable saved coin amount on provider retries', async () => {
    createPayment.mockRejectedValueOnce(new Error('provider unavailable'));
    const attempt = randomUUID();
    expect((await submit(attempt)).statusCode).toBe(502);
    await app.pg.query('update coin_packages set coin_amount = 1 where id = $1', [packageId]);
    await app.pg.query(
      'insert into user_currency_account (user_id, balance) values ($1, 2147483646)',
      [userId],
    );
    const retry = await submit(attempt);
    expect(retry.statusCode).toBe(409);
    expect(retry.json().error.code).toBe('payment_balance_capacity');
    expect(createPayment).toHaveBeenCalledTimes(1);
  });

  it('returns unavailable when YooKassa is not configured without creating a row', async () => {
    const response = await noProviderApp.inject({
      method: 'POST',
      url: '/bank/payments',
      headers: { authorization },
      payload: { packageId, attemptId: randomUUID() },
    });
    expect(response.statusCode).toBe(503);
    expect((await app.pg.query('select id from payments')).rowCount).toBe(0);
  });

  it('preserves legacy manual rows with nullable coin payment fields', async () => {
    const result = await app.pg.query(
      "insert into payments (title, amount_rub, status) values ('Legacy', 0, 'pending') returning coin_package_id, coin_amount, purchase_attempt_id",
    );
    expect(result.rows).toEqual([
      { coin_package_id: null, coin_amount: null, purchase_attempt_id: null },
    ]);
  });
});
