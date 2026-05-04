import type { Pool, PoolClient } from 'pg';
import type { PushEventType } from './preferences.js';
import {
  resolvePushVapidOptions,
  sendWebPush,
  type PushVapidOptions,
  type WebPushPayload,
  type WebPushSubscription,
} from './service.js';

export const PUSH_QUEUE_BATCH_SIZE = 50;
export const PUSH_QUEUE_CONCURRENCY = 5;
export const PUSH_QUEUE_MAX_ATTEMPTS = 3;
export const PUSH_QUEUE_PROCESSING_STALE_MS = 5 * 60 * 1000;
export const PUSH_DELIVERY_LOG_RETENTION_DAYS = 90;
export const PUSH_DELIVERY_LOG_CLEANUP_LIMIT = 5_000;

export interface EnqueuePushDeliveryInput {
  userId: string;
  eventType: PushEventType;
  eventKey: string;
  payload: WebPushPayload;
}

export interface ProcessPushDeliveryQueueOptions extends PushVapidOptions {
  batchSize?: number;
  concurrency?: number;
  maxAttempts?: number;
  processingStaleMs?: number;
}

export interface PushQueueEventResult {
  eventType: PushEventType;
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
  retried: number;
}

export interface ProcessPushDeliveryQueueResult {
  enabled: boolean;
  claimed: number;
  sent: number;
  skipped: number;
  failed: number;
  retried: number;
  events: PushQueueEventResult[];
}

export interface CleanupPushDeliveryLogOptions {
  retentionDays?: number;
  limit?: number;
}

interface QueueDeliveryRow {
  id: string;
  user_id: string;
  event_type: PushEventType;
  event_key: string;
  payload: unknown;
  attempt_count: number;
}

interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

type Queryable = Pool | PoolClient;

interface DeliveryResult {
  eventType: PushEventType;
  sent: number;
  skipped: number;
  failed: number;
  retried: number;
}

function toSubscription(row: PushSubscriptionRow): WebPushSubscription {
  return {
    endpoint: row.endpoint,
    p256dh: row.p256dh,
    auth: row.auth,
  };
}

