import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

export interface FindOrCreateInput {
  providerUid: string;
  displayName: string;
  avatarUrl?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
}

export interface AppUser {
  id: string;
  displayName: string;
}

export async function findOrCreateTelegramUser(
  pool: Pool,
  input: FindOrCreateInput,
): Promise<AppUser> {
  const providerData = JSON.stringify({
    ...(input.username !== undefined ? { username: input.username } : {}),
    ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
    ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
  });

  const existing = await pool.query<{ id: string; display_name: string }>(
    `select u.id, u.display_name
       from users u
       join auth_providers ap on ap.user_id = u.id
      where ap.provider = 'telegram' and ap.provider_uid = $1`,
    [input.providerUid],
  );

  if (existing.rowCount && existing.rowCount > 0) {
    const row = existing.rows[0]!;
    await Promise.all([
      input.avatarUrl !== undefined
        ? pool.query('update users set avatar_url = $1 where id = $2', [input.avatarUrl, row.id])
        : Promise.resolve(),
      pool.query(
        `update auth_providers set provider_data = $1
          where user_id = $2 and provider = 'telegram'`,
        [providerData, row.id],
      ),
    ]);
    return { id: row.id, displayName: row.display_name };
  }

  const client = await pool.connect();
  try {
    await client.query('begin');
    const userId = randomUUID();
    const providerId = randomUUID();
    await client.query(
      'insert into users (id, display_name, avatar_url) values ($1, $2, $3)',
      [userId, input.displayName, input.avatarUrl ?? null],
    );
    await client.query(
      `insert into auth_providers (id, user_id, provider, provider_uid, provider_data)
       values ($1, $2, $3, $4, $5)`,
      [providerId, userId, 'telegram', input.providerUid, providerData],
    );
    await client.query('insert into user_wallet (user_id) values ($1)', [userId]);
    await client.query('insert into user_equipment (user_id) values ($1)', [userId]);
    await client.query(
      "insert into user_sticks (user_id, stick_id) values ($1, 'training')",
      [userId],
    );
    await client.query('commit');
    return { id: userId, displayName: input.displayName };
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}
