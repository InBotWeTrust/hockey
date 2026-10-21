import type { ColumnLocation } from './columnNavigationStore.js';
export function isGameLocation({ pathname, search }: ColumnLocation): boolean {
  if (
    /^\/(?:duel\/|bonus-games\/[^/]+\/play(?:\/|$)|bar\/(?:games\/match\/|cards\/(?:computer|match)\/))/.test(
      pathname,
    )
  )
    return true;
  if (
    /^\/bar\/(?:darts|battleship|checkers|billiards|armwrestling|blackjack|fight)\//.test(pathname)
  )
    return true;
  if (pathname === '/bar/cards/maria') return true;
  if (pathname !== '/') return false;
  const params = new URLSearchParams(search);
  return (
    params.get('play') === '1' ||
    params.has('exercise') ||
    params.has('match') ||
    ['daily', 'classic'].includes(params.get('view') ?? '')
  );
}
