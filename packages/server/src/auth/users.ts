import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { VkProfile } from './vk.js';
import { recomputeEffectiveProfile } from './profile.js';
import { AppError } from '../plugins/errors.js';

export interface FindOrCreateInput {
  providerUid: string;
  displayName: string;
  avatarUrl?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  timezone?: string;
}

export interface AppUser {
  id: string;
  displayName: string;
}

type Queryable = Pool | PoolClient;

function displayNameFromProfile(input: {
  firstName: string | undefined;
  lastName: string | undefined;
  username: string | undefined;
  fallback?: string;
}): string {
  return (
    [input.firstName, input.lastName].filter(Boolean).join(' ') ||
    input.username ||
    input.fallback ||
    'Player'
  );
}

function telegramProviderData(input: FindOrCreateInput): string {
  return JSON.stringify({
    ...(input.username !== undefined ? { username: input.username } : {}),
    ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
    ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
  });
}

function vkProviderData(profile: VkProfile): string {
  return JSON.stringify({
    ...(profile.firstName !== undefined ? { firstName: profile.firstName } : {}),
    ...(profile.lastName !== undefined ? { lastName: profile.lastName } : {}),
    ...(profile.avatarUrl !== undefined ? { avatarUrl: profile.avatarUrl } : {}),
    ...(profile.screenName !== undefined ? { screenName: profile.screenName } : {}),
  });
}

