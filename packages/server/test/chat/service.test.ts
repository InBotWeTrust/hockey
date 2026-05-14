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
    it('returns the default news channel when user has no chats and no system channels', async () => {
      const list = await getMyChats(pool, userA);
      expect(list).toEqual([
        expect.objectContaining({
          type: 'channel',
          name: 'Новости игры',
          channelSlug: 'news',
        }),
      ]);
    });

    it('returns DM with counterpart info', async () => {
      const dm = await pool.query(
        `insert into chats (type, created_by) values ('direct', $1) returning id`,
        [userA],
      );
      const dmId = dm.rows[0].id;
      await pool.query(`insert into chat_members (chat_id, user_id) values ($1, $2), ($1, $3)`, [
        dmId,
        userA,
        userB,
      ]);

      const list = await getMyChats(pool, userA);
      const dmChat = list.find((chat) => chat.id === dmId)!;
      expect(dmChat.type).toBe('direct');
      expect(dmChat.dmCounterpart?.userId).toBe(userB);
      expect(dmChat.dmCounterpart?.displayName).toBe('Bob');
      expect(dmChat.dmCounterpart?.lastReadAt).toEqual(expect.any(String));
      expect(dmChat.unreadCount).toBe(0);
      expect(dmChat.lastMessage).toBeNull();
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
      const dmChat = list.find((chat) => chat.id === dmId)!;
      expect(dmChat.unreadCount).toBe(3);
      expect(dmChat.lastMessage?.content).toBe('mine');
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
      const dmChat = list.find((chat) => chat.id === dmId)!;
      expect(dmChat.unreadCount).toBe(1);
      expect(dmChat.lastMessage?.content).toBe('visible');
    });

    it('includes system channels even without chat_members row', async () => {
      await pool.query(
        `insert into chats (type, name, created_by) values ('system', 'Общий', $1)`,
        [userA],
      );

      const list = await getMyChats(pool, userA);
      const systemChat = list.find((chat) => chat.type === 'system')!;
      expect(systemChat.name).toBe('Общий');
      expect(systemChat.dmCounterpart).toBeNull();
    });

    it('memberCount: system → all users; direct → 2 from chat_members', async () => {
      await pool.query(
        `insert into chats (type, name, created_by) values ('system', 'Общий', $1)`,
        [userA],
      );
      const dm = await pool.query(
        `insert into chats (type, created_by) values ('direct', $1) returning id`,
        [userA],
      );
      await pool.query(`insert into chat_members (chat_id, user_id) values ($1, $2), ($1, $3)`, [
        dm.rows[0].id,
        userA,
        userB,
      ]);

      const list = await getMyChats(pool, userA);
      const sys = list.find((c) => c.type === 'system')!;
      const dmRow = list.find((c) => c.type === 'direct')!;
      // 3 users seeded in beforeAll (Alice, Bob, Charlie).
      expect(sys.memberCount).toBe(3);
      expect(dmRow.memberCount).toBe(2);
    });

    it('orders by last_message_at desc, NULLS last', async () => {
      const old = await pool.query(
        `insert into chats (type, created_by) values ('direct', $1) returning id`,
        [userA],
      );
      const oldId = old.rows[0].id;
      await pool.query(`insert into chat_members (chat_id, user_id) values ($1, $2), ($1, $3)`, [
        oldId,
        userA,
        userB,
      ]);
      await pool.query(
        `insert into messages (chat_id, sender_id, content) values ($1, $2, 'old')`,
        [oldId, userB],
      );

      const empty = await pool.query(
        `insert into chats (type, created_by) values ('direct', $1) returning id`,
        [userA],
      );
      await pool.query(`insert into chat_members (chat_id, user_id) values ($1, $2), ($1, $3)`, [
        empty.rows[0].id,
        userA,
        userC,
      ]);

      const list = await getMyChats(pool, userA);
      const regularChats = list.filter((chat) => chat.type !== 'channel');
      expect(regularChats).toHaveLength(2);
      expect(regularChats[0]!.id).toBe(oldId);
      expect(regularChats[1]!.id).toBe(empty.rows[0].id);
    });

    it('does not return inactive chats', async () => {
      const c = await pool.query(
        `insert into chats (type, created_by, is_active) values ('direct', $1, false) returning id`,
        [userA],
      );
      await pool.query(`insert into chat_members (chat_id, user_id) values ($1, $2)`, [
        c.rows[0].id,
        userA,
      ]);
      const list = await getMyChats(pool, userA);
      expect(list.filter((chat) => chat.type !== 'channel')).toHaveLength(0);
    });
  });

  describe('pinned chats', () => {
    it('auto-pins active system chats for users with no chat_members rows yet', async () => {
      await pool.query(
        `insert into chats (type, name, created_by) values ('system', 'Общий', $1)`,
        [userA],
      );
      const list = await getMyChats(pool, userA);
      const systemChat = list.find((chat) => chat.type === 'system')!;
      expect(systemChat.pinnedAt).not.toBeNull();
    });

    it('orders pinned chats first, then by last_message_at desc', async () => {
      const sys = await pool.query(
        `insert into chats (type, name, created_by) values ('system', 'Общий', $1) returning id`,
        [userA],
      );
      const dm = await pool.query(
        `insert into chats (type, created_by) values ('direct', $1) returning id`,
        [userA],
      );
      const dmId = dm.rows[0].id;
      await pool.query(`insert into chat_members (chat_id, user_id) values ($1, $2), ($1, $3)`, [
        dmId,
        userA,
        userB,
      ]);
      // DM has the freshest message; without pin, DM would be first.
      await pool.query(
        `insert into messages (chat_id, sender_id, content) values ($1, $2, 'recent')`,
        [dmId, userB],
      );

      const { pinChat } = await import('../../src/chat/service.js');
      await pinChat(pool, userA, sys.rows[0].id);
      const list = await getMyChats(pool, userA);
      const regularChats = list.filter((chat) => chat.type !== 'channel');
      expect(regularChats).toHaveLength(2);
      expect(regularChats[0]!.type).toBe('system');
      expect(regularChats[0]!.pinnedAt).not.toBeNull();
      expect(regularChats[1]!.type).toBe('direct');
      expect(regularChats[1]!.pinnedAt).toBeNull();
    });

    it('pinChat throws PinLimitExceededError on the 4th distinct pin', async () => {
      const { pinChat } = await import('../../src/chat/service.js');
      const ids: string[] = [];
      for (let i = 0; i < 4; i++) {
        const r = await pool.query(
          `insert into chats (type, created_by) values ('group', $1) returning id`,
          [userA],
        );
        ids.push(r.rows[0].id);
        await pool.query(`insert into chat_members (chat_id, user_id) values ($1, $2)`, [
          r.rows[0].id,
          userA,
        ]);
      }
      await pinChat(pool, userA, ids[0]!);
      await pinChat(pool, userA, ids[1]!);
      await pinChat(pool, userA, ids[2]!);
      await expect(pinChat(pool, userA, ids[3]!)).rejects.toThrow(/pin/i);
    });

    it('re-pinning an already-pinned chat is a no-op (does not count toward the limit)', async () => {
      const { pinChat } = await import('../../src/chat/service.js');
      const r = await pool.query(
        `insert into chats (type, created_by) values ('group', $1) returning id`,
        [userA],
      );
      await pool.query(`insert into chat_members (chat_id, user_id) values ($1, $2)`, [
        r.rows[0].id,
        userA,
      ]);
      await pinChat(pool, userA, r.rows[0].id);
      await pinChat(pool, userA, r.rows[0].id); // idempotent
      await pinChat(pool, userA, r.rows[0].id); // still ok

      const cnt = await pool.query<{ c: string }>(
        `select count(*)::bigint as c from chat_members
          where user_id = $1 and pinned_at is not null`,
        [userA],
      );
      expect(Number(cnt.rows[0]!.c)).toBe(1);
    });

    it('explicit unpin is sticky: auto-pin does not re-pin a system chat the user unpinned', async () => {
      const { unpinChat } = await import('../../src/chat/service.js');
      const sys = await pool.query(
        `insert into chats (type, name, created_by) values ('system', 'Общий', $1) returning id`,
        [userA],
      );
      // First /chat/list triggers auto-pin.
      let list = await getMyChats(pool, userA);
      expect(list.find((chat) => chat.type === 'system')!.pinnedAt).not.toBeNull();
      // User unpins.
      await unpinChat(pool, userA, sys.rows[0].id);
      // Subsequent list calls keep it unpinned.
      list = await getMyChats(pool, userA);
      expect(list.find((chat) => chat.type === 'system')!.pinnedAt).toBeNull();
      list = await getMyChats(pool, userA);
      expect(list.find((chat) => chat.type === 'system')!.pinnedAt).toBeNull();
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
      await pool.query(`insert into chat_members (chat_id, user_id) values ($1, $2), ($1, $3)`, [
        dmId,
        userA,
        userB,
      ]);
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
      await pool.query(`insert into chat_members (chat_id, user_id) values ($1, $2), ($1, $3)`, [
        dmId,
        userA,
        userB,
      ]);
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
      await pool.query(`insert into chat_members (chat_id, user_id) values ($1, $2)`, [
        dmId,
        userA,
      ]);
      await pool.query(
        `insert into messages (chat_id, sender_id, content, is_deleted) values ($1, $2, 'gone', true)`,
        [dmId, userA],
      );
      const list = await getMessages(pool, dmId, userA, { limit: 50 });
      expect(list[0]!.isDeleted).toBe(true);
      expect(list[0]!.content).toBe('');
    });

    it('groups reactions by emoji across users and flags reactedByMe', async () => {
      const { getMessages } = await import('../../src/chat/service.js');
      const dm = await pool.query(
        `insert into chats (type, created_by) values ('direct', $1) returning id`,
        [userA],
      );
      const dmId = dm.rows[0].id;
      await pool.query(`insert into chat_members (chat_id, user_id) values ($1, $2), ($1, $3)`, [
        dmId,
        userA,
        userB,
      ]);
      const msg = await pool.query(
        `insert into messages (chat_id, sender_id, content) values ($1, $2, 'hi') returning id`,
        [dmId, userA],
      );
      const messageId = msg.rows[0].id;
      // Migration 005 enforces UNIQUE(message_id, user_id), so each user
      // gets at most one row. Use three distinct users to exercise
      // group-by-emoji aggregation: A+B both react 🔥, C reacts 👍.
      await pool.query(
        `insert into message_reactions (message_id, user_id, emoji) values
         ($1, $2, '🔥'), ($1, $3, '🔥'), ($1, $4, '👍')`,
        [messageId, userA, userB, userC],
      );

      const list = await getMessages(pool, dmId, userA, { limit: 50 });
      const m = list[0]!;
      const fire = m.reactions.find((r) => r.emoji === '🔥')!;
      const thumb = m.reactions.find((r) => r.emoji === '👍')!;
      expect(fire.count).toBe(2);
      expect(fire.reactedByMe).toBe(true);
      expect(thumb.count).toBe(1);
      expect(thumb.reactedByMe).toBe(false);
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
      await pool.query(`insert into chat_members (chat_id, user_id) values ($1, $2), ($1, $3)`, [
        dmId,
        userA,
        userB,
      ]);
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

  describe('updateMessage', () => {
    it('updates content, returns edited DTO, and preserves reactions', async () => {
      const { updateMessage } = await import('../../src/chat/service.js');
      const dm = await pool.query(
        `insert into chats (type, created_by) values ('direct', $1) returning id`,
        [userA],
      );
      const msg = await pool.query(
        `insert into messages (chat_id, sender_id, content, created_at, updated_at)
         values ($1, $2, 'old', now() - interval '1 minute', now() - interval '1 minute')
         returning id`,
        [dm.rows[0].id, userA],
      );
      const messageId = msg.rows[0].id;
      await pool.query(
        `insert into message_reactions (message_id, user_id, emoji) values ($1, $2, '👍')`,
        [messageId, userB],
      );

      const dto = await updateMessage(pool, messageId, 'new', userA);

      expect(dto.content).toBe('new');
      expect(dto.isEdited).toBe(true);
      expect(dto.reactions).toEqual([{ emoji: '👍', count: 1, reactedByMe: false }]);
    });

    it('does not update soft-deleted messages', async () => {
      const { updateMessage } = await import('../../src/chat/service.js');
      const { MessageNotFoundError } = await import('../../src/chat/errors.js');
      const dm = await pool.query(
        `insert into chats (type, created_by) values ('direct', $1) returning id`,
        [userA],
      );
      const msg = await pool.query(
        `insert into messages (chat_id, sender_id, content, is_deleted) values ($1, $2, '', true) returning id`,
        [dm.rows[0].id, userA],
      );

      await expect(updateMessage(pool, msg.rows[0].id, 'new', userA)).rejects.toBeInstanceOf(
        MessageNotFoundError,
      );
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

      const members = await pool.query(`select user_id from chat_members where chat_id = $1`, [
        r.chatId,
      ]);
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

  describe('searchUsers', () => {
    it('returns users matching trigram similarity, excluding self', async () => {
      const { searchUsers } = await import('../../src/chat/service.js');
      const list = await searchUsers(pool, userA, { q: 'bo', limit: 10 });
      expect(list.find((u) => u.userId === userB)).toBeTruthy();
      expect(list.find((u) => u.userId === userA)).toBeFalsy();
    });

    it('returns empty for empty query', async () => {
      const { searchUsers } = await import('../../src/chat/service.js');
      const list = await searchUsers(pool, userA, { q: '', limit: 10 });
      expect(list).toEqual([]);
    });
  });

  describe('searchMessages', () => {
    it('returns full-text matches in user-accessible chats', async () => {
      const { searchMessages } = await import('../../src/chat/service.js');
      const dm = await pool.query(
        `insert into chats (type, created_by) values ('direct', $1) returning id`,
        [userA],
      );
      await pool.query(`insert into chat_members (chat_id, user_id) values ($1, $2), ($1, $3)`, [
        dm.rows[0].id,
        userA,
        userB,
      ]);
      await pool.query(
        `insert into messages (chat_id, sender_id, content) values
         ($1, $2, 'hello world'),
         ($1, $2, 'привет мир'),
         ($1, $2, 'unrelated text')`,
        [dm.rows[0].id, userA],
      );
      const found = await searchMessages(pool, userA, { q: 'мир', limit: 10 });
      expect(found.length).toBeGreaterThanOrEqual(1);
      expect(found[0]!.content).toContain('мир');
    });

    it('does not return messages from chats the user has no access to', async () => {
      const { searchMessages } = await import('../../src/chat/service.js');
      const dm = await pool.query(
        `insert into chats (type, created_by) values ('direct', $1) returning id`,
        [userB],
      );
      await pool.query(`insert into chat_members (chat_id, user_id) values ($1, $2), ($1, $3)`, [
        dm.rows[0].id,
        userB,
        userC,
      ]);
      await pool.query(
        `insert into messages (chat_id, sender_id, content) values ($1, $2, 'secret payload')`,
        [dm.rows[0].id, userB],
      );
      const found = await searchMessages(pool, userA, { q: 'secret', limit: 10 });
      expect(found).toEqual([]);
    });
  });

  describe('getUnreadCounts', () => {
    it('returns map of chatId -> count', async () => {
      const { getUnreadCounts } = await import('../../src/chat/service.js');
      const dm = await pool.query(
        `insert into chats (type, created_by) values ('direct', $1) returning id`,
        [userA],
      );
      await pool.query(
        `insert into chat_members (chat_id, user_id, last_read_at) values
         ($1, $2, now() - interval '1 hour'), ($1, $3, now() - interval '1 hour')`,
        [dm.rows[0].id, userA, userB],
      );
      await pool.query(
        `insert into messages (chat_id, sender_id, content) values
         ($1, $2, 'a'), ($1, $2, 'b')`,
        [dm.rows[0].id, userB],
      );

      const map = await getUnreadCounts(pool, userA);
      expect(map[dm.rows[0].id]).toBe(2);
    });
  });
});
