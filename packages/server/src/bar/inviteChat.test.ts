import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pool, PoolClient } from 'pg';
const mocks = vi.hoisted(() => ({ dm: vi.fn(), send: vi.fn() }));
vi.mock('../chat/service.js', () => ({ findOrCreateDM: mocks.dm, sendMessage: mocks.send }));
import { createBarInviteMessage, syncBarInviteMessages, publishBarInviteMessages, configureBarInviteChat } from './inviteChat.js';
const pool = {} as Pool;
const query = vi.fn();
const client = { query } as unknown as PoolClient;
const publisher = { publish: vi.fn() };
const redis = { del: vi.fn() };
const invitation = { id: 'invite', senderId: 'a', receiverId: 'b', kind: 'darts' as const, capacity: 2, expiresAt: new Date('2026-10-22T00:00:00Z'), roomId: null };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.dm.mockResolvedValue({ chatId: 'chat' });
  mocks.send.mockImplementation(async (_p, opts) => ({ id: 'message', chatId: opts.chatId, senderId: opts.senderId, content: opts.content, metadata: opts.metadata }));
  configureBarInviteChat(pool, publisher, redis);
  query.mockResolvedValue({ rows: [] });
});
describe('bar invitation chat', () => {
  it('saves a card in the caller transaction and publishes only after commit', async () => {
    await createBarInviteMessage(pool, client, invitation);
    expect(mocks.dm).toHaveBeenCalledWith(pool, 'a', 'b', client);
    expect(mocks.send.mock.calls[0]?.[1]).toMatchObject({ metadata: { type: 'bar_game_invite', inviteId: 'invite', kind: 'darts', capacity: 2, status: 'pending', receiverId: 'b' } });
    expect(publisher.publish).not.toHaveBeenCalled();
    await publishBarInviteMessages(pool, client);
    expect(publisher.publish).toHaveBeenCalledTimes(2);
    expect(redis.del).toHaveBeenCalledWith('chat:unread:a');
    await publishBarInviteMessages(pool, client);
    expect(publisher.publish).toHaveBeenCalledTimes(2);
  });
  it('keeps table capacity and destination for each invited participant', async () => {
    await createBarInviteMessage(pool, client, { ...invitation, kind: 'cards', capacity: 6, roomId: 'room' });
    expect(mocks.send.mock.calls[0]?.[1]).toMatchObject({ metadata: { kind: 'cards', capacity: 6, roomId: 'room' } });
    expect(mocks.send.mock.calls[0]?.[1].content).toContain('6');
    await publishBarInviteMessages(pool, client);
  });
  it('does not create resolution messages without a state transition', async () => {
    await syncBarInviteMessages(pool, client);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it('does not turn a committed invitation into an error when realtime fails', async () => {
    publisher.publish.mockRejectedValueOnce(new Error('offline'));
    await createBarInviteMessage(pool, client, invitation);
    await expect(publishBarInviteMessages(pool, client)).resolves.toBeUndefined();
  });
});
