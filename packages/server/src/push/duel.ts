import type { Pool } from 'pg';
import { enqueuePushDelivery } from './queue.js';
import {
  isPushEventAllowed,
  mapPushPreferencesRow,
  type PushEventType,
  type PushPreferencesRow,
} from './preferences.js';
import { renderPushNotificationPayload } from './templates.js';
import type { WebPushPayload } from './service.js';

interface DuelPushRecipientRow extends PushPreferencesRow {
  user_id: string;
  has_subscription: boolean;
}

export interface EnqueueDuelPushInput {
  userId: string;
  eventType: Extract<PushEventType, 'duel.challenge_received' | 'duel.result_ready'>;
  eventKey: string;
  variables: Record<string, string | number | null | undefined>;
  fallback: {
    title: string;
    body: string;
    url: string;
  };
  tag: string;
}

function withTag(payload: WebPushPayload, tag: string): WebPushPayload {
  return { ...payload, tag };
}

export async function enqueueDuelPush(
  pool: Pool,
  input: EnqueueDuelPushInput,
): Promise<{ queued: boolean; skippedReason: string | null }> {
  const { rows } = await pool.query<DuelPushRecipientRow>(
    `select u.id::text as user_id,
            exists(
              select 1
                from push_subscriptions ps
               where ps.user_id = u.id
            ) as has_subscription,
            pref.chat_new_dialog_message,
            pref.daily_game,
            pref.training_available,
            pref.duel_events,
            pref.game_news
       from users u
       left join user_push_preferences pref on pref.user_id = u.id
      where u.id = $1`,
    [input.userId],
  );
  const recipient = rows[0];
  if (!recipient) return { queued: false, skippedReason: 'no_recipient' };
  if (!recipient.has_subscription) return { queued: false, skippedReason: 'no_subscription' };

  const preferences = mapPushPreferencesRow(recipient);
  if (!isPushEventAllowed(preferences, input.eventType)) {
    return { queued: false, skippedReason: 'muted' };
  }

  const payload = await renderPushNotificationPayload(
    pool,
    input.eventType,
    input.variables,
    input.fallback,
  );
  if (payload === null) return { queued: false, skippedReason: 'template_disabled' };

  const queued = await enqueuePushDelivery(pool, {
    userId: recipient.user_id,
    eventType: input.eventType,
    eventKey: input.eventKey,
    payload: withTag(payload, input.tag),
  });
  return { queued, skippedReason: null };
}
