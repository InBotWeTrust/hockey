import { apiFetch } from '../api/apiFetch.js';
export {
  fetchMessages,
  sendMessage,
  addReaction,
  removeReaction,
  deleteMessage,
  markChatAsRead,
} from '../chat/api.js';
export function joinMatchChat(kind: string, id: string): Promise<{ chatId: string }> {
  return apiFetch(`/bar/${encodeURIComponent(kind)}/${encodeURIComponent(id)}/chat`, {
    method: 'POST',
  });
}
