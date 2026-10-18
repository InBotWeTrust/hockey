import type { VisitorProduct } from '@hockey/game-core';

export function visitorProductArtwork(product: VisitorProduct): string {
  if (product.kind === 'card') return '/shop/products/bar-card-v1.webp';
  const tier = product.amount <= 10 ? 10 : product.amount <= 30 ? 30 : 100;
  return `/shop/products/bar-messages-${tier}-v1.webp`;
}
export function visitorProductTitle(product: VisitorProduct): string {
  return product.kind === 'card' && product.title === 'Карта посетителя'
    ? 'Карта постоянного клиента'
    : product.title;
}
