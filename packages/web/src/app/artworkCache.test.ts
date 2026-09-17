import { describe, expect, it, vi } from 'vitest';
import {
  preloadArtwork,
  preloadStartupArtwork,
  profileArtworkUrls,
  shopArtworkUrls,
  startupArtworkUrls,
} from './artworkCache.js';
import type { InventoryItem, InventoryState } from '../api/inventory.js';
import type { ProfileData } from '../screens/profileTypes.js';

function inventoryItem(overrides: Partial<InventoryItem>): InventoryItem {
  return {
    id: 'item',
    kind: 'stick',
    title: 'Предмет',
    description: '',
    imageUrl: null,
    currencyPrice: 0,
    chargesPerPurchase: 1,
    rarity: 'common',
    powerScore: 0,
    duelPeriodCost: 0,
    chargesAvailable: 1,
    chargesReserved: 0,
    ...overrides,
  };
}

function profileWithArtwork(): ProfileData {
  return {
    id: 'player-1',
    registeredAt: '2026-09-17T00:00:00.000Z',
    displayName: 'Игрок',
    avatarUrl: '/avatars/player.webp',
    grip: 'right',
    competitionLevel: 'beginner',
    stats: { shots: 0, goals: 0, accuracy: 0, playStreakDays: 0 },
    achievements: [
      {
        id: 'achievement-1',
        photoUrl: '/achievements/first-goal.webp',
        title: 'Первая шайба',
        description: '',
        requirement: '',
        isUnlocked: true,
      },
    ],
  };
}

function inventoryWithSelectedEquipment(): InventoryState {
  return {
    balances: { tokens: 0, stars: 0 },
    equipped: {
      stickItemId: 'stick-1',
      skatesItemId: 'skates-1',
      nutritionItemId: 'nutrition-1',
    },
    items: {
      stick: [inventoryItem({ id: 'stick-1', kind: 'stick', imageUrl: '/inventory/stick.webp' })],
      skates: [
        inventoryItem({
          id: 'skates-1',
          kind: 'skates',
          imageUrl: '/inventory/skates-custom.webp',
        }),
      ],
      nutrition: [
        inventoryItem({
          id: 'nutrition-1',
          kind: 'nutrition',
          imageUrl: '/inventory/nutrition-custom.webp',
        }),
      ],
      recovery: [
        inventoryItem({
          id: 'recovery-1',
          kind: 'recovery',
          imageUrl: '/inventory/recovery.webp',
        }),
      ],
    },
  };
}

describe('preloadArtwork', () => {
  it('collects the shop overview and only the open category artwork', () => {
    expect(shopArtworkUrls(inventoryWithSelectedEquipment(), 'recovery')).toEqual([
      '/shop/shop-background.webp',
      '/shop/categories/sticks.webp',
      '/shop/categories/skates.webp',
      '/shop/categories/nutrition.webp',
      '/shop/categories/recovery.webp',
      '/shop/backgrounds/recovery.webp',
      '/inventory/recovery.webp?v=20260911-locker-equipment-v2',
    ]);
  });

  it('collects exactly the visible profile artwork and preserves each URL once', () => {
    const profile = profileWithArtwork();
    profile.achievements.push({ ...profile.achievements[0]!, id: 'achievement-2' });

    expect(profileArtworkUrls(profile, inventoryWithSelectedEquipment())).toEqual([
      '/avatars/player.webp',
      '/inventory/stick.webp?v=20260911-locker-equipment-v2',
      '/inventory/skates-custom.webp?v=20260911-locker-equipment-v2',
      '/inventory/nutrition-custom.webp?v=20260911-locker-equipment-v2',
      '/inventory/recovery.webp',
      '/achievements/thumbnails/first-goal.webp',
      '/icons/vk-community.png',
      '/icons/telegram-community-v2.png',
      '/profile/story-cinema.webp',
    ]);
  });

  it('warms each stable artwork URL once and retains the decoded image', () => {
    const cache = new Map<string, HTMLImageElement>();
    const created: Array<{ decoding: string; fetchPriority: string; src: string }> = [];
    const createImage = vi.fn(() => {
      const image = { decoding: '', fetchPriority: '', src: '' };
      created.push(image);
      return image as HTMLImageElement;
    });

    preloadArtwork(['/background.webp', '/profile.webp'], cache, createImage);
    preloadArtwork(['/profile.webp'], cache, createImage);

    expect(createImage).toHaveBeenCalledTimes(2);
    expect(created).toEqual([
      { decoding: 'async', fetchPriority: 'low', src: '/background.webp' },
      { decoding: 'async', fetchPriority: 'low', src: '/profile.webp' },
    ]);
    expect([...cache.keys()]).toEqual(['/background.webp', '/profile.webp']);
  });

  it('uses the signed-in player level for the first arena background and cube', () => {
    expect(startupArtworkUrls('beginner')).toEqual([
      '/backgrounds/arena-beginner-reference-v8.webp',
      '/sprites/app-arena-cube-beginner.webp',
      '/sprites/app-arena-ice.webp',
    ]);
    expect(startupArtworkUrls('amateur')).toEqual([
      '/backgrounds/arena-amateur-reference-v6.webp',
      '/sprites/app-arena-cube-amateur.webp',
      '/sprites/app-arena-ice.webp',
    ]);
    expect(startupArtworkUrls('professional')).toEqual([
      '/sprites/app-arena-ice.webp',
      '/sprites/app-arena-cube.webp',
    ]);
  });

  it('waits for the selected-level artwork to decode before releasing the startup screen', async () => {
    const resolveDecodes: Array<() => void> = [];
    const decode = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveDecodes.push(resolve);
        }),
    );
    const createImage = vi.fn(
      () => ({ decoding: '', fetchPriority: '', src: '', decode }) as unknown as HTMLImageElement,
    );

    const preloading = preloadStartupArtwork('amateur', new Map(), createImage);

    expect(createImage).toHaveBeenCalledTimes(3);
    expect(decode).toHaveBeenCalledTimes(3);
    resolveDecodes.forEach((resolve) => resolve());
    await preloading;
  });
});
