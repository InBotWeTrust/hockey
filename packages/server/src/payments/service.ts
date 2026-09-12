import type { Pool } from 'pg';
import { AppError } from '../plugins/errors.js';
import type { YooKassaClient } from './yookassaClient.js';

interface PaymentRow {
  id: string;
  coin_package_id: string | null;
  title: string;
  amount_rub: number;
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
         where id = $1 returning *`,
        [payment.id, result.id, result.confirmation?.confirmationUrl ?? null],
      );
      payment = attached.rows[0]!;
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
