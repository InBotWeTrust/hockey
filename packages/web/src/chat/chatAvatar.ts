import type { ChatDTO } from './api.js';

export const OFFICIAL_ACCOUNT_AVATAR_URL = '/icons/official-account.webp?v=2';

export function directChatAvatarUrl(chat: ChatDTO): string | null {
  if (chat.dmCounterpart?.accountKind === 'official') return OFFICIAL_ACCOUNT_AVATAR_URL;
  return chat.dmCounterpart?.avatarUrl ?? null;
}

export function chatAvatarUrl(chat: ChatDTO): string | null {
  return chat.avatarUrl ?? null;
}
