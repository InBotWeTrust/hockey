import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Pool } from 'pg';
import { hasIntegrationEnv, createTestPool, resetDatabase } from '../helpers/testDb.js';
import { applyMigrations } from '../../src/db/migrations.js';
import {
  publishReactionAdded,
  publishReactionRemoved,
  type EventPublisher,
} from '../../src/chat/events.js';
import type { ChatEvent } from '../../src/chat/types.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

interface RecordedPublish {
  channel: string;
  event: ChatEvent;
}

function recorder(): { publisher: EventPublisher; records: RecordedPublish[] } {
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

function failingPublisher(): EventPublisher {
  return {
    async publish() {
      throw new Error('redis blew up');
    },
  };
}

describe.skipIf(!hasIntegrationEnv)('chat reaction events fan-out', () => {
  let pool: Pool;
  let userA: string;
  let userB: string;
  let dmAB: string;
  let systemChat: string;
  const messageId = '11111111-1111-1111-1111-111111111111';

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);
    const insU = `insert into users (id, display_name, timezone) values (gen_random_uuid(), $1, 'UTC') returning id`;
    userA = (await pool.query(insU, ['Alice'])).rows[0].id;
    userB = (await pool.query(insU, ['Bob'])).rows[0].id;
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
      `insert into chats (type, name, created_by) values ('system', 'Лига', $1) returning id`,
      [userA],
    );
    systemChat = sys.rows[0].id;
  });

  afterAll(async () => {
    await pool.end();
  });

  it('publishReactionAdded for direct → fan-out to chat_members', async () => {
    const { publisher, records } = recorder();
    await publishReactionAdded(pool, publisher, dmAB, 'direct', messageId, userA, '🔥');
    expect(records.map((r) => r.channel).sort()).toEqual(
      [`chat:user:${userA}`, `chat:user:${userB}`].sort(),
    );
    for (const r of records) {
      expect(r.event.type).toBe('reaction:added');
      const ev = r.event as Extract<ChatEvent, { type: 'reaction:added' }>;
      expect(ev.messageId).toBe(messageId);
      expect(ev.userId).toBe(userA);
      expect(ev.emoji).toBe('🔥');
      expect(ev.chatId).toBe(dmAB);
    }
  });

  it('publishReactionAdded for system → exactly one publish to chat:system:<id>', async () => {
    const { publisher, records } = recorder();
    await publishReactionAdded(pool, publisher, systemChat, 'system', messageId, userA, '🔥');
    expect(records).toHaveLength(1);
    expect(records[0]!.channel).toBe(`chat:system:${systemChat}`);
    expect(records[0]!.event.type).toBe('reaction:added');
  });

  it('publishReactionRemoved routes the same way (DM)', async () => {
    const { publisher, records } = recorder();
    await publishReactionRemoved(pool, publisher, dmAB, 'direct', messageId, userA, '❤️');
    expect(records.map((r) => r.channel).sort()).toEqual(
      [`chat:user:${userA}`, `chat:user:${userB}`].sort(),
    );
    expect(records[0]!.event.type).toBe('reaction:removed');
  });

  it('Redis publish error is swallowed (best-effort delivery)', async () => {
    await expect(
      publishReactionAdded(pool, failingPublisher(), dmAB, 'direct', messageId, userA, '🔥'),
    ).resolves.toBeUndefined();
  });
});
