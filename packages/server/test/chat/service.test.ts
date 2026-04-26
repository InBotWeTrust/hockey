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

  describe('getMessages', () => {
    it('returns messages for a chat newest-first, limited to 50', async () => {
      const { getMessages } = await import('../../src/chat/service.js');
      const dm = await pool.query(
        `insert into chats (type, created_by) values ('direct', $1) returning id`,
        [userA],
      );
      const dmId = dm.rows[0].id;
      await pool.query(
        `insert into chat_members (chat_id, user_id) values ($1, $2), ($1, $3)`,
        [dmId, userA, userB],
      );
      // Insert 60 messages with strictly increasing created_at.
      const baseTs = new Date(Date.now() - 60 * 60 * 1000);
      for (let i = 0; i < 60; i++) {
        await pool.query(
          `insert into messages (chat_id, sender_id, content, created_at) values ($1, $2, $3, $4)`,
          [dmId, userA, `msg${i}`, new Date(baseTs.getTime() + i * 60_000)],
        );
      }

      const page1 = await getMessages(pool, dmId, userA, { limit: 50 });
      expect(page1).toHaveLength(50);
      expect(page1[0]!.content).toBe('msg59');
      expect(page1[49]!.content).toBe('msg10');
    });

    it('paginates with before-cursor', async () => {
      const { getMessages } = await import('../../src/chat/service.js');
      const dm = await pool.query(
        `insert into chats (type, created_by) values ('direct', $1) returning id`,
        [userA],
      );
      const dmId = dm.rows[0].id;
      await pool.query(
        `insert into chat_members (chat_id, user_id) values ($1, $2), ($1, $3)`,
        [dmId, userA, userB],
      );
      const baseTs = new Date(Date.now() - 60 * 60 * 1000);
      for (let i = 0; i < 60; i++) {
        await pool.query(
          `insert into messages (chat_id, sender_id, content, created_at) values ($1, $2, $3, $4)`,
          [dmId, userA, `msg${i}`, new Date(baseTs.getTime() + i * 60_000)],
        );
      }

      const page1 = await getMessages(pool, dmId, userA, { limit: 50 });
      const oldestOnPage1 = page1[49]!;
      const page2 = await getMessages(pool, dmId, userA, {
        limit: 50,
        before: oldestOnPage1.createdAt,
      });
      expect(page2).toHaveLength(10);
      expect(page2[0]!.content).toBe('msg9');
    });

    it('soft-deleted messages have content="" and isDeleted=true', async () => {
      const { getMessages } = await import('../../src/chat/service.js');
      const dm = await pool.query(
        `insert into chats (type, created_by) values ('direct', $1) returning id`,
        [userA],
      );
      const dmId = dm.rows[0].id;
      await pool.query(
        `insert into chat_members (chat_id, user_id) values ($1, $2)`,
        [dmId, userA],
      );
      await pool.query(
        `insert into messages (chat_id, sender_id, content, is_deleted) values ($1, $2, 'gone', true)`,
        [dmId, userA],
      );
      const list = await getMessages(pool, dmId, userA, { limit: 50 });
      expect(list[0]!.isDeleted).toBe(true);
      expect(list[0]!.content).toBe('');
    });

    it('groups reactions by emoji and flags reactedByMe', async () => {
      const { getMessages } = await import('../../src/chat/service.js');
      const dm = await pool.query(
        `insert into chats (type, created_by) values ('direct', $1) returning id`,
        [userA],
      );
      const dmId = dm.rows[0].id;
      await pool.query(
        `insert into chat_members (chat_id, user_id) values ($1, $2), ($1, $3)`,
        [dmId, userA, userB],
      );
      const msg = await pool.query(
        `insert into messages (chat_id, sender_id, content) values ($1, $2, 'hi') returning id`,
        [dmId, userA],
      );
      const messageId = msg.rows[0].id;
      await pool.query(
        `insert into message_reactions (message_id, user_id, emoji) values
         ($1, $2, '🔥'), ($1, $3, '🔥'), ($1, $2, '👍')`,
        [messageId, userA, userB],
      );

      const list = await getMessages(pool, dmId, userA, { limit: 50 });
      const m = list[0]!;
      const fire = m.reactions.find((r) => r.emoji === '🔥')!;
      const thumb = m.reactions.find((r) => r.emoji === '👍')!;
      expect(fire.count).toBe(2);
      expect(fire.reactedByMe).toBe(true);
      expect(thumb.count).toBe(1);
      expect(thumb.reactedByMe).toBe(true);
    });
  });

  describe('sendMessage', () => {
    let dmId: string;
    beforeEach(async () => {
      const dm = await pool.query(
        `insert into chats (type, created_by) values ('direct', $1) returning id`,
        [userA],
      );
      dmId = dm.rows[0].id;
      await pool.query(
        `insert into chat_members (chat_id, user_id) values ($1, $2), ($1, $3)`,
        [dmId, userA, userB],
      );
    });

    it('inserts a message and returns DTO', async () => {
      const { sendMessage } = await import('../../src/chat/service.js');
      const dto = await sendMessage(pool, { chatId: dmId, senderId: userA, content: 'hi' });
      expect(dto.content).toBe('hi');
      expect(dto.senderId).toBe(userA);
      expect(dto.chatId).toBe(dmId);
      expect(dto.replyToId).toBeNull();
      expect(dto.isDeleted).toBe(false);
    });

    it('preserves replyToId when provided', async () => {
      const { sendMessage } = await import('../../src/chat/service.js');
      const first = await sendMessage(pool, { chatId: dmId, senderId: userA, content: 'parent' });
      const reply = await sendMessage(pool, {
        chatId: dmId,
        senderId: userB,
        content: 'reply',
        replyToId: first.id,
      });
      expect(reply.replyToId).toBe(first.id);
    });

    it('lazy-upserts chat_member for system channel sender', async () => {
      const { sendMessage } = await import('../../src/chat/service.js');
      const sys = await pool.query(
        `insert into chats (type, name, created_by) values ('system', 'Общий', $1) returning id`,
        [userA],
      );
      const before = await pool.query(`select count(*) as c from chat_members where chat_id = $1`, [
        sys.rows[0].id,
      ]);
      expect(Number(before.rows[0].c)).toBe(0);
      await sendMessage(pool, { chatId: sys.rows[0].id, senderId: userC, content: 'first' });
      const after = await pool.query(`select count(*) as c from chat_members where chat_id = $1`, [
        sys.rows[0].id,
      ]);
      expect(Number(after.rows[0].c)).toBe(1);
    });
  });

  describe('deleteMessage', () => {
    it('soft-deletes: sets is_deleted=true and content=""', async () => {
      const { deleteMessage } = await import('../../src/chat/service.js');
      const dm = await pool.query(
        `insert into chats (type, created_by) values ('direct', $1) returning id`,
        [userA],
      );
      const msg = await pool.query(
        `insert into messages (chat_id, sender_id, content) values ($1, $2, 'gone') returning id`,
        [dm.rows[0].id, userA],
      );
      await deleteMessage(pool, msg.rows[0].id);
      const r = await pool.query(`select content, is_deleted from messages where id = $1`, [
        msg.rows[0].id,
      ]);
      expect(r.rows[0].is_deleted).toBe(true);
      expect(r.rows[0].content).toBe('');
    });
  });

  describe('markChatAsRead', () => {
    it('updates last_read_at when membership exists', async () => {
      const { markChatAsRead } = await import('../../src/chat/service.js');
      const dm = await pool.query(
        `insert into chats (type, created_by) values ('direct', $1) returning id`,
        [userA],
      );
      const dmId = dm.rows[0].id;
      await pool.query(
        `insert into chat_members (chat_id, user_id, last_read_at) values ($1, $2, now() - interval '1 day')`,
        [dmId, userA],
      );
      await markChatAsRead(pool, dmId, userA);
      const r = await pool.query(
        `select last_read_at from chat_members where chat_id = $1 and user_id = $2`,
        [dmId, userA],
      );
      const ts = r.rows[0].last_read_at as Date;
      expect(Date.now() - ts.getTime()).toBeLessThan(2000);
    });

    it('lazy-creates chat_members row for system channel readers', async () => {
      const { markChatAsRead } = await import('../../src/chat/service.js');
      const sys = await pool.query(
        `insert into chats (type, name, created_by) values ('system', 'Общий', $1) returning id`,
        [userA],
      );
      await markChatAsRead(pool, sys.rows[0].id, userC);
      const r = await pool.query(
        `select count(*) as c from chat_members where chat_id = $1 and user_id = $2`,
        [sys.rows[0].id, userC],
      );
      expect(Number(r.rows[0].c)).toBe(1);
    });
  });

  describe('findOrCreateDM', () => {
    it('creates a new DM and returns chatId', async () => {
      const { findOrCreateDM } = await import('../../src/chat/service.js');
      const r = await findOrCreateDM(pool, userA, userB);
      expect(r.chatId).toBeTruthy();
      expect(r.created).toBe(true);

      const chat = await pool.query(`select * from chats where id = $1`, [r.chatId]);
      expect(chat.rows[0].type).toBe('direct');

      const members = await pool.query(
        `select user_id from chat_members where chat_id = $1`,
        [r.chatId],
      );
      expect(members.rowCount).toBe(2);
    });

    it('is idempotent: second call returns the same chatId regardless of arg order', async () => {
      const { findOrCreateDM } = await import('../../src/chat/service.js');
      const r1 = await findOrCreateDM(pool, userA, userB);
      const r2 = await findOrCreateDM(pool, userB, userA);
      expect(r2.chatId).toBe(r1.chatId);
      expect(r2.created).toBe(false);
    });

    it('rejects self-DM with InvalidInputError', async () => {
      const { findOrCreateDM } = await import('../../src/chat/service.js');
      const { InvalidInputError } = await import('../../src/chat/errors.js');
      await expect(findOrCreateDM(pool, userA, userA)).rejects.toBeInstanceOf(InvalidInputError);
    });
  });
});
