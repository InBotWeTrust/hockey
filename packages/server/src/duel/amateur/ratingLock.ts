import type { PoolClient } from 'pg';

// Gameplay shares the gate; month closure takes it exclusively. Both acquire it
// before player/match/account locks, including when a match moves between seasons.
export async function lockRatingLifecycle(
  client: PoolClient,
  mode: 'shared' | 'exclusive' = 'shared',
): Promise<void> {
  const lock = mode === 'exclusive' ? 'pg_advisory_xact_lock' : 'pg_advisory_xact_lock_shared';
  await client.query(`select ${lock}(hashtextextended($1, 0))`, [
    'monthly_duel_rating:lifecycle',
  ]);
}

export function nextRatingMonthBoundary(seasonKey: string): Date {
  const [year, month] = seasonKey.split('-').map(Number);
  return new Date(Date.UTC(year!, month!, 1, -3));
}
