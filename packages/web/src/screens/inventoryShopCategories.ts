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
    description: 'Выбрать клюшку',
    artworkUrl: '/shop/categories/sticks.webp',
    className: 'shop-zone--sticks',
  },
  skates: {
    title: 'Коньки',
    description: 'Выбрать коньки',
    artworkUrl: '/shop/categories/skates.webp',
    className: 'shop-zone--skates',
  },
  nutrition: {
    title: 'Питание',
    description: 'Выбрать питание',
    artworkUrl: '/shop/categories/nutrition.webp',
    className: 'shop-zone--nutrition',
  },
  recovery: {
    title: 'Восстановление',
    description: 'Выбрать набор',
    artworkUrl: '/shop/categories/recovery.webp',
    className: 'shop-zone--recovery',
  },
} satisfies Record<ShopCategory, {
  title: string;
  description: string;
  artworkUrl: string;
  className: string;
}>;

export function parseShopCategory(value: string | null): ShopCategory | null {
  return value !== null && SHOP_CATEGORY_ORDER.includes(value as ShopCategory)
    ? (value as ShopCategory)
    : null;
}
