import type { InventoryEquipmentKind, InventoryItem } from '../api/inventory.js';

type InventoryTier = 'bronze' | 'silver' | 'gold';

const FALLBACK_ARTWORK: Record<InventoryEquipmentKind, Record<InventoryTier, string>> = {
  stick: {
    bronze: '/inventory/stick-bronze.webp',
    silver: '/inventory/stick-silver.webp',
    gold: '/inventory/stick-gold.webp',
  },
  skates: {
    bronze: '/inventory/skates-bronze.webp',
    silver: '/inventory/skates-silver.webp',
    gold: '/inventory/skates-gold.webp',
  },
  nutrition: {
    bronze: '/inventory/nutrition-bronze.webp',
    silver: '/inventory/nutrition-silver.webp',
    gold: '/inventory/nutrition-gold.webp',
  },
};

const LEGACY_GROUP_ARTWORK = new Set([
  '/inventory/sticks.webp',
  '/inventory/skates.webp',
  '/inventory/nutrition.webp',
]);

function tierFor(item: InventoryItem): InventoryTier {
  if (item.rarity === 'legendary' || item.rarity === 'epic') return 'gold';
  if (item.rarity === 'rare') return 'silver';
  return 'bronze';
}

export function placeholderArtworkForKind(kind: InventoryEquipmentKind): string {
  return FALLBACK_ARTWORK[kind].bronze;
}

export function artworkForInventoryItem(item: InventoryItem): string {
  if (item.imageUrl && !LEGACY_GROUP_ARTWORK.has(item.imageUrl)) return item.imageUrl;
  return FALLBACK_ARTWORK[item.kind][tierFor(item)];
}
