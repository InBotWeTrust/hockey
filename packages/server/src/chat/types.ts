// Row types — one per chat table. snake_case to match SQL columns; conversion
// to camelCase happens at the API boundary (routes layer) in PR 2.

export type ChatType = 'direct' | 'group' | 'system';
export type ChatMemberRole = 'admin' | 'member';
export type EntityType = 'team' | 'tournament';

export interface ChatRow {
  id: string;
  type: ChatType;
  name: string | null;
  created_by: string;
  entity_type: EntityType | null;
  entity_id: string | null;
  last_message_at: Date | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface ChatMemberRow {
  id: string;
  chat_id: string;
  user_id: string;
  role: ChatMemberRole;
  last_read_at: Date;
  joined_at: Date;
}

export interface MessageRow {
  id: string;
  chat_id: string;
  sender_id: string;
  content: string;
  reply_to_id: string | null;
  is_deleted: boolean;
  created_at: Date;
  updated_at: Date;
  // search_vector is generated; not selected into typed rows.
}

export interface MessageReactionRow {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: Date;
}

export interface AddReactionResult {
  added: string | null;
  removed: string | null;
}

// DTOs — what the API returns to clients. camelCase, no internal flags exposed.

export interface ChatDTO {
  id: string;
  type: ChatType;
  name: string | null;
  entityType: EntityType | null;
  entityId: string | null;
  lastMessageAt: string | null; // ISO
  unreadCount: number;
  lastMessage: ChatMessageDTO | null;
  // Display name of the author of `lastMessage`. Null when no last message.
  // Used by the client to render "Имя Ф: text" preview without an extra fetch.
  lastMessageSenderName: string | null;
  // For DMs: rendered name and avatar of the OTHER user. Null for group/system.
  dmCounterpart: { userId: string; displayName: string; avatarUrl: string | null } | null;
  // For system chats — total active users (everyone has access).
  // For group/direct — count of chat_members rows.
  memberCount: number;
}

export interface ChatMessageDTO {
  id: string;
  chatId: string;
  senderId: string;
  content: string;
  replyToId: string | null;
  isDeleted: boolean;
  createdAt: string; // ISO
  reactions: ReactionGroupDTO[];
}

export interface ReactionGroupDTO {
  emoji: string;
  count: number;
  reactedByMe: boolean;
}

// WS event types. Discriminated union; serialized as JSON over the wire.

export type ChatEvent =
  | { type: 'message:new'; chatId: string; message: ChatMessageDTO }
  | { type: 'message:deleted'; chatId: string; messageId: string }
  | { type: 'reaction:added'; chatId: string; messageId: string; userId: string; emoji: string }
  | { type: 'reaction:removed'; chatId: string; messageId: string; userId: string; emoji: string }
  | { type: 'chat:read'; chatId: string; userId: string; lastReadAt: string }
  // Sent by the server immediately after all Redis subscribes complete on a
  // fresh /chat/ws connection. Closes the race where a client posts a message
  // (or any publish-trigger) before the server-side SUBSCRIBE has registered.
  // Only ever sent by ws.ts; never published through realtime.
  | { type: 'connection:ready' };

export interface ChatEventFrame {
  v: 1;
  event: ChatEvent;
}
