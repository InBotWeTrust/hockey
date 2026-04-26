import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Pool } from 'pg';
import { hasIntegrationEnv, createTestPool, resetDatabase } from '../helpers/testDb.js';
import { applyMigrations } from '../../src/db/migrations.js';
import {
  publishMessageNew,
  publishMessageDeleted,
  publishChatRead,
  type EventPublisher,
} from '../../src/chat/events.js';
import type { ChatEvent, ChatMessageDTO } from '../../src/chat/types.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

interface RecordedPublish {
  channel: string;
  event: ChatEvent;
}

function recorder(): {
  publisher: EventPublisher;
  records: RecordedPublish[];
} {
  const records: RecordedPublish[] = [];
  return {
    records,
    publisher: {
      async publish(channel, event) {
        records.push({ channel, event });
      },
    },
  };
}

describe.skipIf(!hasIntegrationEnv)('chat events fan-out', () => {
  let pool: Pool;
  let userA: string;
  let userB: string;
  let userC: string;
  let dmAB: string;
  let groupABC: string;
  let systemChat: string;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);

    const insU = `insert into users (id, display_name, timezone) values (gen_random_uuid(), $1, 'UTC') returning id`;
    userA = (await pool.query(insU, ['Alice'])).rows[0].id;
    userB = (await pool.query(insU, ['Bob'])).rows[0].id;
    userC = (await pool.query(insU, ['Charlie'])).rows[0].id;

    const dm = await pool.query(
      `insert into chats (type, created_by) values ('direct', $1) returning id`,
      [userA],
    );
    dmAB = dm.rows[0].id;
    await pool.query(
      `insert into chat_members (chat_id, user_id) values ($1, $2), ($1, $3)`,
      [dmAB, userA, userB],
    );

    const grp = await pool.query(
      `insert into chats (type, name, created_by) values ('group', $1, $2) returning id`,
      ['Squad', userA],
    );
    groupABC = grp.rows[0].id;
    await pool.query(
      `insert into chat_members (chat_id, user_id) values ($1, $2), ($1, $3), ($1, $4)`,
      [groupABC, userA, userB, userC],
    );

    const sys = await pool.query(
      `insert into chats (type, name, created_by) values ('system', $1, $2) returning id`,
      ['Общий чат лиги', userA],
    );
    systemChat = sys.rows[0].id;
  });

  afterAll(async () => {
    await pool.end();
  });

  const fakeMsg = (chatId: string): ChatMessageDTO => ({
    id: '00000000-0000-0000-0000-000000000001',
    chatId,
    senderId: '00000000-0000-0000-0000-000000000002',
    content: 'hi',
    replyToId: null,
    isDeleted: false,
    createdAt: '2026-04-26T00:00:00.000Z',
    reactions: [],
  });

  it('DM message:new → publish per chat_member', async () => {
    const { publisher, records } = recorder();
    await publishMessageNew(pool, publisher, dmAB, 'direct', fakeMsg(dmAB));
    const channels = records.map((r) => r.channel).sort();
    expect(channels).toEqual([`chat:user:${userA}`, `chat:user:${userB}`].sort());
    for (const r of records) {
      expect(r.event.type).toBe('message:new');
      expect((r.event as Extract<ChatEvent, { type: 'message:new' }>).chatId).toBe(dmAB);
    }
  });

  it('group message:new → publish per chat_member (3 fans)', async () => {
    const { publisher, records } = recorder();
    await publishMessageNew(pool, publisher, groupABC, 'group', fakeMsg(groupABC));
    expect(records).toHaveLength(3);
    expect(records.map((r) => r.channel).sort()).toEqual(
      [`chat:user:${userA}`, `chat:user:${userB}`, `chat:user:${userC}`].sort(),
    );
  });

  it('system message:new → exactly one publish to chat:system:<chatId>', async () => {
    const { publisher, records } = recorder();
    await publishMessageNew(pool, publisher, systemChat, 'system', fakeMsg(systemChat));
    expect(records).toHaveLength(1);
    expect(records[0]!.channel).toBe(`chat:system:${systemChat}`);
    expect(records[0]!.event.type).toBe('message:new');
  });

  it('publishMessageDeleted routes the same way (DM → fan-out)', async () => {
    const { publisher, records } = recorder();
    await publishMessageDeleted(pool, publisher, dmAB, 'direct', 'msg-id-x');
    expect(records.map((r) => r.channel).sort()).toEqual(
      [`chat:user:${userA}`, `chat:user:${userB}`].sort(),
    );
    expect(records[0]!.event.type).toBe('message:deleted');
  });

  it('publishMessageDeleted system → 1 publish', async () => {
    const { publisher, records } = recorder();
    await publishMessageDeleted(pool, publisher, systemChat, 'system', 'msg-id-x');
    expect(records).toHaveLength(1);
    expect(records[0]!.channel).toBe(`chat:system:${systemChat}`);
  });

  it('publishChatRead DM → notifies the reader only (other tabs of same user)', async () => {
    const { publisher, records } = recorder();
    await publishChatRead(pool, publisher, dmAB, 'direct', userA, '2026-04-26T00:00:00.000Z');
    expect(records).toHaveLength(1);
    expect(records[0]!.channel).toBe(`chat:user:${userA}`);
    expect(records[0]!.event.type).toBe('chat:read');
  });

  it('publishChatRead system → reader-only too', async () => {
    const { publisher, records } = recorder();
    await publishChatRead(pool, publisher, systemChat, 'system', userC, '2026-04-26T00:00:00.000Z');
    expect(records).toHaveLength(1);
    expect(records[0]!.channel).toBe(`chat:user:${userC}`);
  });
});
