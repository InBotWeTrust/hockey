import type { InventoryEquipmentKind, InventoryState } from '../api/inventory.js';
import type { BonusGameCard, BonusSkillCode } from '../api/bonusGames.js';
import { achievementThumbnailUrl } from '../achievements/artwork.js';
import { catalogBonusGameArtwork } from '../game/bonusGameArtwork.js';
import { artworkForInventoryItem, placeholderArtworkForKind } from '../screens/inventoryArtwork.js';
import {
  SHOP_CATEGORY_META,
  SHOP_CATEGORY_ORDER,
  type ShopCategory,
} from '../screens/inventoryShopCategories.js';
import type { CompetitionLevel, ProfileData } from '../screens/profileTypes.js';
import { arenaCourtImage, arenaVideoCubeImage } from '../screens/lockerRoomBackground.js';

const CRITICAL_ARTWORK = [
  '/backgrounds/arena-beginner-reference-v8.webp',
  '/backgrounds/arena-amateur-reference-v6.webp',
  '/sprites/app-arena-ice.webp',
  '/daily-game/start.webp',
  '/modes/training-evening.webp',
  '/achievements/first-goal.webp',
  '/modes/shop-retail-v2.webp',
  '/modes/amateur-game-v3.webp',
  '/modes/pro-game.webp',
  '/bonus-games/section-card-v5.webp',
  '/profile/stats-card-art.png',
  '/profile/equipment-card-art.png',
  '/profile/achievements-card-art.png',
  '/profile/arena-card-art.png',
  '/profile/settings-card-art.png',
] as const;

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
          SHOP_CATEGORY_META[selectedCategory].backgroundUrl,
          ...inventory.items[selectedCategory].map(artworkForInventoryItem),
        ];
  return [
    ...new Set([
      '/shop/shop-background.webp',
      ...SHOP_CATEGORY_ORDER.map((category) => SHOP_CATEGORY_META[category].artworkUrl),
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
          : [catalogBonusGameArtwork(featuredGame.arena.thumbnail_url, 'featured')]),
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
