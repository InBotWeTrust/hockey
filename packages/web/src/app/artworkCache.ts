import type { CompetitionLevel } from '../screens/profileTypes.js';
import { arenaCourtImage, arenaVideoCubeImage } from '../screens/lockerRoomBackground.js';

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

export function startupArtworkUrls(level: CompetitionLevel): readonly string[] {
  const urls = [arenaCourtImage(level), arenaVideoCubeImage(level)];
  if (!urls.includes('/sprites/app-arena-ice.webp')) {
    urls.push('/sprites/app-arena-ice.webp');
  }
  return urls;
}

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

function preloadArtworkAndWait(
  url: string,
  cache: Map<string, HTMLImageElement>,
  createImage: () => HTMLImageElement,
): Promise<void> {
  let image = cache.get(url);
  if (!image) {
    image = createImage();
    image.decoding = 'async';
    image.fetchPriority = 'high';
    image.src = url;
    cache.set(url, image);
  }

  if (typeof image.decode === 'function') {
    return image.decode().catch(() => undefined);
  }
  if (image.complete) return Promise.resolve();
  return new Promise((resolve) => {
    image.addEventListener('load', () => resolve(), { once: true });
    image.addEventListener('error', () => resolve(), { once: true });
  });
}

export async function preloadStartupArtwork(
  level: CompetitionLevel,
  cache: Map<string, HTMLImageElement> = retainedArtwork,
  createImage: () => HTMLImageElement = () => new Image(),
): Promise<void> {
  await Promise.all(
    startupArtworkUrls(level).map((url) => preloadArtworkAndWait(url, cache, createImage)),
  );
}

export function preloadCriticalArtwork(): void {
  preloadArtwork(CRITICAL_ARTWORK);
}
