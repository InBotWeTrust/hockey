const BONUS_GAME_ARTWORK_VERSION = '20260829-world-tour-user-pngs-v10';
const BONUS_GAME_GOALKEEPER_VERSION = '20260831-goalkeeper-framing-v1';

type BonusGameCatalogArtworkKind = 'featured' | 'compact';

export function versionBonusGameArtwork(url: string): string {
  if (!url.startsWith('/bonus-games/') || url.includes('?')) return url;
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
