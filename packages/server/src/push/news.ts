import type { Pool } from 'pg';
import {
  isPushEventAllowed,
  mapPushPreferencesRow,
  type PushPreferencesRow,
} from './preferences.js';
import {
  resolvePushVapidOptions,
  sendWebPush,
  type PushVapidOptions,
  type WebPushPayload,
  type WebPushSubscription,
} from './service.js';

interface NewsPushSubscriptionRow extends PushPreferencesRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface SendNewsPostPushInput {
  senderUserId: string;
  title: string;
  body: string;
  url: string;
  tag?: string;
}

export interface SendNewsPostPushResult {
  total: number;
  sent: number;
  skipped: number;
  failed: number;
}

const BODY_LIMIT = 180;

function toSubscription(row: NewsPushSubscriptionRow): WebPushSubscription {
  return {
    endpoint: row.endpoint,
    p256dh: row.p256dh,
    auth: row.auth,
  };
}

function compactBody(body: string): string {
  const normalized = body.replace(/\*\*|__/g, '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= BODY_LIMIT) return normalized;
  return `${normalized.slice(0, BODY_LIMIT - 1).trimEnd()}…`;
}

function buildPayload(input: SendNewsPostPushInput): WebPushPayload {
  const payload: WebPushPayload = {
    title: input.title,
    body: compactBody(input.body),
    url: input.url,
  };
  if (input.tag !== undefined) payload.tag = input.tag;
  return payload;
}

export async function sendNewsPostPush(
  pool: Pool,
  options: PushVapidOptions,
  input: SendNewsPostPushInput,
): Promise<SendNewsPostPushResult> {
  const config = resolvePushVapidOptions(options);
  if (config === null) {
    return { total: 0, sent: 0, skipped: 0, failed: 0 };
  }

  const { rows } = await pool.query<NewsPushSubscriptionRow>(
    `select ps.id, ps.user_id, ps.endpoint, ps.p256dh, ps.auth,
            pref.chat_new_dialog_message,
            pref.daily_game,
            pref.training_available,
            pref.game_news
       from push_subscriptions ps
       left join user_push_preferences pref on pref.user_id = ps.user_id
      where ps.user_id <> $1
      order by ps.updated_at desc`,
    [input.senderUserId],
  );

  const payload = buildPayload(input);
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const preferences = mapPushPreferencesRow(row);
    if (!isPushEventAllowed(preferences, 'news.posted')) {
      skipped += 1;
      continue;
    }

    try {
      const result = await sendWebPush(toSubscription(row), config, payload);
      if (result.ok) {
        sent += 1;
        await pool.query(
          `update push_subscriptions
              set last_success_at = now(),
                  last_error_at = null,
                  last_error_message = null
            where id = $1`,
          [row.id],
        );
        continue;
      }

      failed += 1;
      if (result.gone) {
        await pool.query('delete from push_subscriptions where id = $1', [row.id]);
      } else {
        await pool.query(
          `update push_subscriptions
              set last_error_at = now(),
                  last_error_message = $2
            where id = $1`,
          [row.id, `HTTP ${result.status}: ${result.body.slice(0, 400)}`],
        );
      }
    } catch (err) {
      failed += 1;
      await pool.query(
        `update push_subscriptions
            set last_error_at = now(),
                last_error_message = $2
          where id = $1`,
        [row.id, err instanceof Error ? err.message : 'push send failed'],
      );
    }
  }

  return { total: rows.length, sent, skipped, failed };
}
