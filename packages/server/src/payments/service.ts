import type { Pool } from 'pg';
import { z } from 'zod';
import { AppError } from '../plugins/errors.js';
import { MAX_COIN_PACKAGE_AMOUNT } from './catalog.js';
import type { YooKassaClient } from './yookassaClient.js';

const MAX_CURRENCY_BALANCE = 2_147_483_647;

function paymentBalanceCapacity(): AppError {
  return new AppError(
    'payment_balance_capacity',
    'Недостаточно места на балансе для этого пополнения',
    409,
  );
}

interface PaymentRow {
  id: string;
  coin_package_id: string | null;
  title: string;
  amount_rub: number;
  coin_amount: string | null;
  status: string;
  provider_payment_id: string | null;
  confirmation_url: string | null;
  attempt_expired: boolean;
}

export interface CoinPaymentDTO {
  paymentId: string;
  status: string;
  confirmationUrl: string | null;
}

export async function createCoinPayment(
  pool: Pool,
  provider: Pick<YooKassaClient, 'createPayment'>,
  userId: string,
  packageId: string,
  attemptId: string,
): Promise<CoinPaymentDTO> {
  // PostgreSQL UUID equality is case-insensitive; the advisory key must agree.
  userId = userId.toLowerCase();
  packageId = packageId.toLowerCase();
  attemptId = attemptId.toLowerCase();
  const client = await pool.connect();
  const lockKeys = [`coin-payment:${userId}`, attemptId];
  let locked = false;
  try {
    // Session lock spans autocommit statements and the external request. A committed
    // snapshot survives a process crash, unlike an insert in a long transaction.
    await client.query('select pg_advisory_lock(hashtext($1), hashtext($2))', lockKeys);
    locked = true;
    const existing = await client.query<PaymentRow>(
      `select *, created_at <= now() - interval '23 hours' as attempt_expired
       from payments where user_id = $1 and purchase_attempt_id = $2`,
      [userId, attemptId],
    );
    let payment = existing.rows[0];
    if (payment && payment.coin_package_id !== packageId) {
      throw new AppError(
        'payment_attempt_conflict',
        'Попытка оплаты относится к другому пакету',
        409,
      );
    }
    if (!payment) {
      const inserted = await client.query<PaymentRow>(
        `insert into payments
          (user_id, coin_package_id, purchase_attempt_id, title, amount_rub, coin_amount, status, provider)
         select $1, id, $2, title, price_rub, coin_amount, 'pending', 'yookassa'
         from coin_packages where id = $3 and is_active = true
         returning *, false as attempt_expired`,
        [userId, attemptId, packageId],
      );
      payment = inserted.rows[0];
      if (!payment) {
        throw new AppError('coin_package_unavailable', 'Этот пакет больше недоступен', 409);
      }
    }

    if (!payment.provider_payment_id) {
      // YooKassa retains idempotency keys for 24h. Beyond this conservative
      // window an uncertain request must be reconciled, never silently recreated.
      if (payment.attempt_expired) {
        throw new AppError('payment_attempt_expired', 'Статус этой оплаты требует проверки', 409);
      }
      const coins = Number(payment.coin_amount);
      if (!Number.isSafeInteger(coins) || coins <= 0 || coins > MAX_COIN_PACKAGE_AMOUNT) {
        throw new AppError('coin_package_unavailable', 'Этот пакет больше недоступен', 409);
      }
      const account = (
        await client.query<{ balance: number }>(
          'select balance from user_currency_account where user_id = $1',
          [userId],
        )
      ).rows[0];
      // Recheck saved terms on retries. Settlement repeats this under row locks
      // because other rewards/payments can consume headroom after creation.
      if ((account?.balance ?? 0) > MAX_CURRENCY_BALANCE - coins) {
        throw paymentBalanceCapacity();
      }
      let result;
      try {
        result = await provider.createPayment(
          { amountRub: payment.amount_rub, description: payment.title, localPaymentId: payment.id },
          payment.id,
        );
      } catch {
        throw new AppError(
          'payment_provider_unavailable',
          'Не удалось получить ответ платёжного сервиса. Повторите попытку',
          502,
        );
      }
      const attached = await client.query<PaymentRow>(
        `update payments set provider_payment_id = $2, confirmation_url = $3, updated_at = now()
         where id = $1 and (provider_payment_id is null or provider_payment_id = $2)
         returning *`,
        [payment.id, result.id, result.confirmation?.confirmationUrl ?? null],
      );
      const attachedPayment = attached.rows[0];
      if (!attachedPayment) {
        throw new AppError('payment_provider_conflict', 'Данные платежа требуют проверки', 409);
      }
      payment = attachedPayment;
      // Creation never credits coins or marks a payment paid; reconciliation owns settlement.
    }
    return {
      paymentId: payment.id,
      status: payment.status,
      confirmationUrl: payment.confirmation_url,
    };
  } finally {
    let destroy = !locked;
    if (locked) {
      try {
        await client.query('select pg_advisory_unlock(hashtext($1), hashtext($2))', lockKeys);
      } catch {
        // Never return a possibly locked connection to the pool.
        destroy = true;
      }
    }
    client.release(destroy);
  }
}

