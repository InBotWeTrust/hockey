import type { Pool, PoolClient } from 'pg';
import type { VisitorSettings } from '@hockey/game-core';
import { AppError } from '../plugins/errors.js';
import {
  extendVisitorCard,
  messageSource,
  visitorSnapshot,
  type VisitorAccount,
} from './visitorRules.js';

interface AccountRow {
  purchased_at: Date | null;
  expires_at: Date | null;
  paid_messages: number;
  messages_used: number;
  games_used: Record<string, number>;
  day_started_at: Date;
  reset_at: Date;
}
type Receipt = {
  kind: string;
  character_id: string | null;
  source: string | null;
  status: string;
  day_started_at: Date | null;
  payload: unknown;
};
export async function visitorTransaction<T>(
  pool: Pool,
  user: string,
  run: (db: PoolClient, now: number) => Promise<T>,
): Promise<T> {
  const db = await pool.connect();
  try {
    await db.query('begin');
    await lockVisitor(db, user);
    const now = Date.parse(
      (await db.query<{ at: string }>('select clock_timestamp()::text as at')).rows[0]!.at,
    );
    const result = await run(db, now);
    await db.query('commit');
    return result;
  } catch (error) {
    await db.query('rollback');
    throw error;
  } finally {
    db.release();
  }
}
export const lockVisitor = (db: PoolClient, user: string) =>
  db.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [`bar-visitor:${user}`]);
