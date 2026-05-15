import type { ChatDTO, ChatType } from './api.js';

export const DEFAULT_NEWS_CHANNEL_AVATAR_URL = '/icons/app-logo.webp';
export const DEFAULT_SYSTEM_CHAT_AVATAR_URL = '/icons/app-logo.webp';

export function defaultChatAvatarUrl(type: ChatType, channelSlug?: string | null): string | null {
  if (type === 'channel' && channelSlug === 'news') return DEFAULT_NEWS_CHANNEL_AVATAR_URL;
  if (type === 'system') return DEFAULT_SYSTEM_CHAT_AVATAR_URL;
  return null;
}

export function chatAvatarUrl(chat: ChatDTO): string | null {
  return chat.avatarUrl ?? defaultChatAvatarUrl(chat.type, chat.channelSlug);
}