function normalizeLimit(value: number | undefined, fallback: number, min: number, max: number) {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

export async function cleanupPushDeliveryLog(
  pool: Queryable,
  options: CleanupPushDeliveryLogOptions = {},
): Promise<number> {
  const retentionDays = normalizeLimit(
    options.retentionDays,
    PUSH_DELIVERY_LOG_RETENTION_DAYS,
    1,
    365,
  );
  const limit = normalizeLimit(options.limit, PUSH_DELIVERY_LOG_CLEANUP_LIMIT, 1, 50_000);
  const result = await pool.query(
    `with old_rows as (
       select id
         from push_delivery_log
        where status not in ('queued', 'processing')
          and created_at < now() - ($1::int * interval '1 day')
        order by created_at asc
        limit $2
     )
     delete from push_delivery_log pdl
      using old_rows
      where pdl.id = old_rows.id`,
    [retentionDays, limit],
  );
  return result.rowCount ?? 0;
}

function parsePayload(value: unknown): WebPushPayload | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  if (
    typeof source.title !== 'string' ||
    typeof source.body !== 'string' ||
    typeof source.url !== 'string'
  ) {
    return null;
  }

  const payload: WebPushPayload = {
    title: source.title,
    body: source.body,
    url: source.url,
  };
  if (typeof source.tag === 'string') payload.tag = source.tag;
  if (typeof source.icon === 'string') payload.icon = source.icon;
  if (typeof source.badge === 'string') payload.badge = source.badge;
  if (typeof source.silent === 'boolean') payload.silent = source.silent;
  if (typeof source.deliveryId === 'string') payload.deliveryId = source.deliveryId;
  return payload;
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const current = index;
      index += 1;
      const item = items[current];
      if (item === undefined) return;
      results[current] = await fn(item);
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

export async function enqueuePushDelivery(
  pool: Queryable,
  input: EnqueuePushDeliveryInput,
): Promise<boolean> {
  const result = await pool.query(
    `insert into push_delivery_log
       (user_id, event_type, event_key, status, payload, next_attempt_at)
     values ($1, $2, $3, 'queued', $4::jsonb, now())
     on conflict (user_id, event_type, event_key) do nothing`,
    [input.userId, input.eventType, input.eventKey, JSON.stringify(input.payload)],
  );
  return result.rowCount === 1;
}

async function claimQueuedDeliveries(
  pool: Pool,
  batchSize: number,
  maxAttempts: number,
  processingStaleMs: number,
): Promise<QueueDeliveryRow[]> {
  const { rows } = await pool.query<QueueDeliveryRow>(
    `with due as (
       select id
         from push_delivery_log
        where payload is not null
          and attempt_count < $2
          and (
            (status = 'queued' and next_attempt_at <= now())
            or (
              status = 'processing'
              and updated_at < now() - ($3::bigint * interval '1 millisecond')
            )
          )
        order by next_attempt_at asc, created_at asc
        limit $1
        for update skip locked
     )
     update push_delivery_log pdl
        set status = 'processing',
            attempt_count = attempt_count + 1,
            updated_at = now()
       from due
      where pdl.id = due.id
      returning pdl.id,
                pdl.user_id::text,
                pdl.event_type,
                pdl.event_key,
                pdl.payload,
                pdl.attempt_count`,
    [batchSize, maxAttempts, processingStaleMs],
  );
  return rows;
}

async function fetchSubscriptions(pool: Pool, userId: string): Promise<PushSubscriptionRow[]> {
  const { rows } = await pool.query<PushSubscriptionRow>(
    `select id, endpoint, p256dh, auth
       from push_subscriptions
      where user_id = $1
      order by updated_at desc`,
    [userId],
  );
  return rows;
}

async function markSubscriptionSuccess(pool: Pool, subscriptionId: string): Promise<void> {
  await pool.query(
    `update push_subscriptions
        set last_success_at = now(),
            last_error_at = null,
            last_error_message = null
      where id = $1`,
    [subscriptionId],
  );
}

async function markSubscriptionFailure(
  pool: Pool,
  subscriptionId: string,
  message: string,
): Promise<void> {
  await pool.query(
    `update push_subscriptions
        set last_error_at = now(),
            last_error_message = $2
      where id = $1`,
    [subscriptionId, message],
  );
}

async function finishDelivery(
  pool: Pool,
  row: QueueDeliveryRow,
  status: 'sent' | 'partial' | 'failed' | 'skipped',
  subscriptionCount: number,
  sent: number,
  failed: number,
  lastError: string | null,
): Promise<void> {
  await pool.query(
    `update push_delivery_log
        set status = $2,
            subscription_count = $3,
            sent_count = $4,
            failed_count = $5,
            last_error_message = $6,
            updated_at = now()
      where id = $1`,
    [row.id, status, subscriptionCount, sent, failed, lastError],
  );
}

async function retryDelivery(
  pool: Pool,
  row: QueueDeliveryRow,
  subscriptionCount: number,
  failed: number,
  lastError: string | null,
): Promise<void> {
  const backoffMinutes = Math.min(30, Math.max(1, row.attempt_count * row.attempt_count));
  await pool.query(
    `update push_delivery_log
        set status = 'queued',
            subscription_count = $2,
            failed_count = $3,
            last_error_message = $4,
            next_attempt_at = now() + ($5::int * interval '1 minute'),
            updated_at = now()
      where id = $1`,
    [row.id, subscriptionCount, failed, lastError, backoffMinutes],
  );
}

async function processDelivery(
  pool: Pool,
  row: QueueDeliveryRow,
  options: {
    vapid: NonNullable<ReturnType<typeof resolvePushVapidOptions>>;
    maxAttempts: number;
  },
): Promise<DeliveryResult> {
  const payload = parsePayload(row.payload);
  if (payload === null) {
    await finishDelivery(pool, row, 'skipped', 0, 0, 0, 'invalid push payload');
    return { eventType: row.event_type, sent: 0, skipped: 1, failed: 0, retried: 0 };
  }

  const subscriptions = await fetchSubscriptions(pool, row.user_id);
  if (subscriptions.length === 0) {
    await finishDelivery(pool, row, 'skipped', 0, 0, 0, 'no active push subscriptions');
    return { eventType: row.event_type, sent: 0, skipped: 1, failed: 0, retried: 0 };
  }

  let sent = 0;
  let failed = 0;
  let lastError: string | null = null;
  const deliveryPayload: WebPushPayload = { ...payload, deliveryId: row.id };

  for (const subscription of subscriptions) {
    try {
      const result = await sendWebPush(toSubscription(subscription), options.vapid, deliveryPayload);
      if (result.ok) {
        sent += 1;
        await markSubscriptionSuccess(pool, subscription.id);
        continue;
      }

      failed += 1;
      lastError = `HTTP ${result.status}: ${result.body.slice(0, 400)}`;
      if (result.gone) {
        await pool.query('delete from push_subscriptions where id = $1', [subscription.id]);
      } else {
        await markSubscriptionFailure(pool, subscription.id, lastError);
      }
    } catch (err) {
      failed += 1;
      lastError = err instanceof Error ? err.message : 'push send failed';
      await markSubscriptionFailure(pool, subscription.id, lastError);
    }
  }

  if (sent === 0 && failed > 0 && row.attempt_count < options.maxAttempts) {
    await retryDelivery(pool, row, subscriptions.length, failed, lastError);
    return { eventType: row.event_type, sent: 0, skipped: 0, failed: 0, retried: 1 };
  }

  const status = sent > 0 && failed === 0 ? 'sent' : sent > 0 ? 'partial' : 'failed';
  await finishDelivery(pool, row, status, subscriptions.length, sent, failed, lastError);
  return { eventType: row.event_type, sent, skipped: 0, failed, retried: 0 };
}

function aggregateResults(results: DeliveryResult[]): PushQueueEventResult[] {
  const byEvent = new Map<PushEventType, PushQueueEventResult>();
  for (const result of results) {
    const event = byEvent.get(result.eventType) ?? {
      eventType: result.eventType,
      processed: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      retried: 0,
    };
    event.processed += 1;
    event.sent += result.sent;
    event.skipped += result.skipped;
    event.failed += result.failed;
    event.retried += result.retried;
    byEvent.set(result.eventType, event);
  }
  return [...byEvent.values()];
}

export async function processPushDeliveryQueue(
  pool: Pool,
  options: ProcessPushDeliveryQueueOptions,
): Promise<ProcessPushDeliveryQueueResult> {
  const vapid = resolvePushVapidOptions(options);
  if (vapid === null) {
    return {
      enabled: false,
      claimed: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      retried: 0,
      events: [],
    };
  }

  const batchSize = normalizeLimit(options.batchSize, PUSH_QUEUE_BATCH_SIZE, 1, 500);
  const concurrency = normalizeLimit(options.concurrency, PUSH_QUEUE_CONCURRENCY, 1, 25);
  const maxAttempts = normalizeLimit(options.maxAttempts, PUSH_QUEUE_MAX_ATTEMPTS, 1, 10);
  const processingStaleMs = normalizeLimit(
    options.processingStaleMs,
    PUSH_QUEUE_PROCESSING_STALE_MS,
    30_000,
    60 * 60 * 1000,
  );
  const rows = await claimQueuedDeliveries(pool, batchSize, maxAttempts, processingStaleMs);
  const results = await mapWithConcurrency(rows, concurrency, (row) =>
    processDelivery(pool, row, { vapid, maxAttempts }),
  );

  return {
    enabled: true,
    claimed: rows.length,
    sent: results.reduce((sum, result) => sum + result.sent, 0),
    skipped: results.reduce((sum, result) => sum + result.skipped, 0),
    failed: results.reduce((sum, result) => sum + result.failed, 0),
    retried: results.reduce((sum, result) => sum + result.retried, 0),
    events: aggregateResults(results),
  };
}
