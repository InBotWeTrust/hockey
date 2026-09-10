import type { Pool, PoolClient } from 'pg';

type Queryable = Pool | PoolClient;

export async function getAchievementProgress<T>(
  db: Queryable,
  userId: string,
  key: string,
): Promise<T | null> {
  const { rows } = await db.query<{ state: T }>(
    `select state from achievement_progress where user_id = $1 and key = $2`,
    [userId, key],
  );
  return rows[0]?.state ?? null;
}

export async function setAchievementProgress(
  db: Queryable,
  userId: string,
  key: string,
  state: Record<string, unknown>,
): Promise<void> {
  await db.query(
    `insert into achievement_progress (user_id, key, state, updated_at)
     values ($1, $2, $3, now())
     on conflict (user_id, key)
     do update set state = excluded.state, updated_at = now()`,
    [userId, key, JSON.stringify(state)],
  );
}

export async function deleteAchievementProgress(
  db: Queryable,
  userId: string,
  key: string,
): Promise<void> {
  await db.query(`delete from achievement_progress where user_id = $1 and key = $2`, [userId, key]);
}
