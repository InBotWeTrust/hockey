// Row types — one per chat table. snake_case to match SQL columns; conversion
// to camelCase happens at the API boundary (routes layer) in PR 2.

import type { ProfileAchievementDTO } from '../achievements/service.js';
import type { CompetitionLevel, ProfileStatsDTO } from '../profile/summary.js';

export type ChatType = 'direct' | 'group' | 'system' | 'channel';
export type ChatMemberRole = 'admin' | 'member';
export type EntityType = 'team' | 'tournament';

export interface ChatRow {
  id: string;
  type: ChatType;
  name: string | null;
  description: string | null;
  created_by: string;
  entity_type: EntityType | null;
  entity_id: string | null;
  channel_slug: string | null;
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
  // Optional: hydrated by getMessages / sendMessage via LEFT JOIN users so
  // group-chat bubbles can render an avatar + author name. Internal queries
  // that don't need them (e.g. getMessageOr404 for reactions) leave them undefined.
  sender_display_name?: string | null;
  sender_avatar_url?: string | null;
  comment_count?: string;
  view_count?: string;
  // search_vector is generated; not selected into typed rows.
}

export interface MessageReactionRow {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: Date;
}

export interface ChannelPostCommentReactionRow {
  id: string;
  comment_id: string;
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
  channelSlug?: string | null;
  lastMessageAt: string | null; // ISO
  unreadCount: number;
  lastMessage: ChatMessageDTO | null;
  // Display name of the author of `lastMessage`. Null when no last message.
  // Used by the client to render "Имя Ф: text" preview without an extra fetch.
  lastMessageSenderName: string | null;
  // For DMs: rendered name, avatar and last-seen of the OTHER user. Null for
  // group/system. `lastSeenAt` is ISO; null when the user has never been
  // recorded as active (legacy pre-touchLastSeen accounts).
  dmCounterpart: {
    userId: string;
    displayName: string;
    avatarUrl: string | null;
    lastSeenAt: string | null;
    // ISO timestamp of the counterpart's last read marker for this DM.
    // Used by the client to render delivered/read ticks on outgoing messages.
    lastReadAt: string | null;
  } | null;
  // For system chats — total active users (everyone has access).
  // For group/direct — count of chat_members rows.
  memberCount: number;
  // ISO timestamp when the current user pinned this chat. Null = not pinned.
  // Server orders /chat/list by pinned_at desc nulls last, then last_message_at.
  pinnedAt: string | null;
}

export interface ChatMessageDTO {
  id: string;
  chatId: string;
  senderId: string;
  // Display name + avatar of the message author. Null only if the user row
  // was deleted; we keep messages even after the sender is gone.
  senderDisplayName: string | null;
  senderAvatarUrl: string | null;
  content: string;
  replyToId: string | null;
  isDeleted: boolean;
  createdAt: string; // ISO
  reactions: ReactionGroupDTO[];
  // Present for channel posts; omitted for regular chat messages.
  commentCount?: number;
  viewCount?: number;
  poll?: ChannelPollDTO;
}

export interface ReactionGroupDTO {
  emoji: string;
  count: number;
  reactedByMe: boolean;
}

export interface ChannelPollOptionDTO {
  id: string;
  text: string;
  voteCount: number;
  percent: number;
  selectedByMe: boolean;
}

export interface ChannelPollDTO {
  totalVotes: number;
  myOptionId: string | null;
  options: ChannelPollOptionDTO[];
}

export interface ChatMemberSummaryDTO {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
}

// `GET /chat/:chatId/info` payload — used by the chat info screen.
// `members` is paginated server-side (capped); `memberCount` is the
// authoritative total. DMs are not expected to call this endpoint.
export interface ChatInfoDTO {
  id: string;
  type: ChatType;
  name: string | null;
  description: string | null;
  memberCount: number;
  members: ChatMemberSummaryDTO[];
}

export interface ChannelPostCommentRow {
  id: string;
  post_message_id: string;
  author_id: string;
  reply_to_id: string | null;
  content: string;
  is_deleted: boolean;
  created_at: Date;
  updated_at: Date;
  author_display_name?: string | null;
  author_avatar_url?: string | null;
}

export interface ChannelPostCommentDTO {
  id: string;
  postId: string;
  authorId: string;
  authorDisplayName: string | null;
  authorAvatarUrl: string | null;
  replyToId: string | null;
  content: string;
  isDeleted: boolean;
  createdAt: string;
  reactions: ReactionGroupDTO[];
}

export interface ChannelPostViewerDTO {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  firstViewedAt: string;
  lastViewedAt: string;
  viewCount: number;
}

export interface ChannelPostReactionUserDTO {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  emoji: string;
  reactedAt: string;
}

export interface UserPublicProfileDTO {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  competitionLevel: CompetitionLevel;
  stats: ProfileStatsDTO;
  achievements: ProfileAchievementDTO[];
  // ISO; surface "joined at" on the profile screen.
  createdAt: string;
  // ISO; surface "last seen" subtitle on the public profile / DM header.
  // Null for legacy accounts that have never had `last_seen_at` populated.
  lastSeenAt: string | null;
}

// WS event types. Discriminated union; serialized as JSON over the wire.

export type ChatEvent =
  | { type: 'message:new'; chatId: string; message: ChatMessageDTO; silent?: boolean }
  | { type: 'message:updated'; chatId: string; message: ChatMessageDTO }
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
