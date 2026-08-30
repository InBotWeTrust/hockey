import type { InventoryEquipmentKind, InventoryItem } from '../api/inventory.js';

type InventoryTier = 'bronze' | 'silver' | 'gold';
type InventoryArtworkItem = Pick<InventoryItem, 'kind' | 'rarity'> & {
  imageUrl?: string | null;
};

const INVENTORY_ARTWORK_VERSION = '20260830-base-equipment-v1';

function versionInventoryArtwork(url: string): string {
  if (!url.startsWith('/inventory/') || url.includes('?')) return url;
  return `${url}?v=${INVENTORY_ARTWORK_VERSION}`;
}

const FALLBACK_ARTWORK: Record<InventoryEquipmentKind, Record<InventoryTier, string>> = {
  stick: {
    bronze: versionInventoryArtwork('/inventory/stick-bronze.webp'),
    silver: versionInventoryArtwork('/inventory/stick-silver.webp'),
    gold: versionInventoryArtwork('/inventory/stick-gold.webp'),
  },
  skates: {
    bronze: versionInventoryArtwork('/inventory/skates-bronze.webp'),
    silver: versionInventoryArtwork('/inventory/skates-silver.webp'),
    gold: versionInventoryArtwork('/inventory/skates-gold.webp'),
  },
  nutrition: {
    bronze: versionInventoryArtwork('/inventory/nutrition-bronze.webp'),
    silver: versionInventoryArtwork('/inventory/nutrition-silver.webp'),
    gold: versionInventoryArtwork('/inventory/nutrition-gold.webp'),
  },
};

const BASE_ARTWORK: Record<InventoryEquipmentKind, string> = {
  stick: versionInventoryArtwork('/inventory/stick-base.webp'),
  skates: versionInventoryArtwork('/inventory/skates-base.webp'),
  nutrition: versionInventoryArtwork('/inventory/nutrition-none.webp'),
};

const LEGACY_GROUP_ARTWORK = new Set([
  '/inventory/sticks.webp',
  '/inventory/skates.webp',
  '/inventory/nutrition.webp',
]);

function tierFor(item: InventoryArtworkItem): InventoryTier {
  if (item.rarity === 'legendary' || item.rarity === 'epic') return 'gold';
  if (item.rarity === 'rare') return 'silver';
  return 'bronze';
}

export function placeholderArtworkForKind(kind: InventoryEquipmentKind): string {
  return BASE_ARTWORK[kind];
}

export function artworkForInventoryItem(item: InventoryArtworkItem): string {
  if (item.imageUrl && !LEGACY_GROUP_ARTWORK.has(item.imageUrl)) {
    return versionInventoryArtwork(item.imageUrl);
  }
  return FALLBACK_ARTWORK[item.kind][tierFor(item)];
}
