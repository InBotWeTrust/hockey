const CRITICAL_ARTWORK = [
  '/backgrounds/arena-beginner-reference-v8.webp',
  '/backgrounds/arena-amateur-reference-v6.webp',
  '/sprites/app-arena-ice.webp',
  '/daily-game/start.webp',
  '/modes/training-evening.webp',
  '/achievements/first-goal.webp',
  '/modes/shop-retail.webp',
  '/modes/amateur-game.webp',
  '/modes/pro-game.webp',
  '/bonus-games/section-card.webp',
  '/profile/stats-card-art.png',
  '/profile/equipment-card-art.png',
  '/profile/achievements-card-art.png',
  '/profile/arena-card-art.png',
  '/profile/settings-card-art.png',
] as const;

const retainedArtwork = new Map<string, HTMLImageElement>();

export function preloadArtwork(
  urls: readonly string[],
  cache: Map<string, HTMLImageElement> = retainedArtwork,
  createImage: () => HTMLImageElement = () => new Image(),
): void {
  for (const url of urls) {
    if (cache.has(url)) continue;
    const image = createImage();
    image.decoding = 'async';
    image.fetchPriority = 'low';
    image.src = url;
    cache.set(url, image);
  }
}

export function preloadCriticalArtwork(): void {
  preloadArtwork(CRITICAL_ARTWORK);
}
