import {useChatUnreadActivity} from './useChatUnreadActivity.js';
import { useQuery } from '@tanstack/react-query';
import { fetchAmateurEvents, type AmateurDuelMatch } from '../api/amateurDuel.js';
import { fetchActiveClassicTournamentGames } from '../api/tournamentClassic.js';

export function isActionableDuelEvent(match: AmateurDuelMatch): boolean {
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
  const {totalUnread,unreadMessageCount}=useChatUnreadActivity(enabled);
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
  const gameActionCount =
    (amateurEvents?.events ?? []).filter(isActionableDuelEvent).length +
    (classicTournamentGames?.games ?? []).filter(
      (game) => game.state !== 'closed' && String(game.state) !== 'completed',
    ).length;
  return { totalUnread, unreadMessageCount, gameActionCount };
}
