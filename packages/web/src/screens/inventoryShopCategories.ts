import type { InventoryKind } from '../api/inventory.js';

export type ShopCategory = InventoryKind;

export const SHOP_CATEGORY_ORDER: ShopCategory[] = [
  'stick',
  'skates',
  'nutrition',
  'recovery',
];

export const SHOP_CATEGORY_META = {
  stick: {
    title: 'Клюшки',
    artworkUrl: '/shop/categories/sticks.webp',
    backgroundUrl: '/shop/backgrounds/sticks.webp',
    className: 'shop-zone--sticks',
  },
  skates: {
    title: 'Коньки',
    artworkUrl: '/shop/categories/skates.webp',
    backgroundUrl: '/shop/backgrounds/skates.webp',
    className: 'shop-zone--skates',
  },
  nutrition: {
    title: 'Питание',
    artworkUrl: '/shop/categories/nutrition.webp',
    backgroundUrl: '/shop/backgrounds/nutrition.webp',
    className: 'shop-zone--nutrition',
  },
  recovery: {
    title: 'Восстановление',
    artworkUrl: '/shop/categories/recovery.webp',
    backgroundUrl: '/shop/backgrounds/recovery.webp',
    className: 'shop-zone--recovery',
  },
} satisfies Record<ShopCategory, {
  title: string;
  artworkUrl: string;
  backgroundUrl: string;
  className: string;
}>;

export function parseShopCategory(value: string | null): ShopCategory | null {
  return value !== null && SHOP_CATEGORY_ORDER.includes(value as ShopCategory)
    ? (value as ShopCategory)
    : null;
}
