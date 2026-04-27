import { apiFetch } from '../api/apiFetch.js';

// === DTO types (mirror @hockey/server/src/chat/types.ts) ===

export type ChatType = 'direct' | 'group' | 'system';
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
  content: string;
  replyToId: string | null;
  isDeleted: boolean;
  createdAt: string; // ISO
  reactions: ReactionGroupDTO[];
}

export interface ChatDTO {
  id: string;
  type: ChatType;
  name: string | null;
  entityType: EntityType | null;
  entityId: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  lastMessage: ChatMessageDTO | null;
  lastMessageSenderName: string | null;
  dmCounterpart: { userId: string; displayName: string; avatarUrl: string | null } | null;
  memberCount: number;
}

export type ChatEvent =
  | { type: 'message:new'; chatId: string; message: ChatMessageDTO }
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

export function addReaction(
  messageId: string,
  emoji: string,
): Promise<AddReactionResponse> {
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
