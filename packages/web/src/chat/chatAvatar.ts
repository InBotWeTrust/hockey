import type { ChatDTO } from './api.js';

export function chatAvatarUrl(chat: ChatDTO): string | null {
  return chat.avatarUrl ?? null;
}
