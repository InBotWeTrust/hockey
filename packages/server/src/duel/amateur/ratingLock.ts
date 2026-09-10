import type { PoolClient } from 'pg';

// One gate precedes match rows and user/account writes. It also covers a match
// moving between seasons, so closure never waits for a match holding its season.
export async function lockRatingLifecycle(client: PoolClient): Promise<void> {
  await client.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [
    'monthly_duel_rating:lifecycle',
  ]);
}

export function nextRatingMonthBoundary(seasonKey: string): Date {
  const [year, month] = seasonKey.split('-').map(Number);
  return new Date(Date.UTC(year!, month!, 1, -3));
}
