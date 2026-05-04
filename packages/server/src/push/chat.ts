import type { Pool } from 'pg';
import { enqueuePushDelivery } from './queue.js';
import {
  isPushEventAllowed,
  mapPushPreferencesRow,
  type PushPreferencesRow,
} from './preferences.js';
import { renderPushNotificationPayload } from './templates.js';
import type { WebPushPayload } from './service.js';

interface DirectMessagePushRecipientRow extends PushPreferencesRow {
  user_id: string;
  sender_display_name: string;
  has_subscription: boolean;
}

export interface EnqueueFirstDialogMessagePushInput {
  chatId: string;
  senderId: string;
  messageId: string;
  content: string;
}

export interface EnqueueFirstDialogMessagePushResult {
  queued: boolean;
  skippedReason: 'no_recipient' | 'no_subscription' | 'muted' | 'template_disabled' | null;
}

const MESSAGE_PREVIEW_LIMIT = 120;

function compactMessagePreview(content: string): string {
  const normalized = content.replace(/\*\*|__/g, '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= MESSAGE_PREVIEW_LIMIT) return normalized;
  return `${normalized.slice(0, MESSAGE_PREVIEW_LIMIT - 1).trimEnd()}…`;
}

function withTag(payload: WebPushPayload, tag: string): WebPushPayload {
  return { ...payload, tag };
}

export async function enqueueFirstDialogMessagePush(
  pool: Pool,
  input: EnqueueFirstDialogMessagePushInput,
): Promise<EnqueueFirstDialogMessagePushResult> {
  const { rows } = await pool.query<DirectMessagePushRecipientRow>(
    `select cm.user_id::text,
            sender.display_name as sender_display_name,
            exists(
              select 1
                from push_subscriptions ps
               where ps.user_id = cm.user_id
            ) as has_subscription,
            pref.chat_new_dialog_message,
            pref.daily_game,
            pref.training_available,
            pref.game_news
       from chat_members cm
       join users sender on sender.id = $2
       left join user_push_preferences pref on pref.user_id = cm.user_id
      where cm.chat_id = $1
        and cm.user_id <> $2
      limit 1`,
    [input.chatId, input.senderId],
  );
  const recipient = rows[0];
  if (!recipient) {
    return { queued: false, skippedReason: 'no_recipient' };
  }
  if (!recipient.has_subscription) {
    return { queued: false, skippedReason: 'no_subscription' };
  }

  const preferences = mapPushPreferencesRow(recipient);
  if (!isPushEventAllowed(preferences, 'chat.new_dialog_message')) {
    return { queued: false, skippedReason: 'muted' };
  }

  const preview = compactMessagePreview(input.content);
  const payload = await renderPushNotificationPayload(
    pool,
    'chat.new_dialog_message',
    {
      senderName: recipient.sender_display_name,
      messagePreview: preview,
      chatId: input.chatId,
    },
    {
      title: `Новое сообщение от ${recipient.sender_display_name}`,
      body: preview || 'Вам написали в личку',
      url: `/chat/${input.chatId}`,
    },
  );
  if (payload === null) {
    return { queued: false, skippedReason: 'template_disabled' };
  }

  const queued = await enqueuePushDelivery(pool, {
    userId: recipient.user_id,
    eventType: 'chat.new_dialog_message',
    eventKey: `chat:new-dialog:${input.chatId}`,
    payload: withTag(payload, `ultimate-hockey-dm-${input.chatId}`),
  });
  return { queued, skippedReason: null };
}
