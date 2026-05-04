import type { Pool } from 'pg';
import {
  isPushEventAllowed,
  mapPushPreferencesRow,
  type PushPreferencesRow,
} from './preferences.js';
import { enqueuePushDelivery } from './queue.js';
import type { WebPushPayload } from './service.js';
import { renderPushNotificationPayload } from './templates.js';

interface NewsPushRecipientRow extends PushPreferencesRow {
  user_id: string;
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
  queued: number;
  skipped: number;
}

const BODY_LIMIT = 180;

function compactBody(body: string): string {
  const normalized = body.replace(/\*\*|__/g, '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= BODY_LIMIT) return normalized;
  return `${normalized.slice(0, BODY_LIMIT - 1).trimEnd()}…`;
}

function buildPayload(base: WebPushPayload, input: SendNewsPostPushInput): WebPushPayload {
  const payload: WebPushPayload = {
    title: base.title,
    body: compactBody(base.body),
    url: base.url,
  };
  if (input.tag !== undefined) payload.tag = input.tag;
  return payload;
}

export async function sendNewsPostPush(
  pool: Pool,
  input: SendNewsPostPushInput,
): Promise<SendNewsPostPushResult> {
  const { rows } = await pool.query<NewsPushRecipientRow>(
    `select ps.user_id::text,
            pref.chat_new_dialog_message,
            pref.daily_game,
            pref.training_available,
            pref.game_news
       from (
         select distinct user_id
           from push_subscriptions
          where user_id <> $1
       ) ps
       left join user_push_preferences pref on pref.user_id = ps.user_id
      order by ps.user_id`,
    [input.senderUserId],
  );

  const rendered = await renderPushNotificationPayload(
    pool,
    'news.posted',
    {
      postContent: input.body,
      chatId: input.url.startsWith('/chat/') ? input.url.slice('/chat/'.length) : '',
    },
    {
      title: input.title,
      body: input.body,
      url: input.url,
    },
  );
  if (rendered === null) {
    return { total: rows.length, queued: 0, skipped: rows.length };
  }

  const payload = buildPayload(rendered, input);
  let queued = 0;
  let skipped = 0;

  for (const row of rows) {
    const preferences = mapPushPreferencesRow(row);
    if (!isPushEventAllowed(preferences, 'news.posted')) {
      skipped += 1;
      continue;
    }

    const didQueue = await enqueuePushDelivery(pool, {
      userId: row.user_id,
      eventType: 'news.posted',
      eventKey: `news:${input.tag ?? input.url}`,
      payload,
    });
    if (didQueue) queued += 1;
  }

  return { total: rows.length, queued, skipped };
}
