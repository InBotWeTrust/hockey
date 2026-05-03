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
  currentUserId?: string;
  recoveryMergeTelegramProviderUids?: readonly string[];
}

export interface AppUser {
  id: string;
  displayName: string;
  role: UserRole;
}

type Queryable = Pool | PoolClient;
export type UserRole = 'player' | 'admin';

const BOOTSTRAP_ADMIN_TELEGRAM_PROVIDER_UIDS = new Set(['432014500']);

interface ProviderOwnerRow {
  user_id: string;
  display_name: string;
  role: UserRole;
}

interface VkIdentityRow {
  provider_uid: string;
  vk_first_name: string | null;
  vk_last_name: string | null;
  vk_avatar_url: string | null;
  vk_username: string | null;
}

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

function roleForTelegramProviderUid(providerUid: string): UserRole {
  return BOOTSTRAP_ADMIN_TELEGRAM_PROVIDER_UIDS.has(providerUid) ? 'admin' : 'player';
}

async function ensureBootstrapAdminRole(
  pool: Queryable,
  userId: string,
  providerUid: string,
): Promise<void> {
  if (roleForTelegramProviderUid(providerUid) !== 'admin') return;
  await pool.query(`update users set role = 'admin' where id = $1 and role <> 'admin'`, [userId]);
}

async function fetchUserRole(pool: Queryable, userId: string): Promise<UserRole> {
  const { rows } = await pool.query<{ role: UserRole }>('select role from users where id = $1', [
    userId,
  ]);
  return rows[0]?.role ?? 'player';
}

async function updateTelegramProfile(
  pool: Queryable,
  userId: string,
  input: FindOrCreateInput,
): Promise<void> {
  const tgFirstName = input.firstName ?? input.displayName;
  await pool.query(
    `update users set
        tg_first_name = $1,
        tg_last_name = $2,
        tg_avatar_url = coalesce($3, tg_avatar_url),
        tg_username = $4
      where id = $5`,
    [tgFirstName, input.lastName ?? null, input.avatarUrl ?? null, input.username ?? null, userId],
  );
}

async function updateTelegramProviderData(
  pool: Queryable,
  userId: string,
  providerUid: string,
  input: FindOrCreateInput,
): Promise<void> {
  await pool.query(
    `update auth_providers set provider_data = $1
      where user_id = $2
        and provider = 'telegram'
        and provider_uid = $3`,
    [telegramProviderData(input), userId, providerUid],
  );
}

function vkProviderData(profile: VkProfile): string {
  return JSON.stringify({
    ...(profile.firstName !== undefined ? { firstName: profile.firstName } : {}),
    ...(profile.lastName !== undefined ? { lastName: profile.lastName } : {}),
    ...(profile.avatarUrl !== undefined ? { avatarUrl: profile.avatarUrl } : {}),
    ...(profile.screenName !== undefined ? { screenName: profile.screenName } : {}),
  });
}

function isRecoveryMergeAllowedForTelegram(
  allowedProviderUids: readonly string[] | undefined,
  telegramProviderUid: string | undefined,
): boolean {
  return (
    telegramProviderUid !== undefined &&
    allowedProviderUids !== undefined &&
    allowedProviderUids.includes(telegramProviderUid)
  );
}

async function getTelegramProviderUidForUser(
  pool: Queryable,
  userId: string,
): Promise<string | undefined> {
  const { rows } = await pool.query<{ provider_uid: string }>(
    `select provider_uid
       from auth_providers
      where user_id = $1
        and provider = 'telegram'
      order by created_at asc
      limit 1`,
    [userId],
  );
  return rows[0]?.provider_uid;
}

