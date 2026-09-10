const BONUS_GAME_ARTWORK_VERSION = '20260829-world-tour-user-pngs-v10';
const BONUS_GAME_GOALKEEPER_VERSION = '20260831-goalkeeper-framing-v1';

export function versionBonusGameArtwork(url: string): string {
  if (!url.startsWith('/bonus-games/') || url.includes('?')) return url;
  return `${url}?v=${BONUS_GAME_ARTWORK_VERSION}`;
}

export function versionBonusGameGoalkeeper(url: string): string {
  if (
    !url.startsWith('/bonus-games/') ||
    !url.includes('/goalkeepers/') ||
    url.includes('?')
  ) {
    return url;
  }
  return `${url}?v=${BONUS_GAME_GOALKEEPER_VERSION}`;
}
