import {useEffect} from 'react';
import {useQuery} from '@tanstack/react-query';
import {fetchChatList,fetchUnreadCounts,type ChatDTO} from '../chat/api.js';
import {useChatStore} from '../chat/chatStore.js';
import {chatKeys} from '../lib/queryKeys.js';

export function useChatUnreadActivity(enabled:boolean){
  const liveUnread = useChatStore((s) => s.unreadByChat);
  // Observe the list cache without adding another list request. The list can
  // refresh independently of the unread endpoint (e.g. after reconnect).
  const { data: chatList } = useQuery<ChatDTO[]>({
    queryKey: chatKeys.list(),
    queryFn: fetchChatList,
    enabled: false,
  });
  const effectiveUnread = { ...liveUnread };
  for (const chat of chatList ?? []) {
    effectiveUnread[chat.id] = Math.max(chat.unreadCount, liveUnread[chat.id] ?? 0);
  }
  const totalUnread = Object.values(effectiveUnread).filter((count) => count > 0).length;
  const messageUnread = {...Object.fromEntries((chatList ?? []).map(chat => [chat.id, chat.unreadCount])), ...liveUnread};
  const unreadMessageCount = Object.values(messageUnread).reduce((sum, count) => sum + Math.max(0, count), 0);
  const setUnread = useChatStore((s) => s.setUnread);

  const { data: unreadMap } = useQuery<Record<string, number>>({
    queryKey: chatKeys.unread(),
    queryFn: fetchUnreadCounts,
    enabled,
    refetchInterval: 30_000,
  });
  useEffect(() => { if (unreadMap) setUnread(unreadMap); }, [unreadMap, setUnread]);
  return {totalUnread,unreadMessageCount};
}
