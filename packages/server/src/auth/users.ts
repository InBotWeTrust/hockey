import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

export interface FindOrCreateInput {
  providerUid: string;
  displayName: string;
  avatarUrl?: string;
}

export interface AppUser {
  id: string;
  displayName: string;
}

export async function findOrCreateTelegramUser(
  pool: Pool,
  input: FindOrCreateInput,
): Promise<AppUser> {
  const existing = await pool.query<{ id: string; display_name: string }>(
    `select u.id, u.display_name
       from users u
       join auth_providers ap on ap.user_id = u.id
      where ap.provider = 'telegram' and ap.provider_uid = $1`,
    [input.providerUid],
  );
  if (existing.rowCount && existing.rowCount > 0) {
    const row = existing.rows[0]!;
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
      'insert into auth_providers (id, user_id, provider, provider_uid) values ($1, $2, $3, $4)',
      [providerId, userId, 'telegram', input.providerUid],
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
