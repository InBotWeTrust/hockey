import type { InventoryEquipmentKind, InventoryState } from '../api/inventory.js';
import type { BonusGameCard, BonusSkillCode } from '../api/bonusGames.js';
import { achievementThumbnailUrl } from '../achievements/artwork.js';
import { catalogBonusGameArtwork, versionBonusGameArtwork } from '../game/bonusGameArtwork.js';
import { artworkForInventoryItem, placeholderArtworkForKind } from '../screens/inventoryArtwork.js';
import {
  SHOP_CATEGORY_ORDER,
  type ShopCategory,
} from '../screens/inventoryShopCategories.js';
import type { CompetitionLevel, ProfileData } from '../screens/profileTypes.js';
import { arenaCourtImage, arenaVideoCubeImage } from '../screens/lockerRoomBackground.js';
import { AMATEUR_DAILY_COURT_BACKGROUND } from '../game/matchCourt.js';

const CRITICAL_ARTWORK = [
  '/backgrounds/arena-beginner-reference-v8.webp',
  '/backgrounds/arena-amateur-reference-v6.webp',
  '/sprites/app-arena-ice.webp',
  '/daily-game/start.webp',
  '/modes/training-evening.webp',
  '/achievements/first-goal.webp',
] as const;

export const MAX_RETAINED_ARTWORK = 64;
const retainedArtwork = new Map<string, HTMLImageElement>();

const PROFILE_COMMUNITY_ARTWORK = [
  '/icons/vk-community.png',
  '/icons/telegram-community-v2.png',
  '/profile/story-cinema.webp',
] as const;

const EQUIPMENT_ARTWORK_SLOTS: ReadonlyArray<{
  kind: InventoryEquipmentKind;
  equippedKey: keyof InventoryState['equipped'];
}> = [
  { kind: 'stick', equippedKey: 'stickItemId' },
  { kind: 'skates', equippedKey: 'skatesItemId' },
  { kind: 'nutrition', equippedKey: 'nutritionItemId' },
];

const RETAINED_BONUS_GAME_ARTWORK_COUNT = 3;

function selectedEquipmentArtwork(
  inventory: InventoryState,
  kind: InventoryEquipmentKind,
  equippedKey: keyof InventoryState['equipped'],
): string {
  const selectedId = inventory.equipped[equippedKey];
  const selectedItem =
    selectedId === null
      ? undefined
      : inventory.items[kind].find(
          (item) => item.id === selectedId || item.instanceId === selectedId,
        );
  return selectedItem === undefined
    ? placeholderArtworkForKind(kind)
    : artworkForInventoryItem(selectedItem);
}

export function profileArtworkUrls(
  profile: ProfileData,
  inventory: InventoryState,
): readonly string[] {
  const recoveryItem = inventory.items.recovery.find((item) => item.chargesAvailable > 0);
  const urls: Array<string | null | undefined> = [
    profile.avatarUrl,
    ...EQUIPMENT_ARTWORK_SLOTS.map(({ kind, equippedKey }) =>
      selectedEquipmentArtwork(inventory, kind, equippedKey),
    ),
    recoveryItem?.imageUrl ?? '/inventory/recovery-30.webp',
    ...profile.achievements.map((achievement) => achievementThumbnailUrl(achievement.photoUrl)),
    ...PROFILE_COMMUNITY_ARTWORK,
  ];
  return [
    ...new Set(urls.filter((url): url is string => typeof url === 'string' && url.length > 0)),
  ];
}

export function shopArtworkUrls(
  inventory: InventoryState,
  selectedCategory: ShopCategory | null,
): readonly string[] {
  const categoryArtwork =
    selectedCategory === null
      ? []
      : [
          ...(selectedCategory === 'bar'
            ? ['/shop/products/bar-card-v1.webp', '/shop/products/bar-messages-10-v1.webp', '/shop/products/bar-messages-30-v1.webp', '/shop/products/bar-messages-100-v1.webp']
            : inventory.items[selectedCategory].map(artworkForInventoryItem)),
        ];
  return [
    ...new Set([
      '/section-panoramas/shop-v1.webp',
      ...SHOP_CATEGORY_ORDER.map((_,index) => `/section-panoramas/shop-${index}.webp`),
      ...categoryArtwork,
    ]),
  ];
}

