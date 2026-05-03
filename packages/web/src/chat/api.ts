import { apiFetch, ApiError } from '../api/apiFetch.js';
import type {
  CompetitionLevel,
  ProfileAchievement,
  ProfileStats,
} from '../screens/profileTypes.js';

// === DTO types (mirror @hockey/server/src/chat/types.ts) ===

export type ChatType = 'direct' | 'group' | 'system' | 'channel';
export type EntityType = 'team' | 'tournament';

export interface ReactionGroupDTO {
  emoji: string;
  count: number;
  reactedByMe: boolean;
}

export interface ChatMessageDTO {
  id: string;
  chatId: string;
  senderId: string;
  senderDisplayName: string | null;
  senderAvatarUrl: string | null;
  content: string;
  replyToId: string | null;
  isDeleted: boolean;
  createdAt: string; // ISO
  reactions: ReactionGroupDTO[];
  commentCount?: number;
  viewCount?: number;
}

export interface ChatDTO {
  id: string;
  type: ChatType;
  name: string | null;
  entityType: EntityType | null;
  entityId: string | null;
  channelSlug?: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  lastMessage: ChatMessageDTO | null;
  lastMessageSenderName: string | null;
  dmCounterpart: {
    userId: string;
    displayName: string;
    avatarUrl: string | null;
    lastSeenAt: string | null;
  } | null;
  memberCount: number;
  pinnedAt: string | null;
}

export type ChatEvent =
  | { type: 'message:new'; chatId: string; message: ChatMessageDTO; silent?: boolean }
  | { type: 'message:deleted'; chatId: string; messageId: string }
  | { type: 'reaction:added'; chatId: string; messageId: string; userId: string; emoji: string }
  | { type: 'reaction:removed'; chatId: string; messageId: string; userId: string; emoji: string }
  | { type: 'chat:read'; chatId: string; userId: string; lastReadAt: string }
  | { type: 'connection:ready' };

export interface ChatEventFrame {
  v: 1;
  event: ChatEvent;
}