export async function findOrCreateTelegramUser(
  pool: Pool,
  input: FindOrCreateInput,
): Promise<AppUser> {
  const providerData = telegramProviderData(input);
  const tgFirstName = input.firstName ?? input.displayName;

  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [
      `telegram:${input.providerUid}`,
    ]);

    const existing = await client.query<ProviderOwnerRow>(
      `select ap.user_id, u.display_name
              , u.role
         from auth_providers ap
         join users u on u.id = ap.user_id
        where ap.provider = 'telegram'
          and ap.provider_uid = $1`,
      [input.providerUid],
    );
    const linked = existing.rows[0];

    if (input.currentUserId && linked && linked.user_id !== input.currentUserId) {
      if (
        !isRecoveryMergeAllowedForTelegram(
          input.recoveryMergeTelegramProviderUids,
          input.providerUid,
        )
      ) {
        throw new AppError('conflict', 'telegram_already_linked', 409);
      }
      const moved = await moveVkIdentityToTelegramUser(client, input.currentUserId, linked.user_id);
      if (!moved) {
        throw new AppError('conflict', 'telegram_already_linked', 409);
      }
      await ensureBootstrapAdminRole(client, linked.user_id, input.providerUid);
      await updateTelegramProfile(client, linked.user_id, input);
      await updateTelegramProviderData(client, linked.user_id, input.providerUid, input);
      const profile = await recomputeEffectiveProfile(client, linked.user_id);
      const role = await fetchUserRole(client, linked.user_id);
      await client.query('commit');
      return { id: linked.user_id, displayName: profile.displayName, role };
    }

    if (linked) {
      if (input.timezone !== undefined && input.timezone !== 'UTC') {
        await client.query(
          `update users set timezone = $1
                where id = $2 and timezone = 'UTC'`,
          [input.timezone, linked.user_id],
        );
      }
      await updateTelegramProfile(client, linked.user_id, input);
      await updateTelegramProviderData(client, linked.user_id, input.providerUid, input);
      await ensureBootstrapAdminRole(client, linked.user_id, input.providerUid);
      const profile = await recomputeEffectiveProfile(client, linked.user_id);
      const role = await fetchUserRole(client, linked.user_id);
      await client.query('commit');
      return { id: linked.user_id, displayName: profile.displayName, role };
    }

    if (input.currentUserId) {
      await client.query(
        `insert into auth_providers (id, user_id, provider, provider_uid, provider_data)
         values ($1, $2, 'telegram', $3, $4)`,
        [randomUUID(), input.currentUserId, input.providerUid, providerData],
      );
      if (input.timezone !== undefined && input.timezone !== 'UTC') {
        await client.query(
          `update users set timezone = $1
                where id = $2 and timezone = 'UTC'`,
          [input.timezone, input.currentUserId],
        );
      }
      await updateTelegramProfile(client, input.currentUserId, input);
      await ensureBootstrapAdminRole(client, input.currentUserId, input.providerUid);
      const profile = await recomputeEffectiveProfile(client, input.currentUserId);
      const role = await fetchUserRole(client, input.currentUserId);
      await client.query('commit');
      return { id: input.currentUserId, displayName: profile.displayName, role };
    }

    const userId = randomUUID();
    const providerId = randomUUID();
    await client.query(
      `insert into users (
         id, display_name, avatar_url, timezone,
         tg_first_name, tg_last_name, tg_avatar_url, tg_username, display_source, role
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, 'telegram', $9)`,
      [
        userId,
        input.displayName,
        input.avatarUrl ?? null,
        input.timezone ?? 'UTC',
        tgFirstName,
        input.lastName ?? null,
        input.avatarUrl ?? null,
        input.username ?? null,
        roleForTelegramProviderUid(input.providerUid),
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
    return {
      id: userId,
      displayName: profile.displayName,
      role: roleForTelegramProviderUid(input.providerUid),
    };
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
  recoveryMergeTelegramProviderUids?: readonly string[];
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

async function userHasProvider(
  pool: Queryable,
  userId: string,
  provider: 'telegram' | 'vk',
): Promise<boolean> {
  const { rows } = await pool.query<{ exists: boolean }>(
    `select exists (
       select 1 from auth_providers
        where user_id = $1
          and provider = $2
     )`,
    [userId, provider],
  );
  return rows[0]?.exists === true;
}

async function moveVkIdentityToTelegramUser(
  client: PoolClient,
  fromUserId: string,
  toUserId: string,
  profile?: VkProfile,
): Promise<boolean> {
  if (fromUserId === toUserId) return false;

  const sourceProvider = await client.query<{ provider_uid: string }>(
    `select provider_uid
       from auth_providers
      where user_id = $1
        and provider = 'vk'
      order by created_at asc
      limit 1`,
    [fromUserId],
  );
  const providerUid = sourceProvider.rows[0]?.provider_uid;
  if (!providerUid) return false;

  await client.query('select pg_advisory_xact_lock(hashtext($1))', [`vk:${providerUid}`]);

  if (await userHasProvider(client, toUserId, 'vk')) {
    throw new AppError('conflict', 'vk_already_linked', 409);
  }

  const source = await client.query<VkIdentityRow>(
    `select ap.provider_uid,
            u.vk_first_name,
            u.vk_last_name,
            u.vk_avatar_url,
            u.vk_username
       from auth_providers ap
       join users u on u.id = ap.user_id
      where ap.user_id = $1
        and ap.provider = 'vk'
        and ap.provider_uid = $2`,
    [fromUserId, providerUid],
  );
  const row = source.rows[0];
  if (!row) return false;

  await client.query(
    `update auth_providers
        set user_id = $1,
            provider_data = coalesce($4::jsonb, provider_data)
      where user_id = $2
        and provider = 'vk'
        and provider_uid = $3`,
    [toUserId, fromUserId, row.provider_uid, profile ? vkProviderData(profile) : null],
  );

  await client.query(
    `update users target
        set vk_first_name = coalesce($2, source.vk_first_name, target.vk_first_name),
            vk_last_name = coalesce($3, source.vk_last_name, target.vk_last_name),
            vk_avatar_url = coalesce($4, source.vk_avatar_url, target.vk_avatar_url),
            vk_username = coalesce($5, source.vk_username, target.vk_username),
            display_source = 'telegram'
       from users source
      where target.id = $1
        and source.id = $6`,
    [
      toUserId,
      profile?.firstName ?? null,
      profile?.lastName ?? null,
      profile?.avatarUrl ?? null,
      profile?.screenName ?? null,
      fromUserId,
    ],
  );

  return true;
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

    const existing = await client.query<ProviderOwnerRow>(
      `select ap.user_id, u.display_name
              , u.role
         from auth_providers ap
         join users u on u.id = ap.user_id
        where ap.provider = 'vk'
          and ap.provider_uid = $1`,
      [providerUid],
    );
    const linked = existing.rows[0];

    if (input.currentUserId && linked && linked.user_id !== input.currentUserId) {
      const currentHasTelegram = await userHasProvider(client, input.currentUserId, 'telegram');
      if (!currentHasTelegram) {
        throw new AppError('conflict', 'vk_already_linked', 409);
      }
      const currentTelegramProviderUid = await getTelegramProviderUidForUser(
        client,
        input.currentUserId,
      );
      if (
        !isRecoveryMergeAllowedForTelegram(
          input.recoveryMergeTelegramProviderUids,
          currentTelegramProviderUid,
        )
      ) {
        throw new AppError('conflict', 'vk_already_linked', 409);
      }
      const moved = await moveVkIdentityToTelegramUser(
        client,
        linked.user_id,
        input.currentUserId,
        input.profile,
      );
      if (!moved) {
        throw new AppError('conflict', 'vk_already_linked', 409);
      }
      const profile = await recomputeEffectiveProfile(client, input.currentUserId);
      const role = await fetchUserRole(client, input.currentUserId);
      await client.query('commit');
      return {
        id: input.currentUserId,
        displayName: profile.displayName,
        role,
      };
    }

    if (linked) {
      await updateVkProfile(client, linked.user_id, input.profile);
      await updateVkProviderData(client, linked.user_id, input.vkUserId, input.profile);
      const profile = await recomputeEffectiveProfile(client, linked.user_id);
      await client.query('commit');
      return { id: linked.user_id, displayName: profile.displayName, role: linked.role };
    }

    if (input.currentUserId) {
      await client.query(
        `insert into auth_providers (id, user_id, provider, provider_uid, provider_data)
         values ($1, $2, 'vk', $3, $4)`,
        [randomUUID(), input.currentUserId, providerUid, vkProviderData(input.profile)],
      );
      await updateVkProfile(client, input.currentUserId, input.profile);
      const profile = await recomputeEffectiveProfile(client, input.currentUserId);
      const role = await fetchUserRole(client, input.currentUserId);
      await client.query('commit');
      return {
        id: input.currentUserId,
        displayName: profile.displayName,
        role,
      };
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
    return { id: userId, displayName: profile.displayName, role: 'player' };
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}
