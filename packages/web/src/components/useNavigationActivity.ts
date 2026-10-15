import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAmateurEvents, type AmateurDuelMatch } from '../api/amateurDuel.js';
import { fetchActiveClassicTournamentGames } from '../api/tournamentClassic.js';
import { fetchChatList, fetchUnreadCounts, type ChatDTO } from '../chat/api.js';
import { useChatStore } from '../chat/chatStore.js';
import { chatKeys } from '../lib/queryKeys.js';

function isActionableDuelEvent(match: AmateurDuelMatch): boolean {
  if (match.status === 'invited') {
    return match.me.side === 'opponent' && match.me.state === 'invited';
  }
  if (match.status === 'ready_check') {
    return match.me.state !== 'ready' || match.opponent.state === 'ready';
  }
  if (match.status === 'active') {
    return match.me.state === 'accepted' || match.me.state === 'period_active';
  }
  return false;
}

// Navigation and the district map observe the same keys and polling policy.
export function useNavigationActivity(enabled: boolean) {
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
  const setUnread = useChatStore((s) => s.setUnread);

  const { data: unreadMap } = useQuery<Record<string, number>>({
    queryKey: chatKeys.unread(),
    queryFn: fetchUnreadCounts,
    enabled,
    refetchInterval: 30_000,
  });
  const { data: amateurEvents } = useQuery({
    queryKey: ['amateur-duel', 'events'],
    queryFn: fetchAmateurEvents,
    enabled,
    refetchInterval: 15_000,
  });
  const { data: classicTournamentGames } = useQuery({
    queryKey: ['tournaments', 'classic', 'active'],
    queryFn: fetchActiveClassicTournamentGames,
    enabled,
    refetchInterval: 30_000,
  });
  useEffect(() => { if (unreadMap) setUnread(unreadMap); }, [unreadMap, setUnread]);
  const gameActionCount =
    (amateurEvents?.events ?? []).filter(isActionableDuelEvent).length +
    (classicTournamentGames?.games ?? []).filter(
      (game) => game.state !== 'closed' && String(game.state) !== 'completed',
    ).length;
  return { totalUnread, gameActionCount };
}
