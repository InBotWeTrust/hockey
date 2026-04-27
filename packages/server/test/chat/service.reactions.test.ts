import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { Pool } from 'pg';
import { hasIntegrationEnv, createTestPool, resetDatabase } from '../helpers/testDb.js';
import { applyMigrations } from '../../src/db/migrations.js';
import {
  addReaction,
  removeReaction,
  getMessageOr404,
} from '../../src/chat/service.js';
import { MessageNotFoundError } from '../../src/chat/errors.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

describe.skipIf(!hasIntegrationEnv)('chat reactions service', () => {
  let pool: Pool;
  let userA: string;
  let userB: string;
  let chatId: string;
  let messageId: string;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);
    const insU = `insert into users (id, display_name, timezone) values (gen_random_uuid(), $1, 'UTC') returning id`;
    userA = (await pool.query(insU, ['Alice'])).rows[0].id;
    userB = (await pool.query(insU, ['Bob'])).rows[0].id;
    const c = await pool.query(
      `insert into chats (type, created_by) values ('direct', $1) returning id`,
      [userA],
    );
    chatId = c.rows[0].id;
  });

  beforeEach(async () => {
    await pool.query(`delete from message_reactions`);
    await pool.query(`delete from messages`);
    const m = await pool.query(
      `insert into messages (chat_id, sender_id, content) values ($1, $2, 'hi') returning id`,
      [chatId, userA],
    );
    messageId = m.rows[0].id;
  });

  afterAll(async () => {
    await pool.end();
  });

  it('addReaction first-add: returns {added, removed:null}', async () => {
    const r = await addReaction(pool, messageId, userA, '🔥');
    expect(r).toEqual({ added: '🔥', removed: null });
    const rows = await pool.query<{ emoji: string }>(
      `select emoji from message_reactions where message_id = $1 and user_id = $2`,
      [messageId, userA],
    );
    expect(rows.rows.map((x) => x.emoji)).toEqual(['🔥']);
  });

  it('addReaction switch: deletes prev, inserts new, returns both', async () => {
    await addReaction(pool, messageId, userA, '❤️');
    const r = await addReaction(pool, messageId, userA, '🔥');
    expect(r).toEqual({ added: '🔥', removed: '❤️' });
    const rows = await pool.query<{ emoji: string }>(
      `select emoji from message_reactions where message_id = $1 and user_id = $2`,
      [messageId, userA],
    );
    expect(rows.rows.map((x) => x.emoji)).toEqual(['🔥']);
  });

  it('addReaction idempotent re-add: same emoji again is no-op, returns {added:null, removed:null}', async () => {
    await addReaction(pool, messageId, userA, '🔥');
    const r = await addReaction(pool, messageId, userA, '🔥');
    expect(r).toEqual({ added: null, removed: null });
    const rows = await pool.query<{ cnt: string }>(
      `select count(*)::bigint as cnt from message_reactions where message_id = $1 and user_id = $2`,
      [messageId, userA],
    );
    expect(Number(rows.rows[0]!.cnt)).toBe(1);
  });

  it('addReaction by a different user does not touch the first user', async () => {
    await addReaction(pool, messageId, userA, '🔥');
    const r = await addReaction(pool, messageId, userB, '🔥');
    expect(r).toEqual({ added: '🔥', removed: null });
    const rows = await pool.query<{ user_id: string; emoji: string }>(
      `select user_id, emoji from message_reactions where message_id = $1 order by user_id`,
      [messageId],
    );
    expect(rows.rowCount).toBe(2);
  });

  it('removeReaction happy: returns {removed:true} and deletes the row', async () => {
    await addReaction(pool, messageId, userA, '🔥');
    const r = await removeReaction(pool, messageId, userA, '🔥');
    expect(r).toEqual({ removed: true });
    const rows = await pool.query(
      `select 1 from message_reactions where message_id = $1 and user_id = $2`,
      [messageId, userA],
    );
    expect(rows.rowCount).toBe(0);
  });

  it('removeReaction no-op when nothing to remove: returns {removed:false}', async () => {
    const r = await removeReaction(pool, messageId, userA, '🔥');
    expect(r).toEqual({ removed: false });
  });

  it('removeReaction with a different emoji than what is set is a no-op', async () => {
    await addReaction(pool, messageId, userA, '🔥');
    const r = await removeReaction(pool, messageId, userA, '❤️');
    expect(r).toEqual({ removed: false });
    const rows = await pool.query<{ emoji: string }>(
      `select emoji from message_reactions where message_id = $1 and user_id = $2`,
      [messageId, userA],
    );
    expect(rows.rows.map((x) => x.emoji)).toEqual(['🔥']);
  });

  it('getMessageOr404 returns the message row when present', async () => {
    const m = await getMessageOr404(pool, messageId);
    expect(m.id).toBe(messageId);
    expect(m.chat_id).toBe(chatId);
  });

  it('getMessageOr404 throws MessageNotFoundError when missing', async () => {
    await expect(
      getMessageOr404(pool, '00000000-0000-0000-0000-000000000000'),
    ).rejects.toBeInstanceOf(MessageNotFoundError);
  });

  it('getMessageOr404 treats soft-deleted messages as missing (404)', async () => {
    await pool.query(
      `update messages set is_deleted = true, content = '' where id = $1`,
      [messageId],
    );
    await expect(getMessageOr404(pool, messageId)).rejects.toBeInstanceOf(
      MessageNotFoundError,
    );
  });
});
