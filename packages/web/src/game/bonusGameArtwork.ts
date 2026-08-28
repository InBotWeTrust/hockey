const BONUS_GAME_ARTWORK_VERSION = '20260828-world-tour-regenerated-v5';

export function versionBonusGameArtwork(url: string): string {
  if (!url.startsWith('/bonus-games/') || url.includes('?')) return url;
  return `${url}?v=${BONUS_GAME_ARTWORK_VERSION}`;
}
