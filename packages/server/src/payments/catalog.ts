import type { Pool } from 'pg';

export type CoinPackageMarker = 'hit' | 'top' | 'premium';

export interface CoinPackageDTO {
  id: string;
  slug: string;
  title: string;
  description: string;
  coinAmount: number;
  priceRub: number;
  badgeText: string | null;
  marker: CoinPackageMarker | null;
  sortOrder: number;
}

interface CoinPackageRow {
  id: string;
  slug: string;
  title: string;
  description: string;
  coin_amount: string;
  price_rub: number;
  badge_text: string | null;
  marker: CoinPackageMarker | null;
  sort_order: number;
}

export async function listActiveCoinPackages(pool: Pool): Promise<CoinPackageDTO[]> {
  const { rows } = await pool.query<CoinPackageRow>(
    `select id, slug, title, description, coin_amount, price_rub, badge_text, marker, sort_order
       from coin_packages
      where is_active = true
      order by sort_order asc, slug asc`,
  );

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    coinAmount: Number(row.coin_amount),
    priceRub: row.price_rub,
    badgeText: row.badge_text,
    marker: row.marker,
    sortOrder: row.sort_order,
  }));
}