export interface UserPickerItem {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface MessageSearchHit {
  id: string;
  chatId: string;
  content: string;
  senderName: string;
  createdAt: string;
}

export interface FindOrCreateDMResult {
  chatId: string;
  created: boolean;
}

// === REST wrappers ===

export function fetchChatList(): Promise<ChatDTO[]> {
  return apiFetch<ChatDTO[]>('/chat/list');
}

export function findOrCreateDM(otherUserId: string): Promise<FindOrCreateDMResult> {
  return apiFetch<FindOrCreateDMResult>('/chat/dm', {
    method: 'POST',
    body: JSON.stringify({ otherUserId }),
  });
}

export function searchUsers(q: string, limit = 20): Promise<UserPickerItem[]> {
  const params = new URLSearchParams({ q, limit: String(limit) });
  return apiFetch<UserPickerItem[]>(`/chat/users?${params.toString()}`);
}

export interface FetchMessagesOpts {
  before?: string; // ISO
  after?: string; // ISO
  around?: string; // message UUID
  radius?: number;
  limit?: number; // default 50
}

export function fetchMessages(
  chatId: string,
  opts: FetchMessagesOpts = {},
): Promise<ChatMessageDTO[]> {
  const params = new URLSearchParams();
  if (opts.before) params.set('before', opts.before);
  if (opts.after) params.set('after', opts.after);
  if (opts.around) params.set('around', opts.around);
  if (opts.radius !== undefined) params.set('radius', String(opts.radius));
  params.set('limit', String(opts.limit ?? 50));
  return apiFetch<ChatMessageDTO[]>(`/chat/${chatId}/messages?${params.toString()}`);
}

export interface ChannelPostCommentDTO {
  id: string;
  postId: string;
  authorId: string;
  authorDisplayName: string | null;
  authorAvatarUrl: string | null;
  content: string;
  isDeleted: boolean;
  createdAt: string;
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

export function fetchChannelPost(postId: string): Promise<ChatMessageDTO> {
  return apiFetch<ChatMessageDTO>(`/chat/channel/posts/${postId}`);
}

export function fetchChannelPostComments(postId: string): Promise<ChannelPostCommentDTO[]> {
  return apiFetch<ChannelPostCommentDTO[]>(`/chat/channel/posts/${postId}/comments`);
}

export function sendChannelPostComment(
  postId: string,
  content: string,
): Promise<ChannelPostCommentDTO> {
  return apiFetch<ChannelPostCommentDTO>(`/chat/channel/posts/${postId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
}

export function fetchChannelPostViewers(postId: string): Promise<ChannelPostViewerDTO[]> {
  return apiFetch<ChannelPostViewerDTO[]>(`/chat/channel/posts/${postId}/views`);
}

export function fetchChannelPostReactionUsers(
  postId: string,
): Promise<ChannelPostReactionUserDTO[]> {
  return apiFetch<ChannelPostReactionUserDTO[]>(`/chat/channel/posts/${postId}/reactions/users`);
}

export interface SendMessageBody {
  content: string;
  replyToId?: string;
}

export function sendMessage(chatId: string, body: SendMessageBody): Promise<ChatMessageDTO> {
  return apiFetch<ChatMessageDTO>(`/chat/${chatId}/messages`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function deleteMessage(messageId: string): Promise<void> {
  return apiFetch<void>(`/chat/messages/${messageId}`, { method: 'DELETE' });
}

export function markChatAsRead(chatId: string): Promise<void> {
  return apiFetch<void>(`/chat/${chatId}/read`, { method: 'POST' });
}

export function searchMessagesApi(q: string, limit = 50): Promise<MessageSearchHit[]> {
  const params = new URLSearchParams({ q, limit: String(limit) });
  return apiFetch<MessageSearchHit[]>(`/chat/search?${params.toString()}`);
}

export function fetchUnreadCounts(): Promise<Record<string, number>> {
  return apiFetch<Record<string, number>>('/chat/unread');
}

export interface AddReactionResponse {
  messageId: string;
  emoji: string;
  removed: string | null;
}

export function addReaction(messageId: string, emoji: string): Promise<AddReactionResponse> {
  return apiFetch<AddReactionResponse>(`/chat/messages/${messageId}/reactions`, {
    method: 'POST',
    body: JSON.stringify({ emoji }),
  });
}

export function removeReaction(messageId: string, emoji: string): Promise<void> {
  return apiFetch<void>(`/chat/messages/${messageId}/reactions`, {
    method: 'DELETE',
    body: JSON.stringify({ emoji }),
  });
}

export const PIN_LIMIT = 3;

export class PinLimitError extends Error {
  constructor() {
    super('pin_limit_exceeded');
    this.name = 'PinLimitError';
  }
}

export async function pinChat(chatId: string): Promise<void> {
  try {
    await apiFetch<void>(`/chat/${chatId}/pin`, { method: 'POST' });
  } catch (err) {
    // Server returns 400 with code='pin_limit_exceeded' once the user is at
    // the limit. Translate that into a typed error so the screen can show
    // the localized toast without parsing message strings.
    if (err instanceof ApiError && err.code === 'pin_limit_exceeded') {
      throw new PinLimitError();
    }
    throw err;
  }
}

export function unpinChat(chatId: string): Promise<void> {
  return apiFetch<void>(`/chat/${chatId}/pin`, { method: 'DELETE' });
}

export interface ChatMemberSummaryDTO {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface ChatInfoDTO {
  id: string;
  type: ChatType;
  name: string | null;
  description: string | null;
  memberCount: number;
  members: ChatMemberSummaryDTO[];
}

export interface UserPublicProfileDTO {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  competitionLevel: CompetitionLevel;
  stats: ProfileStats;
  achievements: ProfileAchievement[];
  createdAt: string; // ISO
  lastSeenAt: string | null; // ISO; null = never recorded
}

export function fetchChatInfo(chatId: string): Promise<ChatInfoDTO> {
  return apiFetch<ChatInfoDTO>(`/chat/${chatId}/info`);
}

export function fetchUserProfile(userId: string): Promise<UserPublicProfileDTO> {
  return apiFetch<UserPublicProfileDTO>(`/users/${userId}`);
}