export async function findOrCreateTelegramUser(
  pool: Pool,
  input: FindOrCreateInput,
): Promise<AppUser> {
  const providerData = telegramProviderData(input);
  const tgFirstName = input.firstName ?? input.displayName;

  const existing = await pool.query<{ id: string; display_name: string; timezone: string }>(
    `select u.id, u.display_name, u.timezone
       from users u
       join auth_providers ap on ap.user_id = u.id
      where ap.provider = 'telegram' and ap.provider_uid = $1`,
    [input.providerUid],
  );

  if (existing.rowCount && existing.rowCount > 0) {
    const row = existing.rows[0]!;
    // Backfill timezone for legacy users created before migration 003 (which
    // assigned 'UTC' as the default). Only overwrite the migration default —
    // never a user-chosen value.
    const shouldBackfillTz =
      row.timezone === 'UTC' && input.timezone !== undefined && input.timezone !== 'UTC';
    await Promise.all([
      input.avatarUrl !== undefined
        ? pool.query('update users set avatar_url = $1 where id = $2', [input.avatarUrl, row.id])
        : Promise.resolve(),
      shouldBackfillTz
        ? pool.query(
            `update users set timezone = $1
              where id = $2 and timezone = 'UTC'`,
            [input.timezone, row.id],
          )
        : Promise.resolve(),
      pool.query(
        `update users set
            tg_first_name = $1,
            tg_last_name = $2,
            tg_avatar_url = coalesce($3, tg_avatar_url),
            tg_username = $4
          where id = $5`,
        [
          tgFirstName,
          input.lastName ?? null,
          input.avatarUrl ?? null,
          input.username ?? null,
          row.id,
        ],
      ),
      pool.query(
        `update auth_providers set provider_data = $1
          where user_id = $2 and provider = 'telegram'`,
        [providerData, row.id],
      ),
    ]);
    const profile = await recomputeEffectiveProfile(pool, row.id);
    return { id: row.id, displayName: profile.displayName };
  }

  const client = await pool.connect();
  try {
    await client.query('begin');
    const userId = randomUUID();
    const providerId = randomUUID();
    await client.query(
      `insert into users (
         id, display_name, avatar_url, timezone,
         tg_first_name, tg_last_name, tg_avatar_url, tg_username, display_source
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, 'telegram')`,
      [
        userId,
        input.displayName,
        input.avatarUrl ?? null,
        input.timezone ?? 'UTC',
        tgFirstName,
        input.lastName ?? null,
        input.avatarUrl ?? null,
        input.username ?? null,
      ],
    );
    await client.query(
      `insert into auth_providers (id, user_id, provider, provider_uid, provider_data)
       values ($1, $2, $3, $4, $5)`,
      [providerId, userId, 'telegram', input.providerUid, providerData],
    );
    await client.query('insert into user_wallet (user_id) values ($1)', [userId]);
    await client.query('insert into user_equipment (user_id) values ($1)', [userId]);
    await client.query("insert into user_sticks (user_id, stick_id) values ($1, 'training')", [
      userId,
    ]);
    const profile = await recomputeEffectiveProfile(client, userId);
    await client.query('commit');
    return { id: userId, displayName: profile.displayName };
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}

export interface FindOrLinkVkInput {
  vkUserId: number;
  profile: VkProfile;
  currentUserId?: string;
  timezone?: string;
}

async function updateVkProfile(pool: Queryable, userId: string, profile: VkProfile): Promise<void> {
  await pool.query(
    `update users set
        vk_first_name = coalesce($1, vk_first_name),
        vk_last_name = coalesce($2, vk_last_name),
        vk_avatar_url = coalesce($3, vk_avatar_url),
        vk_username = coalesce($4, vk_username)
      where id = $5`,
    [
      profile.firstName ?? null,
      profile.lastName ?? null,
      profile.avatarUrl ?? null,
      profile.screenName ?? null,
      userId,
    ],
  );
}

async function updateVkProviderData(
  pool: Queryable,
  userId: string,
  vkUserId: number,
  profile: VkProfile,
): Promise<void> {
  await pool.query(
    `update auth_providers
        set provider_data = $1
      where user_id = $2
        and provider = 'vk'
        and provider_uid = $3`,
    [vkProviderData(profile), userId, String(vkUserId)],
  );
}

export async function findOrLinkOrCreateVkUser(
  pool: Pool,
  input: FindOrLinkVkInput,
): Promise<AppUser> {
  const providerUid = String(input.vkUserId);
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [`vk:${providerUid}`]);

    const existing = await client.query<{ user_id: string; display_name: string }>(
      `select ap.user_id, u.display_name
         from auth_providers ap
         join users u on u.id = ap.user_id
        where ap.provider = 'vk'
          and ap.provider_uid = $1`,
      [providerUid],
    );
    const linked = existing.rows[0];

    if (input.currentUserId && linked && linked.user_id !== input.currentUserId) {
      throw new AppError('conflict', 'vk_already_linked', 409);
    }

    if (linked) {
      await updateVkProfile(client, linked.user_id, input.profile);
      await updateVkProviderData(client, linked.user_id, input.vkUserId, input.profile);
      const profile = await recomputeEffectiveProfile(client, linked.user_id);
      await client.query('commit');
      return { id: linked.user_id, displayName: profile.displayName };
    }

    if (input.currentUserId) {
      await client.query(
        `insert into auth_providers (id, user_id, provider, provider_uid, provider_data)
         values ($1, $2, 'vk', $3, $4)`,
        [randomUUID(), input.currentUserId, providerUid, vkProviderData(input.profile)],
      );
      await updateVkProfile(client, input.currentUserId, input.profile);
      const profile = await recomputeEffectiveProfile(client, input.currentUserId);
      await client.query('commit');
      return { id: input.currentUserId, displayName: profile.displayName };
    }

    const userId = randomUUID();
    const displayName = displayNameFromProfile({
      firstName: input.profile.firstName,
      lastName: input.profile.lastName,
      username: input.profile.screenName,
    });
    await client.query(
      `insert into users (
         id, display_name, avatar_url, timezone, display_source,
         vk_first_name, vk_last_name, vk_avatar_url, vk_username
       ) values ($1, $2, $3, $4, 'vk', $5, $6, $7, $8)`,
      [
        userId,
        displayName,
        input.profile.avatarUrl ?? null,
        input.timezone ?? 'UTC',
        input.profile.firstName ?? null,
        input.profile.lastName ?? null,
        input.profile.avatarUrl ?? null,
        input.profile.screenName ?? null,
      ],
    );
    await client.query(
      `insert into auth_providers (id, user_id, provider, provider_uid, provider_data)
       values ($1, $2, 'vk', $3, $4)`,
      [randomUUID(), userId, providerUid, vkProviderData(input.profile)],
    );
    await client.query('insert into user_wallet (user_id) values ($1)', [userId]);
    await client.query('insert into user_equipment (user_id) values ($1)', [userId]);
    await client.query("insert into user_sticks (user_id, stick_id) values ($1, 'training')", [
      userId,
    ]);
    const profile = await recomputeEffectiveProfile(client, userId);
    await client.query('commit');
    return { id: userId, displayName: profile.displayName };
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}
