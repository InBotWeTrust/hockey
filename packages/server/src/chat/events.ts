import type { Pool } from 'pg';
import type { ChatEvent, ChatMessageDTO, ChatType } from './types.js';

// EventPublisher is the slice of `app.realtime` we need. Decoupling the
// publisher from the Fastify app lets us unit-test fan-out without booting
// Redis subscriptions.
export interface EventPublisher {
  publish(channel: string, event: ChatEvent): Promise<void>;
}

const userChannel = (userId: string) => `chat:user:${userId}`;
const systemChannel = (chatId: string) => `chat:system:${chatId}`;

// Realtime delivery is best-effort: the DB write is the durable record, so a
// Redis publish failure must not bubble out and turn into a 500 on a successful
// chat operation. Per-channel failures are swallowed here.
async function safePublish(
  publisher: EventPublisher,
  channel: string,
  event: ChatEvent,
): Promise<void> {
  try {
    await publisher.publish(channel, event);
  } catch {
    // intentionally swallowed
  }
}

async function getMemberIds(pool: Pool, chatId: string): Promise<string[]> {
  const r = await pool.query<{ user_id: string }>(
    `select user_id from chat_members where chat_id = $1`,
    [chatId],
  );
  return r.rows.map((row) => row.user_id);
}

async function fanOut(
  pool: Pool,
  publisher: EventPublisher,
  chatId: string,
  chatType: ChatType,
  event: ChatEvent,
): Promise<void> {
  if (chatType === 'system' || chatType === 'channel') {
    await safePublish(publisher, systemChannel(chatId), event);
    return;
  }
  const userIds = await getMemberIds(pool, chatId);
  // safePublish swallows per-channel failures: a single Redis publish failure
  // for one member must not reject the whole fan-out — the DB write already
  // succeeded, message is durable, and a 500 to the sender on a successful
  // send would be wrong. Per-channel publish failures are logged by the
  // realtime plugin's subscriber error listener and Fastify's redis plugin
  // error path.
  await Promise.all(userIds.map((uid) => safePublish(publisher, userChannel(uid), event)));
}

export async function publishMessageNew(
  pool: Pool,
  publisher: EventPublisher,
  chatId: string,
  chatType: ChatType,
  message: ChatMessageDTO,
): Promise<void> {
  await fanOut(pool, publisher, chatId, chatType, { type: 'message:new', chatId, message });
}

export async function publishMessageDeleted(
  pool: Pool,
  publisher: EventPublisher,
  chatId: string,
  chatType: ChatType,
  messageId: string,
): Promise<void> {
  await fanOut(pool, publisher, chatId, chatType, { type: 'message:deleted', chatId, messageId });
}

export async function publishMessageUpdated(
  pool: Pool,
  publisher: EventPublisher,
  chatId: string,
  chatType: ChatType,
  message: ChatMessageDTO,
): Promise<void> {
  await fanOut(pool, publisher, chatId, chatType, { type: 'message:updated', chatId, message });
}

// For DMs, chat:read is also the read-receipt signal for the other participant:
// the client only renders it as ticks on outgoing one-on-one messages. For
// group/system/channel reads we keep the old reader-only behavior so we don't
// expose broad read receipts.
export async function publishChatRead(
  pool: Pool,
  publisher: EventPublisher,
  chatId: string,
  chatType: ChatType,
  userId: string,
  lastReadAt: string,
): Promise<void> {
  const event: ChatEvent = {
    type: 'chat:read',
    chatId,
    userId,
    lastReadAt,
  };
  if (chatType === 'direct') {
    await fanOut(pool, publisher, chatId, chatType, event);
    return;
  }
  await safePublish(publisher, userChannel(userId), event);
}

export async function publishReactionAdded(
  pool: Pool,
  publisher: EventPublisher,
  chatId: string,
  chatType: ChatType,
  messageId: string,
  userId: string,
  emoji: string,
): Promise<void> {
  await fanOut(pool, publisher, chatId, chatType, {
    type: 'reaction:added',
    chatId,
    messageId,
    userId,
    emoji,
  });
}

export async function publishReactionRemoved(
  pool: Pool,
  publisher: EventPublisher,
  chatId: string,
  chatType: ChatType,
  messageId: string,
  userId: string,
  emoji: string,
): Promise<void> {
  await fanOut(pool, publisher, chatId, chatType, {
    type: 'reaction:removed',
    chatId,
    messageId,
    userId,
    emoji,
  });
}
