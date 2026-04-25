import type { PoolClient, Pool } from 'pg';

export type EventType =
  | 'shot_mismatch'
  | 'day_pool_created'
  | 'day_pool_closed'
  | 'period_closed';

export async function appendEvent(
  conn: Pool | PoolClient,
  userId: string,
  type: EventType,
  payload: Record<string, unknown>,
): Promise<void> {
  await conn.query(
    'insert into event_log (user_id, type, payload) values ($1, $2, $3)',
    [userId, type, JSON.stringify(payload)],
  );
}
