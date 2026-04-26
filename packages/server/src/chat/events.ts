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
  if (chatType === 'system') {
    await publisher.publish(systemChannel(chatId), event);
    return;
  }
  const userIds = await getMemberIds(pool, chatId);
  await Promise.all(userIds.map((uid) => publisher.publish(userChannel(uid), event)));
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

// chat:read is intentionally NOT broadcast to all members — read-receipts of
// the form "Alice has read this" are out of scope (spec §2). We only notify
// the reader's own other tabs so their unread badge resets in sync.
export async function publishChatRead(
  _pool: Pool,
  publisher: EventPublisher,
  chatId: string,
  _chatType: ChatType,
  userId: string,
  lastReadAt: string,
): Promise<void> {
  await publisher.publish(userChannel(userId), {
    type: 'chat:read',
    chatId,
    userId,
    lastReadAt,
  });
}