export async function readVisitorSettings(db: Pick<Pool, 'query'> | PoolClient) {
  const row = (
    await db.query<{ revision: number; settings: VisitorSettings }>(
      'select revision,settings from bar_visitor_settings where id=1',
    )
  ).rows[0];
  if (!row) throw new AppError('bar_unavailable', 'Бар пока недоступен.', 503);
  return row;
}
export async function visitorAccount(
  db: PoolClient,
  user: string,
  now: number,
): Promise<VisitorAccount & { dayStartedAt: string }> {
  await lockVisitor(db, user);
  // Freeze each boundary. A changed timezone is only considered after the old boundary passed.
  await db.query(
    `insert into bar_visitor_accounts(user_id,day_started_at,day_timezone,reset_at)
    select id,$2,coalesce(timezone,'UTC'),(((($2::timestamptz at time zone coalesce(timezone,'UTC'))::date+1)::timestamp) at time zone coalesce(timezone,'UTC')) from users where id=$1 on conflict do nothing`,
    [user, new Date(now)],
  );
  await db.query(
    `update bar_visitor_accounts a set messages_used=0,games_used='{}',day_started_at=$2,
    reset_at=case when a.day_timezone=coalesce(u.timezone,'UTC') then ((($2::timestamptz at time zone coalesce(u.timezone,'UTC'))::date+1)::timestamp at time zone coalesce(u.timezone,'UTC')) else greatest(a.reset_at+interval '24 hours',((($2::timestamptz at time zone coalesce(u.timezone,'UTC'))::date+1)::timestamp at time zone coalesce(u.timezone,'UTC'))) end,day_timezone=coalesce(u.timezone,'UTC')
    from users u where a.user_id=$1 and u.id=a.user_id and a.reset_at<=$2`,
    [user, new Date(now)],
  );
  const row = (
    await db.query<AccountRow>('select * from bar_visitor_accounts where user_id=$1 for update', [
      user,
    ])
  ).rows[0];
  if (!row) throw new AppError('not_found', 'Пользователь не найден.', 404);
  return {
    purchasedAt: row.purchased_at?.toISOString() ?? null,
    expiresAt: row.expires_at?.toISOString() ?? null,
    paidMessages: row.paid_messages,
    messagesUsed: row.messages_used,
    gamesUsed: row.games_used,
    resetAt: row.reset_at.toISOString(),
    dayStartedAt: row.day_started_at.toISOString(),
  };
}
export async function visitorState(db: PoolClient, user: string, now: number) {
  const account = await visitorAccount(db, user, now);
  await reclaimMessages(db, user, now);
  const fresh = await visitorAccount(db, user, now);
  const { settings } = await readVisitorSettings(db);
  return visitorSnapshot({ ...account, ...fresh }, settings, now);
}
export async function refundVisitorReceipt(
  db: PoolClient,
  user: string,
  id: string,
  kind: 'game' | 'message',
) {
  await lockVisitor(db, user);
  const row = (
    await db.query<Receipt>(
      `update bar_visitor_receipts set status='released',pending_until=null
    where user_id=$1 and id=$2 and kind=$3 and status<>'released' and ($3='game' or status='reserved') returning *`,
      [user, id, kind],
    )
  ).rows[0];
  if (!row) return;
  if (row.source === 'paid')
    await db.query(
      'update bar_visitor_accounts set paid_messages=paid_messages+1 where user_id=$1',
      [user],
    );
  if (row.source === 'daily' || row.source === 'paid')
    await db.query(
      'update bar_visitor_accounts set messages_used=greatest(0,messages_used-1) where user_id=$1 and day_started_at=$2',
      [user, row.day_started_at],
    );
  else if (kind === 'game')
    await db.query(
      `update bar_visitor_accounts set games_used=jsonb_set(games_used,array[$2],to_jsonb(greatest(0,coalesce((games_used->>$2)::integer,0)-1))) where user_id=$1 and day_started_at=$3`,
      [user, row.character_id, row.day_started_at],
    );
}
async function reclaimMessages(db: PoolClient, user: string, now: number) {
  const expired = await db.query<{ id: string }>(
    "select id from bar_visitor_receipts where user_id=$1 and kind='message' and status='reserved' and pending_until<=$2",
    [user, new Date(now)],
  );
  for (const row of expired.rows) await refundVisitorReceipt(db, user, row.id, 'message');
}
export async function reserveVisitorMessage(
  db: PoolClient,
  user: string,
  character: string,
  id: string,
  free = false,
) {
  const now = Date.parse(
    (await db.query<{ at: string }>('select clock_timestamp()::text as at')).rows[0]!.at,
  );
  const account = await visitorAccount(db, user, now);
  await reclaimMessages(db, user, now);
  const fresh = await visitorAccount(db, user, now);
  const { settings } = await readVisitorSettings(db);
  const source = free ? 'free' : messageSource(fresh, settings, now);
  if (!source) return false;
  if (source === 'paid')
    await db.query(
      'update bar_visitor_accounts set paid_messages=paid_messages-1 where user_id=$1',
      [user],
    );
  if (source === 'daily' || source === 'paid')
    await db.query(
      'update bar_visitor_accounts set messages_used=messages_used+1 where user_id=$1',
      [user],
    );
  const inserted = await db.query(
    `insert into bar_visitor_receipts(user_id,id,kind,character_id,source,status,day_started_at,pending_until)
    values($1,$2,'message',$3,$4,'reserved',$5,$6) on conflict(user_id,id) do update set source=excluded.source,status='reserved',day_started_at=excluded.day_started_at,pending_until=excluded.pending_until
    where bar_visitor_receipts.kind='message' and bar_visitor_receipts.character_id=excluded.character_id and bar_visitor_receipts.status='released' returning id`,
    [user, id, character, source, account.dayStartedAt, new Date(now + 150000)],
  );
  if (!inserted.rows.length)
    throw new AppError('conversation_stale', 'Запрос уже использован.', 409);
  return true;
}
export async function completeVisitorMessage(db: PoolClient, user: string, id: string) {
  await lockVisitor(db, user);
  const receipt = await db.query(
    "update bar_visitor_receipts set status='complete',pending_until=null where user_id=$1 and id=$2 and kind='message' and status='reserved' and pending_until>clock_timestamp() returning id",
    [user, id],
  );
  if (!receipt.rows.length)
    throw new AppError('conversation_stale', 'Ответ устарел. Отправь сообщение ещё раз.', 409);
}
export async function admitVisitorGame(
  db: PoolClient,
  user: string,
  character: string,
  id: string,
  now: number,
) {
  const account = await visitorAccount(db, user, now);
  const receipt = (
    await db.query<Receipt>('select * from bar_visitor_receipts where user_id=$1 and id=$2', [
      user,
      id,
    ])
  ).rows[0];
  if (receipt) {
    if (
      receipt.kind !== 'game' ||
      receipt.character_id !== character ||
      receipt.status === 'released' ||
      (receipt.payload as { finished?: boolean } | null)?.finished
    )
      throw new AppError('bar_game_changed', 'Эта партия уже завершена.', 409);
    return;
  }
  const { settings } = await readVisitorSettings(db);
  const state = visitorSnapshot(account, settings, now);
  if ((state.games.byCharacter[character] ?? 0) <= 0)
    throw new AppError('bar_game_limit', 'На сегодня игр с персонажем больше нет.', 429, state);
  await db.query(
    `update bar_visitor_accounts set games_used=jsonb_set(games_used,array[$2],to_jsonb(coalesce((games_used->>$2)::integer,0)+1)) where user_id=$1`,
    [user, character],
  );
  await db.query(
    "insert into bar_visitor_receipts(user_id,id,kind,character_id,status,day_started_at) values($1,$2,'game',$3,'complete',$4)",
    [user, id, character, account.dayStartedAt],
  );
}
export async function purchaseVisitorProduct(
  pool: Pool,
  user: string,
  input: {
    id: string;
    productId: string;
    currency: 'coins' | 'stars';
    expectedPrice: number;
    expectedRevision: number;
  },
) {
  return visitorTransaction(pool, user, async (db, now) => {
    await visitorAccount(db, user, now);
    const previous = (
      await db.query<Receipt>('select * from bar_visitor_receipts where user_id=$1 and id=$2', [
        user,
        input.id,
      ])
    ).rows[0];
    if (previous) {
      const value = previous.payload as typeof input;
      if (
        previous.kind !== 'purchase' ||
        Object.keys(input).some(
          (key) => input[key as keyof typeof input] !== value?.[key as keyof typeof input],
        )
      )
        throw new AppError('conflict', 'Запрос покупки уже использован.', 409);
      return visitorState(db, user, now);
    }
    const { settings, revision } = await readVisitorSettings(db);
    const product = settings.products.find((p) => p.id === input.productId);
    if (!product) throw new AppError('not_found', 'Товар не найден.', 404);
    const price = product[input.currency];
    if (input.expectedRevision !== revision || input.expectedPrice !== price)
      throw new AppError(
        'bar_price_changed',
        'Условия изменились. Обнови товары перед покупкой.',
        409,
      );
    const paid =
      input.currency === 'stars'
        ? await db.query('update users set xp=xp-$2 where id=$1 and xp>=$2 returning id', [
            user,
            price,
          ])
        : await db.query(
            'update user_currency_account set balance=balance-$2,updated_at=now() where user_id=$1 and balance>=$2 returning user_id',
            [user, price],
          );
    if (!paid.rows.length)
      throw new AppError('bar_insufficient_funds', 'Не хватает средств для покупки.', 409);
    if (product.kind === 'card') {
      const account = await visitorAccount(db, user, now);
      await db.query(
        'update bar_visitor_accounts set purchased_at=coalesce(purchased_at,$2),expires_at=$3 where user_id=$1',
        [user, new Date(now), extendVisitorCard(account.expiresAt, settings.cardDays, now)],
      );
    } else
      await db.query(
        'update bar_visitor_accounts set paid_messages=paid_messages+$2 where user_id=$1',
        [user, product.amount],
      );
    await db.query(
      "insert into bar_visitor_receipts(user_id,id,kind,status,payload) values($1,$2,'purchase','complete',$3)",
      [user, input.id, JSON.stringify({ ...input, product, cardDays: settings.cardDays })],
    );
    await db.query(
      `insert into currency_ledger(user_id,reason,available_delta,reserved_delta,balance_after,reserved_after,metadata) select user_id,'bar_purchase',$2,0,balance,reserved_balance,$3 from user_currency_account where user_id=$1`,
      [
        user,
        input.currency === 'coins' ? -price : 0,
        JSON.stringify({
          title: product.title,
          product_id: product.id,
          messages_added: product.kind === 'messages' ? product.amount : 0,
          card_days: product.kind === 'card' ? settings.cardDays : 0,
          payment_currency: input.currency,
          stars: input.currency === 'stars' ? -price : 0,
          request_id: input.id,
        }),
      ],
    );
    return visitorState(db, user, now);
  });
}
