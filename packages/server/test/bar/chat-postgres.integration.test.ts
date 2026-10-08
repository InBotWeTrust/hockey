import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { createTestPool, hasIntegrationEnv } from '../helpers/testDb.js';
import { joinBarChat } from '../../src/bar/chat.js';
import { getChatById } from '../../src/chat/guards.js';

// Isolate storage concurrency from fixture visibility, which is tested in service tests.
vi.mock('../../src/bar/service.js', () => ({
  getBarLive: vi.fn(async () => ({ match: { group: 'online', kind: 'duel' } })),
}));
describe.skipIf(!hasIntegrationEnv)('bar chat PostgreSQL contract', () => {
  let pool: Pool;
  const fixtureId = randomUUID();
  const viewers = [randomUUID(), randomUUID()];
  let chatId: string | undefined;
  beforeAll(async () => {
    pool = createTestPool();
    for (const id of viewers)
      await pool.query(
        "insert into users (id,display_name,timezone) values ($1,'Synthetic bar viewer','UTC')",
        [id],
      );
  });
  afterAll(async () => {
    if (chatId) await pool.query('delete from chats where id=$1', [chatId]);
    await pool.query('delete from users where id=any($1::uuid[])', [viewers]);
    await pool.end();
  });
  it('creates one room for simultaneous viewers and keeps repeat joins idempotent', async () => {
    const joined = await Promise.all(viewers.map((id) => joinBarChat(pool, id, 'duel', fixtureId)));
    chatId = joined[0]!.chatId;
    expect(joined[1]!.chatId).toBe(chatId);
    expect(await joinBarChat(pool, viewers[0]!, 'duel', fixtureId)).toEqual({ chatId });
    const members = await pool.query('select role from chat_members where chat_id=$1', [chatId]);
    expect(members.rows).toEqual([{ role: 'member' }, { role: 'member' }]);
    const mappings = await pool.query('select chat_id from bar_match_chat where match_id=$1', [
      fixtureId,
    ]);
    expect(mappings.rows).toEqual([{ chat_id: chatId }]);
  });
  it('denies access when the associated fixture is unavailable', async () => {
    expect(chatId).toBeDefined();
    expect(await getChatById(pool, chatId!)).toBeNull();
  });
});
