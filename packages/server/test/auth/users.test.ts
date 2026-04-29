import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { Pool } from 'pg';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findOrCreateTelegramUser, findOrLinkOrCreateVkUser } from '../../src/auth/users.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

describe.skipIf(!hasIntegrationEnv)('findOrCreateTelegramUser', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query(
      'truncate users, auth_providers, user_wallet, user_equipment, user_sticks restart identity cascade',
    );
  });

  it('creates user + wallet + equipment + starter stick + auth_providers row', async () => {
    const user = await findOrCreateTelegramUser(pool, {
      providerUid: '100500',
      displayName: 'Egor',
      firstName: 'Egor',
      username: 'egor',
    });
    expect(user.id).toMatch(/^[0-9a-f-]{36}$/i);
    const wallet = await pool.query('select * from user_wallet where user_id=$1', [user.id]);
    expect(wallet.rowCount).toBe(1);
    expect(wallet.rows[0].shots_current).toBe(25);
    expect(wallet.rows[0].shots_max).toBe(25);
    const eq = await pool.query('select * from user_equipment where user_id=$1', [user.id]);
    expect(eq.rows[0].equipped_stick).toBe('training');
    const sticks = await pool.query('select stick_id from user_sticks where user_id=$1', [user.id]);
    expect(sticks.rows.map((r) => r.stick_id)).toEqual(['training']);
    const prov = await pool.query(
      'select provider, provider_uid from auth_providers where user_id=$1',
      [user.id],
    );
    expect(prov.rows[0]).toEqual({ provider: 'telegram', provider_uid: '100500' });
    const profile = await pool.query(
      'select display_source, tg_first_name, tg_username from users where id=$1',
      [user.id],
    );
    expect(profile.rows[0]).toMatchObject({
      display_source: 'telegram',
      tg_first_name: 'Egor',
      tg_username: 'egor',
    });
  });

  it('is idempotent: second call with same provider_uid returns existing user', async () => {
    const first = await findOrCreateTelegramUser(pool, {
      providerUid: '100500',
      displayName: 'Egor',
    });
    const second = await findOrCreateTelegramUser(pool, {
      providerUid: '100500',
      displayName: 'Egor (renamed)',
    });
    expect(second.id).toBe(first.id);
    const count = await pool.query('select count(*)::int as n from users');
    expect(count.rows[0].n).toBe(1);
  });

  it('optional avatarUrl persists on users row', async () => {
    const user = await findOrCreateTelegramUser(pool, {
      providerUid: '200',
      displayName: 'Test',
      avatarUrl: 'https://t.me/i/pic.jpg',
    });
    const row = await pool.query('select avatar_url from users where id=$1', [user.id]);
    expect(row.rows[0].avatar_url).toBe('https://t.me/i/pic.jpg');
  });

  it('updates tg_* mirror fields on subsequent login', async () => {
    const first = await findOrCreateTelegramUser(pool, {
      providerUid: '600',
      displayName: 'Old Name',
      firstName: 'Old',
      lastName: 'Name',
      avatarUrl: 'old.png',
      username: 'old',
    });

    const second = await findOrCreateTelegramUser(pool, {
      providerUid: '600',
      displayName: 'New Name',
      firstName: 'New',
      lastName: 'Name',
      avatarUrl: 'new.png',
      username: 'new',
    });

    expect(second.id).toBe(first.id);
    expect(second.displayName).toBe('New Name');
    const row = await pool.query(
      'select display_name, avatar_url, tg_first_name, tg_avatar_url, tg_username from users where id=$1',
      [first.id],
    );
    expect(row.rows[0]).toMatchObject({
      display_name: 'New Name',
      avatar_url: 'new.png',
      tg_first_name: 'New',
      tg_avatar_url: 'new.png',
      tg_username: 'new',
    });
  });

  it('persists timezone on first creation', async () => {
    const user = await findOrCreateTelegramUser(pool, {
      providerUid: '300',
      displayName: 'Tz User',
      timezone: 'Europe/Moscow',
    });
    const row = await pool.query('select timezone from users where id=$1', [user.id]);
    expect(row.rows[0].timezone).toBe('Europe/Moscow');
  });

  it('backfills legacy UTC timezone on subsequent login', async () => {
    // First login: client did not send a timezone (legacy path) — user gets 'UTC'.
    const first = await findOrCreateTelegramUser(pool, {
      providerUid: '400',
      displayName: 'Legacy',
    });
    const before = await pool.query('select timezone from users where id=$1', [first.id]);
    expect(before.rows[0].timezone).toBe('UTC');

    // Second login: client now sends a real IANA tz — backfill should overwrite UTC.
    await findOrCreateTelegramUser(pool, {
      providerUid: '400',
      displayName: 'Legacy',
      timezone: 'Europe/Moscow',
    });
    const after = await pool.query('select timezone from users where id=$1', [first.id]);
    expect(after.rows[0].timezone).toBe('Europe/Moscow');
  });

  it('does NOT overwrite a non-UTC timezone on subsequent login (set-once)', async () => {
    const first = await findOrCreateTelegramUser(pool, {
      providerUid: '500',
      displayName: 'Traveller',
      timezone: 'Europe/Moscow',
    });
    // User flies to Berlin and reopens the app — timezone must NOT change.
    await findOrCreateTelegramUser(pool, {
      providerUid: '500',
      displayName: 'Traveller',
      timezone: 'Europe/Berlin',
    });
    const row = await pool.query('select timezone from users where id=$1', [first.id]);
    expect(row.rows[0].timezone).toBe('Europe/Moscow');
  });

  it('links Telegram to an existing VK-only user when currentUserId is provided', async () => {
    const vk = await findOrLinkOrCreateVkUser(pool, {
      vkUserId: 900,
      profile: { firstName: 'Vera', lastName: 'Volkova', avatarUrl: 'vk.png' },
      timezone: 'Europe/Moscow',
    });

    const linked = await findOrCreateTelegramUser(pool, {
      providerUid: 'tg-linked',
      displayName: 'Telegram Name',
      firstName: 'Telegram',
      lastName: 'Name',
      avatarUrl: 'tg.png',
      currentUserId: vk.id,
    });

    expect(linked.id).toBe(vk.id);
    expect(linked.displayName).toBe('Vera Volkova');
    const providers = await pool.query(
      'select provider from auth_providers where user_id=$1 order by provider',
      [vk.id],
    );
    expect(providers.rows.map((r) => r.provider)).toEqual(['telegram', 'vk']);
    const row = await pool.query(
      'select display_source, tg_first_name, tg_avatar_url from users where id=$1',
      [vk.id],
    );
    expect(row.rows[0]).toMatchObject({
      display_source: 'vk',
      tg_first_name: 'Telegram',
      tg_avatar_url: 'tg.png',
    });
  });

  it('rejects linking Telegram identity already owned by another user', async () => {
    await findOrCreateTelegramUser(pool, {
      providerUid: 'tg-owned',
      displayName: 'Owner',
      firstName: 'Owner',
    });
    const vk = await findOrLinkOrCreateVkUser(pool, {
      vkUserId: 901,
      profile: { firstName: 'Vera' },
    });

    await expect(
      findOrCreateTelegramUser(pool, {
        providerUid: 'tg-owned',
        displayName: 'Owner',
        firstName: 'Owner',
        currentUserId: vk.id,
      }),
    ).rejects.toThrow(/telegram_already_linked/);
  });
});
