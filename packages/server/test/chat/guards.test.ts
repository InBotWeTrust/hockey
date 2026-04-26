import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { hasIntegrationEnv, createTestPool, resetDatabase } from '../helpers/testDb.js';
import { applyMigrations } from '../../src/db/migrations.js';
import {
  canAccessChat,
  assertCanAccessChat,
  assertOwnsMessage,
  checkMembership,
  getChatById,
} from '../../src/chat/guards.js';
import {
  ChatAccessDeniedError,
  MessageNotFoundError,
  MessageNotOwnedError,
} from '../../src/chat/errors.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

describe.skipIf(!hasIntegrationEnv)('chat guards', () => {
  let pool: Pool;
  let userA: string;
  let userB: string;
  let userC: string;
  let dmAB: string;
  let systemChat: string;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);

    const ins = `insert into users (id, display_name, timezone) values (gen_random_uuid(), $1, 'UTC') returning id`;
    userA = (await pool.query(ins, ['Alice'])).rows[0].id;
    userB = (await pool.query(ins, ['Bob'])).rows[0].id;
    userC = (await pool.query(ins, ['Charlie'])).rows[0].id;

    const dm = await pool.query(
      `insert into chats (type, created_by) values ('direct', $1) returning id`,
      [userA],
    );
    dmAB = dm.rows[0].id;
    await pool.query(
      `insert into chat_members (chat_id, user_id) values ($1, $2), ($1, $3)`,
      [dmAB, userA, userB],
    );

    const sys = await pool.query(
      `insert into chats (type, name, created_by) values ('system', $1, $2) returning id`,
      ['Общий', userA],
    );
    systemChat = sys.rows[0].id;
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('canAccessChat', () => {
    it('member of DM has access', async () => {
      const r = await canAccessChat(pool, userA, dmAB);
      expect(r).not.toBeNull();
      expect(r!.isMember).toBe(true);
      expect(r!.chat.id).toBe(dmAB);
    });

    it('non-member of DM has NO access', async () => {
      const r = await canAccessChat(pool, userC, dmAB);
      expect(r).toBeNull();
    });

    it('any user has access to system channel (without chat_members row)', async () => {
      const r = await canAccessChat(pool, userC, systemChat);
      expect(r).not.toBeNull();
      expect(r!.isMember).toBe(false);
      expect(r!.chat.type).toBe('system');
    });

    it('returns null for nonexistent chat', async () => {
      const r = await canAccessChat(pool, userA, '00000000-0000-0000-0000-000000000000');
      expect(r).toBeNull();
    });

    it('returns null for inactive (soft-deleted) chat', async () => {
      const inactive = await pool.query(
        `insert into chats (type, created_by, is_active) values ('direct', $1, false) returning id`,
        [userA],
      );
      const r = await canAccessChat(pool, userA, inactive.rows[0].id);
      expect(r).toBeNull();
    });
  });

  describe('assertCanAccessChat', () => {
    it('returns chat row when access granted', async () => {
      const chat = await assertCanAccessChat(pool, userA, dmAB);
      expect(chat.id).toBe(dmAB);
    });

    it('throws ChatAccessDeniedError for non-member', async () => {
      await expect(assertCanAccessChat(pool, userC, dmAB)).rejects.toBeInstanceOf(
        ChatAccessDeniedError,
      );
    });
  });

  describe('checkMembership', () => {
    it('true when row exists', async () => {
      expect(await checkMembership(pool, userA, dmAB)).toBe(true);
    });
    it('false when no row', async () => {
      expect(await checkMembership(pool, userC, dmAB)).toBe(false);
    });
  });

  describe('assertOwnsMessage', () => {
    it('returns message when sender matches', async () => {
      const msg = await pool.query(
        `insert into messages (chat_id, sender_id, content) values ($1, $2, 'mine') returning id`,
        [dmAB, userA],
      );
      const m = await assertOwnsMessage(pool, userA, msg.rows[0].id);
      expect(m.id).toBe(msg.rows[0].id);
      expect(m.sender_id).toBe(userA);
    });

    it('throws MessageNotOwnedError when sender differs', async () => {
      const msg = await pool.query(
        `insert into messages (chat_id, sender_id, content) values ($1, $2, 'theirs') returning id`,
        [dmAB, userA],
      );
      await expect(assertOwnsMessage(pool, userB, msg.rows[0].id)).rejects.toBeInstanceOf(
        MessageNotOwnedError,
      );
    });

    it('throws MessageNotFoundError for missing id', async () => {
      await expect(
        assertOwnsMessage(pool, userA, '00000000-0000-0000-0000-000000000000'),
      ).rejects.toBeInstanceOf(MessageNotFoundError);
    });
  });

  describe('getChatById', () => {
    it('returns row for active chat', async () => {
      const chat = await getChatById(pool, dmAB);
      expect(chat).not.toBeNull();
      expect(chat!.is_active).toBe(true);
    });
    it('returns null when chat does not exist', async () => {
      const chat = await getChatById(pool, '00000000-0000-0000-0000-000000000000');
      expect(chat).toBeNull();
    });
  });
});
