import { describe, it, expect, vi } from 'vitest';
import type { Pool } from 'pg';
import { joinBarChat } from '../../src/bar/chat.js';
const live = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../src/bar/service.js', () => ({ getBarLive: live.get }));
describe('match spectator chat', () => {
  it('denies unavailable or upcoming matches before creating membership', async () => {
    const connect = vi.fn();
    for (const match of [null, { group: 'upcoming' }]) {
      live.get.mockResolvedValue({ match });
      await expect(
        joinBarChat({ connect } as unknown as Pool, 'viewer', 'duel', 'match'),
      ).rejects.toThrow();
    }
    expect(connect).not.toHaveBeenCalled();
  });
  it('joins an existing room idempotently and releases its transaction', async () => {
    live.get.mockResolvedValue({ match: { group: 'online' } });
    const query = vi.fn().mockResolvedValue({ rows: [] });
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ chat_id: 'room' }] });
    const release = vi.fn();
    const pool = { connect: vi.fn().mockResolvedValue({ query, release }) } as unknown as Pool;
    expect(await joinBarChat(pool, 'viewer', 'duel', 'match')).toEqual({ chatId: 'room' });
    expect(query.mock.calls.some((c) => String(c[0]).includes('on conflict'))).toBe(true);
    expect(query.mock.calls.at(-1)?.[0]).toBe('commit');
    expect(release).toHaveBeenCalledOnce();
  });
});
