const BONUS_GAME_ARTWORK_VERSION = '20261001-nhl-city-tours-v1';
const CHALLENGE_STORY_ARTWORK_VERSION = '20261007-challenge-story-v1';
const BONUS_GAME_GOALKEEPER_VERSION = '20261001-nhl-city-tours-v1';

type BonusGameCatalogArtworkKind = 'featured' | 'compact';

export function versionBonusGameArtwork(url: string): string {
  if (!url.startsWith('/bonus-games/') || url.includes('?')) return url;
  if (url === '/bonus-games/nhl-cities/previews/philadelphia.webp') return `${url}?v=20261009-philadelphia-v2`;
  if (url.startsWith('/bonus-games/level-previews/') || url.startsWith('/bonus-games/finales/')) {
    return `${url}?v=${CHALLENGE_STORY_ARTWORK_VERSION}`;
  }
  return `${url}?v=${BONUS_GAME_ARTWORK_VERSION}`;
}

export function catalogBonusGameArtwork(
  url: string,
  kind: BonusGameCatalogArtworkKind,
): string {
  const versioned = versionBonusGameArtwork(url);
  const match = versioned.match(/^\/bonus-games\/arenas\/([^?]+)(\?.*)?$/);
  if (match === null) return versioned;
  return `/bonus-games/arenas/${kind}/${match[1]}${match[2] ?? ''}`;
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