interface SettlementPaymentRow {
  id: string;
  user_id: string | null;
  amount_rub: number;
  coin_amount: string | null;
  provider: string;
  provider_payment_id: string | null;
  status: string;
}

function paymentMismatch(): AppError {
  return new AppError('payment_mismatch', 'Данные платежа требуют проверки', 409);
}

export async function reconcileYooKassaPayment(
  pool: Pool,
  provider: Pick<YooKassaClient, 'getPayment'>,
  providerPaymentId: string,
): Promise<void> {
  // Notification fields only identify a payment to re-read. No unverified
  // amount, metadata or status may enter the settlement transaction.
  let verified;
  try {
    verified = await provider.getPayment(providerPaymentId);
  } catch {
    throw new AppError('payment_provider_unavailable', 'Платёжный сервис временно недоступен', 502);
  }
  const localId = z.string().uuid().safeParse(verified.metadata.local_payment_id);
  if (
    verified.id !== providerPaymentId ||
    !localId.success ||
    !['pending', 'waiting_for_capture', 'succeeded', 'canceled'].includes(verified.status)
  ) {
    throw paymentMismatch();
  }

  const owner = (
    await pool.query<{ user_id: string | null }>('select user_id from payments where id = $1', [
      localId.data,
    ])
  ).rows[0];
  if (!owner?.user_id) throw paymentMismatch();

  const client = await pool.connect();
  try {
    await client.query('begin');
    // Preserve the shared economy lock order, including account creation.
    const user = await client.query('select id from users where id = $1 for update', [
      owner.user_id,
    ]);
    const payment = (
      await client.query<SettlementPaymentRow>('select * from payments where id = $1 for update', [
        localId.data,
      ])
    ).rows[0];
    if (
      !user.rowCount ||
      !payment ||
      payment.user_id !== owner.user_id ||
      payment.id !== localId.data ||
      payment.provider !== 'yookassa' ||
      payment.coin_amount === null ||
      (payment.provider_payment_id !== null && payment.provider_payment_id !== verified.id) ||
      verified.amount.currency !== 'RUB' ||
      verified.amount.value !== `${payment.amount_rub}.00`
    ) {
      throw paymentMismatch();
    }
    // Terminal local state never regresses, even if an older provider read
    // completes after a newer notification has settled this payment.
    if (payment.status !== 'pending') {
      await client.query('commit');
      return;
    }
    if (payment.provider_payment_id === null) {
      // A verified callback can arrive before createPayment attaches the ID,
      // or after that request crashes. The unique provider index guards binding.
      await client.query(
        'update payments set provider_payment_id = $2, updated_at = now() where id = $1',
        [payment.id, verified.id],
      );
    }
    if (verified.status === 'canceled') {
      await client.query(
        "update payments set status = 'canceled', updated_at = now() where id = $1",
        [payment.id],
      );
    } else if (verified.status === 'succeeded') {
      await client.query(
        'insert into user_currency_account (user_id) values ($1) on conflict do nothing',
        [owner.user_id],
      );
      await client.query(
        'select balance, reserved_balance from user_currency_account where user_id = $1 for update',
        [owner.user_id],
      );
      const account = (
        await client.query<{ balance: number; reserved_balance: number }>(
          `update user_currency_account set balance = balance + $2::bigint, updated_at = now()
           where user_id = $1 and balance <= ${MAX_CURRENCY_BALANCE} - $2::bigint
           returning balance, reserved_balance`,
          [owner.user_id, payment.coin_amount],
        )
      ).rows[0];
      if (!account) throw paymentBalanceCapacity();
      await client.query(
        `insert into currency_ledger
          (user_id, reason, available_delta, reserved_delta, balance_after, reserved_after,
           payment_id, metadata)
         values ($1, 'purchase', $2, 0, $3, $4, $5, $6)`,
        [
          owner.user_id,
          payment.coin_amount,
          account.balance,
          account.reserved_balance,
          payment.id,
          JSON.stringify({ provider_payment_id: verified.id }),
        ],
      );
      await client.query(
        "update payments set status = 'paid', paid_at = now(), updated_at = now() where id = $1",
        [payment.id],
      );
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
