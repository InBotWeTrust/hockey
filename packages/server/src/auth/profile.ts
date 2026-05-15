import type { Pool, PoolClient } from 'pg';
import { AppError } from '../plugins/errors.js';

type Queryable = Pool | PoolClient;

export type DisplaySource = 'telegram' | 'vk' | 'custom';

export interface EffectiveProfile {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  displaySource: DisplaySource;
}

interface UserProfileRow {
  id: string;
  display_name: string;
  avatar_url: string | null;
  display_source: DisplaySource;
  custom_display_name: string | null;
  custom_first_name: string | null;
  custom_last_name: string | null;
  custom_avatar_url: string | null;
  tg_first_name: string | null;
  tg_last_name: string | null;
  tg_username: string | null;
  tg_avatar_url: string | null;
  vk_first_name: string | null;
  vk_last_name: string | null;
  vk_username: string | null;
  vk_avatar_url: string | null;
}

function buildDisplayName(
  firstName: string | null,
  lastName: string | null,
  username: string | null,
): string {
  return [firstName, lastName].filter(Boolean).join(' ') || username || 'Player';
}

export async function recomputeEffectiveProfile(
  pool: Queryable,
  userId: string,
): Promise<EffectiveProfile> {
  const { rows } = await pool.query<UserProfileRow>(
    `select id, display_name, avatar_url, display_source,
            custom_display_name, custom_first_name, custom_last_name, custom_avatar_url,
            tg_first_name, tg_last_name, tg_username, tg_avatar_url,
            vk_first_name, vk_last_name, vk_username, vk_avatar_url
       from users
      where id = $1`,
    [userId],
  );
  const row = rows[0];
  if (!row) {
    throw new AppError('not_found', 'user not found', 404);
  }

  const displayName =
    row.display_source === 'custom'
      ? (row.custom_display_name ??
        buildDisplayName(row.custom_first_name, row.custom_last_name, null))
      : row.display_source === 'vk'
      ? buildDisplayName(row.vk_first_name, row.vk_last_name, row.vk_username)
      : buildDisplayName(row.tg_first_name, row.tg_last_name, row.tg_username);
  const avatarUrl =
    row.display_source === 'custom'
      ? (row.custom_avatar_url ?? row.avatar_url)
      : row.display_source === 'vk'
        ? row.vk_avatar_url
        : row.tg_avatar_url;

  await pool.query('update users set display_name = $1, avatar_url = $2 where id = $3', [
    displayName,
    avatarUrl,
    userId,
  ]);

  return {
    id: row.id,
    displayName,
    avatarUrl,
    displaySource: row.display_source,
  };
}
