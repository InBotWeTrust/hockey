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

// A waiting player still has an unfinished match; navigation is not an action queue.
export function isUnfinishedDuelEvent(match: AmateurDuelMatch): boolean {
  return match.status === 'invited'
    ? match.me.side === 'opponent' && match.me.state === 'invited'
    : match.status === 'ready_check' || match.status === 'active';
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
  const duelActionCount = (amateurEvents?.events ?? []).filter(isActionableDuelEvent).length;
  const gameActionCount =
    duelActionCount +
    (classicTournamentGames?.games ?? []).filter(
      (game) => game.state !== 'closed' && String(game.state) !== 'completed',
    ).length;
  const unfinishedDuels = (amateurEvents?.events ?? []).filter(isUnfinishedDuelEvent);
  const duelActivityCount = unfinishedDuels.filter(match => match.source !== 'tournament').length;
  const tournamentGames = (classicTournamentGames?.games ?? []).filter(
    game => game.state !== 'closed' && String(game.state) !== 'completed',
  );
  const tournamentMatchIds = new Set(tournamentGames.flatMap(game =>
    game.kind === 'playoff' && game.duel_match_id ? [game.duel_match_id] : [],
  ));
  const tournamentActivityCount = tournamentGames.length + unfinishedDuels.filter(match =>
    match.source === 'tournament' && !tournamentMatchIds.has(match.id),
  ).length;
  const stadiumActivityCount = duelActivityCount + tournamentActivityCount;
  return { totalUnread, unreadMessageCount, gameActionCount, duelActionCount,
    duelActivityCount, tournamentActivityCount, stadiumActivityCount };

}
