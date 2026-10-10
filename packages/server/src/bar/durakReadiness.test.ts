import { afterEach, expect, it, vi } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import { durak } from '@hockey/game-core';
import { getCardMatch } from './durakService.js';
import { reconcileRoom, startCountdown } from './durakRooms.js';
afterEach(() => { vi.useRealTimers(); });
function fixture() {
  vi.useFakeTimers();
  vi.setSystemTime(100000);
  const match = {
    id: 'match',
    player_a: 'a',
    player_b: 'b',
    state: {
      ...durak.createGame(() => 0.4),
      readiness: {
        ready: [] as string[],
        expiresAt: 160000,
        startsAt: null as number | null,
        cancelled: false,
      },
    },
    deadline_at: new Date(160000),
    ended_at: null as Date | null,
  };
  const query = vi.fn(async (sql: string, args: unknown[] = []) => {
    if (sql.startsWith('select * from bar_card_matches')) return { rows: [match] };
    if (sql.startsWith('select display_name'))
      return { rows: [{ display_name: 'Opponent', avatar_url: null }] };
    if (sql.startsWith('update bar_card_matches')) {
      match.state = JSON.parse(args[1] as string);
      match.deadline_at = args[2] as Date;
      if (sql.includes('ended_at')) match.ended_at = args[3] as Date | null;
    }
    return { rows: [] };
  });
  const client = { query, release: vi.fn() };
  const pool = { connect: async () => client } as unknown as Pool;
  return { pool, match };
}
it('requires both players and starts the turn clock after the shared countdown', async () => {
  const { pool } = fixture();
  const first = await getCardMatch(pool, 'a', 'match');
  expect(first.hand).toEqual([]);
  await expect(getCardMatch(pool, 'c', 'match')).rejects.toMatchObject({ statusCode: 404 });
  await expect(
    getCardMatch(pool, 'a', 'match', { revision: 0, action: { type: 'finish' } }),
  ).rejects.toMatchObject({ statusCode: 409 });
  const a = await getCardMatch(pool, 'a', 'match', { revision: 0, action: 'ready' });
  expect(a.readiness?.startsAt).toBeNull();
  const retry = await getCardMatch(pool, 'a', 'match', { revision: 0, action: 'ready' });
  expect(retry.revision).toBe(a.revision);
  const b = await getCardMatch(pool, 'b', 'match', { revision: 0, action: 'ready' });
  expect(b.readiness?.startsAt).toBe(103000);
  expect(b.hand).toEqual([]);
  vi.setSystemTime(103000);
  const started = await getCardMatch(pool, 'a', 'match');
  expect(started.readiness).toBeUndefined();
  expect(started.hand).toHaveLength(6);
  expect(started.deadline).toBeGreaterThan(103000);
});
it('expires without assigning a defeat', async () => {
  const { pool, match } = fixture();
  vi.setSystemTime(160000);
  const expired = await getCardMatch(pool, 'a', 'match');
  expect(expired.readiness?.cancelled).toBe(true);
  expect(expired.result).toBeNull();
  expect(expired.deadline).toBeNull();
  expect(match.ended_at).not.toBeNull();
});
it('expires a two-player room and releases its reserved seats', async () => {
  const query = vi.fn().mockResolvedValue({ rows: [] });
  const room = {
    seats: ['a', 'b'],
    owner: 'a',
    capacity: 2,
    status: 'confirming' as const,
    searchUntil: null,
    countdownAt: null,
    proposed: false,
    ready: ['a'],
    readyUntil: 100,
    revision: 1,
    game: null,
    deadline: null,
  };
  const ended = await reconcileRoom({ query } as unknown as PoolClient, 'room', room, 100);
  expect(ended.status).toBe('ended');
  expect(ended.game).toBeNull();
  expect(query).toHaveBeenCalledWith('delete from bar_card_room_players where room_id=$1', [
    'room',
  ]);
});

it.each([3, 4, 5, 6])('requires every player at a full %i-person table', (capacity) => {
  const room = { seats: Array.from({length: capacity}, (_, i) => `p${i}`), owner: 'p0', capacity,
    status: 'waiting' as 'waiting' | 'confirming' | 'countdown', searchUntil: 120000,
    countdownAt: null as number | null, proposed: false, ready: [] as string[],
    readyUntil: null as number | null, revision: 0, game: null, deadline: null };
  startCountdown(room, 1000);
  expect(room.status).toBe('confirming');
  expect(room.readyUntil).toBe(61000);
  room.ready = [...room.seats];
  startCountdown(room, 2000);
  expect(room.status).toBe('countdown');
  expect(room.countdownAt).toBe(5000);
});
