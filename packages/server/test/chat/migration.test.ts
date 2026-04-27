import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { hasIntegrationEnv, createTestPool, resetDatabase } from '../helpers/testDb.js';
import { applyMigrations } from '../../src/db/migrations.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

describe.skipIf(!hasIntegrationEnv)('chat migrations 004 + 005', () => {
  let pool: Pool;
  let userA: string;
  let userB: string;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);

    // Seed two users (chat FKs require them).
    // Note: users.id has no default, must pass gen_random_uuid() explicitly.
    // Telegram identity lives in auth_providers (not needed for chat tests).
    const insertUser = `
      insert into users (id, display_name, timezone)
      values (gen_random_uuid(), $1, 'UTC')
      returning id
    `;
    const ra = await pool.query(insertUser, ['Alice']);
    const rb = await pool.query(insertUser, ['Bob']);
    userA = ra.rows[0].id;
    userB = rb.rows[0].id;
  });

  afterAll(async () => {
    await pool.end();
  });

  it('creates a direct chat and roundtrip-reads it', async () => {
    const ins = await pool.query(
      `insert into chats (type, created_by) values ('direct', $1) returning *`,
      [userA],
    );
    expect(ins.rows[0].type).toBe('direct');
    expect(ins.rows[0].is_active).toBe(true);
    expect(ins.rows[0].last_message_at).toBeNull();
    expect(ins.rows[0].id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('inserts members with unique (chat_id, user_id)', async () => {
    const chat = await pool.query(
      `insert into chats (type, created_by) values ('direct', $1) returning id`,
      [userA],
    );
    const chatId = chat.rows[0].id;

    await pool.query(
      `insert into chat_members (chat_id, user_id, role) values ($1, $2, 'admin'), ($1, $3, 'member')`,
      [chatId, userA, userB],
    );

    const dup = pool.query(
      `insert into chat_members (chat_id, user_id) values ($1, $2)`,
      [chatId, userA],
    );
    await expect(dup).rejects.toThrow(/duplicate key/);
  });

  it('inserts a message and trigger updates chats.last_message_at', async () => {
    const chat = await pool.query(
      `insert into chats (type, created_by) values ('direct', $1) returning id`,
      [userA],
    );
    const chatId = chat.rows[0].id;

    const msg = await pool.query(
      `insert into messages (chat_id, sender_id, content) values ($1, $2, 'привет, мир')
       returning id, search_vector::text`,
      [chatId, userA],
    );
    expect(msg.rows[0].search_vector).toContain("'привет'"); // russian dict

    const refreshed = await pool.query(
      `select last_message_at from chats where id = $1`,
      [chatId],
    );
    expect(refreshed.rows[0].last_message_at).toBeInstanceOf(Date);
  });

  it('reactions enforce uniqueness on (message, user) — only one reaction per user per message', async () => {
    const chat = await pool.query(
      `insert into chats (type, created_by) values ('direct', $1) returning id`,
      [userA],
    );
    const msg = await pool.query(
      `insert into messages (chat_id, sender_id, content) values ($1, $2, 'hi') returning id`,
      [chat.rows[0].id, userA],
    );
    const messageId = msg.rows[0].id;

    await pool.query(
      `insert into message_reactions (message_id, user_id, emoji) values ($1, $2, '🔥')`,
      [messageId, userA],
    );

    // Second reaction by SAME user on SAME message — even with a DIFFERENT emoji — must fail.
    const dup = pool.query(
      `insert into message_reactions (message_id, user_id, emoji) values ($1, $2, '👍')`,
      [messageId, userA],
    );
    await expect(dup).rejects.toThrow(/duplicate key/);
  });

  it('a different user can react to the same message', async () => {
    const chat = await pool.query(
      `insert into chats (type, created_by) values ('direct', $1) returning id`,
      [userA],
    );
    const msg = await pool.query(
      `insert into messages (chat_id, sender_id, content) values ($1, $2, 'hi') returning id`,
      [chat.rows[0].id, userA],
    );
    const messageId = msg.rows[0].id;

    await pool.query(
      `insert into message_reactions (message_id, user_id, emoji) values ($1, $2, '🔥')`,
      [messageId, userA],
    );
    const ok = await pool.query(
      `insert into message_reactions (message_id, user_id, emoji) values ($1, $2, '🔥') returning id`,
      [messageId, userB],
    );
    expect(ok.rowCount).toBe(1);
  });

  it('the same user can react to two DIFFERENT messages', async () => {
    const chat = await pool.query(
      `insert into chats (type, created_by) values ('direct', $1) returning id`,
      [userA],
    );
    const m1 = await pool.query(
      `insert into messages (chat_id, sender_id, content) values ($1, $2, 'one') returning id`,
      [chat.rows[0].id, userA],
    );
    const m2 = await pool.query(
      `insert into messages (chat_id, sender_id, content) values ($1, $2, 'two') returning id`,
      [chat.rows[0].id, userA],
    );

    await pool.query(
      `insert into message_reactions (message_id, user_id, emoji) values ($1, $2, '🔥'), ($3, $2, '👍')`,
      [m1.rows[0].id, userA, m2.rows[0].id],
    );
    // Scope by the messages created in this test so prior tests in this
    // describe (which also insert reactions for userA) don't leak in.
    const r = await pool.query<{ cnt: string }>(
      `select count(*)::bigint as cnt from message_reactions
        where user_id = $1 and message_id = any($2::uuid[])`,
      [userA, [m1.rows[0].id, m2.rows[0].id]],
    );
    expect(Number(r.rows[0].cnt)).toBe(2);
  });

  it('rejects invalid chat.type via CHECK', async () => {
    const bad = pool.query(
      `insert into chats (type, created_by) values ('weird', $1)`,
      [userA],
    );
    await expect(bad).rejects.toThrow(/check constraint/);
  });

  it('reply_to_id becomes NULL when parent message is deleted', async () => {
    const chat = await pool.query(
      `insert into chats (type, created_by) values ('direct', $1) returning id`,
      [userA],
    );
    const parent = await pool.query(
      `insert into messages (chat_id, sender_id, content) values ($1, $2, 'parent') returning id`,
      [chat.rows[0].id, userA],
    );
    const reply = await pool.query(
      `insert into messages (chat_id, sender_id, content, reply_to_id) values ($1, $2, 'reply', $3) returning id`,
      [chat.rows[0].id, userA, parent.rows[0].id],
    );

    await pool.query(`delete from messages where id = $1`, [parent.rows[0].id]);

    const r = await pool.query(`select reply_to_id from messages where id = $1`, [reply.rows[0].id]);
    expect(r.rows[0].reply_to_id).toBeNull();
  });
});
