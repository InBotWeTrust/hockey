import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { hasIntegrationEnv, createTestPool, resetDatabase } from '../helpers/testDb.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { getMyChats } from '../../src/chat/service.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

describe.skipIf(!hasIntegrationEnv)('chat service', () => {
  let pool: Pool;
  let userA: string;
  let userB: string;
  let userC: string;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);

    const ins = `insert into users (id, display_name, timezone) values (gen_random_uuid(), $1, 'UTC') returning id`;
    userA = (await pool.query(ins, ['Alice'])).rows[0].id;
    userB = (await pool.query(ins, ['Bob'])).rows[0].id;
    userC = (await pool.query(ins, ['Charlie'])).rows[0].id;
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query(`delete from chat_members`);
    await pool.query(`delete from messages`);
    await pool.query(`delete from chats`);
  });

  describe('getMyChats', () => {
    it('returns empty when user has no chats and no system channels', async () => {
      const list = await getMyChats(pool, userA);
      expect(list).toEqual([]);
    });

    it('returns DM with counterpart info', async () => {
      const dm = await pool.query(
        `insert into chats (type, created_by) values ('direct', $1) returning id`,
        [userA],
      );
      const dmId = dm.rows[0].id;
      await pool.query(
        `insert into chat_members (chat_id, user_id) values ($1, $2), ($1, $3)`,
        [dmId, userA, userB],
      );

      const list = await getMyChats(pool, userA);
      expect(list).toHaveLength(1);
      expect(list[0]!.id).toBe(dmId);
      expect(list[0]!.type).toBe('direct');
      expect(list[0]!.dmCounterpart?.userId).toBe(userB);
      expect(list[0]!.dmCounterpart?.displayName).toBe('Bob');
      expect(list[0]!.unreadCount).toBe(0);
      expect(list[0]!.lastMessage).toBeNull();
    });

    it('counts unread messages from others past last_read_at', async () => {
      const dm = await pool.query(
        `insert into chats (type, created_by) values ('direct', $1) returning id`,
        [userA],
      );
      const dmId = dm.rows[0].id;
      await pool.query(
        `insert into chat_members (chat_id, user_id, last_read_at) values
         ($1, $2, now() - interval '1 hour'),
         ($1, $3, now() - interval '1 hour')`,
        [dmId, userA, userB],
      );
      // Insert messages with explicit increasing timestamps so 'mine' is newest.
      // A single VALUES clause shares one now() — ordering would be ambiguous.
      const baseTs = new Date(Date.now() - 60_000);
      for (const [idx, [sender, content]] of [
        [userB, 'hi 1'],
        [userB, 'hi 2'],
        [userB, 'hi 3'],
        [userA, 'mine'],
      ].entries()) {
        await pool.query(
          `insert into messages (chat_id, sender_id, content, created_at) values ($1, $2, $3, $4)`,
          [dmId, sender, content, new Date(baseTs.getTime() + idx * 1000)],
        );
      }

      const list = await getMyChats(pool, userA);
      expect(list).toHaveLength(1);
      expect(list[0]!.unreadCount).toBe(3);
      expect(list[0]!.lastMessage?.content).toBe('mine');
    });

    it('skips soft-deleted messages from last_message and unread count', async () => {
      const dm = await pool.query(
        `insert into chats (type, created_by) values ('direct', $1) returning id`,
        [userA],
      );
      const dmId = dm.rows[0].id;
      await pool.query(
        `insert into chat_members (chat_id, user_id, last_read_at) values
         ($1, $2, now() - interval '1 hour'),
         ($1, $3, now() - interval '1 hour')`,
        [dmId, userA, userB],
      );
      await pool.query(
        `insert into messages (chat_id, sender_id, content, is_deleted) values
         ($1, $2, 'visible', false), ($1, $2, 'gone', true)`,
        [dmId, userB],
      );

      const list = await getMyChats(pool, userA);
      expect(list[0]!.unreadCount).toBe(1);
      expect(list[0]!.lastMessage?.content).toBe('visible');
    });

    it('includes system channels even without chat_members row', async () => {
      await pool.query(
        `insert into chats (type, name, created_by) values ('system', 'Общий', $1)`,
        [userA],
      );

      const list = await getMyChats(pool, userA);
      expect(list).toHaveLength(1);
      expect(list[0]!.type).toBe('system');
      expect(list[0]!.name).toBe('Общий');
      expect(list[0]!.dmCounterpart).toBeNull();
    });

    it('orders by last_message_at desc, NULLS last', async () => {
      const old = await pool.query(
        `insert into chats (type, created_by) values ('direct', $1) returning id`,
        [userA],
      );
      const oldId = old.rows[0].id;
      await pool.query(
        `insert into chat_members (chat_id, user_id) values ($1, $2), ($1, $3)`,
        [oldId, userA, userB],
      );
      await pool.query(
        `insert into messages (chat_id, sender_id, content) values ($1, $2, 'old')`,
        [oldId, userB],
      );

      const empty = await pool.query(
        `insert into chats (type, created_by) values ('direct', $1) returning id`,
        [userA],
      );
      await pool.query(
        `insert into chat_members (chat_id, user_id) values ($1, $2), ($1, $3)`,
        [empty.rows[0].id, userA, userC],
      );

      const list = await getMyChats(pool, userA);
      expect(list).toHaveLength(2);
      expect(list[0]!.id).toBe(oldId);
      expect(list[1]!.id).toBe(empty.rows[0].id);
    });

    it('does not return inactive chats', async () => {
      const c = await pool.query(
        `insert into chats (type, created_by, is_active) values ('direct', $1, false) returning id`,
        [userA],
      );
      await pool.query(
        `insert into chat_members (chat_id, user_id) values ($1, $2)`,
        [c.rows[0].id, userA],
      );
      const list = await getMyChats(pool, userA);
      expect(list).toHaveLength(0);
    });
  });
});