export function bonusGameArtworkUrls(
  games: readonly BonusGameCard[],
  selectedSkill: BonusSkillCode,
  featuredGameId: string | null,
): readonly string[] {
  const selectedGames = games.filter((game) => game.skill_code === selectedSkill);
  selectedGames.sort((left, right) => left.sort_order - right.sort_order);
  const featuredGame =
    featuredGameId === null
      ? undefined
      : selectedGames.find((game) => game.id === featuredGameId);
  const compactGames = selectedGames.filter((game) => game.id !== featuredGame?.id);
  return [
    ...new Set<string>(
      [
        ...(featuredGame === undefined
          ? []
          : [
              catalogBonusGameArtwork(featuredGame.arena.thumbnail_url, 'featured'),
              versionBonusGameArtwork(featuredGame.preview_artwork_url),
            ]),
        ...compactGames
          .slice(0, RETAINED_BONUS_GAME_ARTWORK_COUNT - (featuredGame === undefined ? 0 : 1))
          .map((game) => catalogBonusGameArtwork(game.arena.thumbnail_url, 'compact')),
      ],
    ),
  ];
}

export function startupArtworkUrls(level: CompetitionLevel): readonly string[] {
  const urls = [arenaCourtImage(level), arenaVideoCubeImage(level)];
  if (!urls.includes('/sprites/app-arena-ice.webp')) {
    urls.push('/sprites/app-arena-ice.webp');
  }
  if (level !== 'beginner') urls.push(AMATEUR_DAILY_COURT_BACKGROUND);
  return urls;
}

function retainArtwork(cache: Map<string, HTMLImageElement>, url: string, image: HTMLImageElement): void {
  cache.delete(url);
  cache.set(url,image);
  while(cache.size > MAX_RETAINED_ARTWORK)cache.delete(cache.keys().next().value!);
}

type ArtworkJob = { url: string; owner: { cancelled: boolean }; createImage: () => HTMLImageElement };
const artworkQueues = new WeakMap<Map<string, HTMLImageElement>, { active: number; jobs: ArtworkJob[] }>();

/** Speculative warming only. Visible images keep their normal browser priority. */
export function preloadArtwork(
  urls: readonly string[],
  cache: Map<string, HTMLImageElement> = retainedArtwork,
  createImage: () => HTMLImageElement = () => new Image(),
): () => void {
  const owner = { cancelled: false };
  let queue = artworkQueues.get(cache);
  if (!queue) {
    queue = { active: 0, jobs: [] };
    artworkQueues.set(cache, queue);
  }
  const state = queue;
  for (const url of new Set(urls)) {
    const existing = cache.get(url);
    if (existing) { retainArtwork(cache, url, existing); continue; }
    state.jobs.push({ url, owner, createImage });
  }
  const pump = (): void => {
    while (state.active < 4 && state.jobs.length > 0) {
      const job = state.jobs.shift()!;
      if (job.owner.cancelled || cache.has(job.url)) continue;
      const image = job.createImage();
      image.decoding = 'async';
      image.fetchPriority = 'low';
      image.src = job.url;
      retainArtwork(cache, job.url, image);
      state.active++;
      // decode also waits for network completion. It does not block visible img elements.
      void (image.decode?.() ?? Promise.resolve()).catch(() => {
        if (cache.get(job.url) === image) cache.delete(job.url);
      }).finally(() => { state.active--; pump(); });
    }
  };
  pump();
  return () => {
    owner.cancelled = true;
    state.jobs = state.jobs.filter(job => job.owner !== owner);
  };
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
    retainArtwork(cache, url, image);
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
