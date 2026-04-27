import type {
  ChatRow,
  MessageRow,
  ChatDTO,
  ChatMessageDTO,
  MessageReactionRow,
  ReactionGroupDTO,
} from './types.js';

export function toChatMessageDTO(
  row: MessageRow,
  reactions: ReactionGroupDTO[] = [],
): ChatMessageDTO {
  return {
    id: row.id,
    chatId: row.chat_id,
    senderId: row.sender_id,
    content: row.is_deleted ? '' : row.content,
    replyToId: row.reply_to_id,
    isDeleted: row.is_deleted,
    createdAt: row.created_at.toISOString(),
    reactions,
  };
}

export interface ChatListAggregate {
  chat: ChatRow;
  lastMessage: MessageRow | null;
  lastMessageSenderName: string | null;
  unreadCount: number;
  dmCounterpart: ChatDTO['dmCounterpart'];
  memberCount: number;
  pinnedAt: Date | null;
}

export function toChatDTO(agg: ChatListAggregate): ChatDTO {
  return {
    id: agg.chat.id,
    type: agg.chat.type,
    name: agg.chat.name,
    entityType: agg.chat.entity_type,
    entityId: agg.chat.entity_id,
    lastMessageAt: agg.chat.last_message_at?.toISOString() ?? null,
    unreadCount: agg.unreadCount,
    lastMessage: agg.lastMessage ? toChatMessageDTO(agg.lastMessage) : null,
    lastMessageSenderName: agg.lastMessageSenderName,
    dmCounterpart: agg.dmCounterpart,
    memberCount: agg.memberCount,
    pinnedAt: agg.pinnedAt?.toISOString() ?? null,
  };
}

export function groupReactions(
  rows: MessageReactionRow[],
  currentUserId: string,
): Map<string, ReactionGroupDTO[]> {
  // Result: messageId → grouped-by-emoji
  const out = new Map<string, Map<string, ReactionGroupDTO>>();
  for (const r of rows) {
    let perMessage = out.get(r.message_id);
    if (!perMessage) {
      perMessage = new Map();
      out.set(r.message_id, perMessage);
    }
    let group = perMessage.get(r.emoji);
    if (!group) {
      group = { emoji: r.emoji, count: 0, reactedByMe: false };
      perMessage.set(r.emoji, group);
    }
    group.count += 1;
    if (r.user_id === currentUserId) group.reactedByMe = true;
  }
  const result = new Map<string, ReactionGroupDTO[]>();
  for (const [msgId, byEmoji] of out) {
    result.set(msgId, [...byEmoji.values()]);
  }
  return result;
}
