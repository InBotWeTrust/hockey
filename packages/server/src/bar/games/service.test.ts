import { afterEach, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { createMatch } from '@hockey/game-core';
import { readGame, actGame } from './service.js';
afterEach(() => {
  vi.useRealTimers();
});
function fixture() {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  const row = {
    id: 'match',
    player_a: 'a',
    player_b: 'b',
    character: null,
    kind: 'darts',
    data: { runtime: createMatch('darts', 0, 1000, false, 5), ready: null },
    ended_at: null,
  };
  const receipts = new Map<string, { user_id: string; payload: string }>();
  const query = vi.fn(async (sql: string, args: unknown[] = []) => {
    if (sql.startsWith('select * from bar_game_matches where id'))
      return { rows: [structuredClone(row)] };
    if (sql.startsWith('select * from bar_game_commands'))
      return { rows: receipts.has(args[1] as string) ? [receipts.get(args[1] as string)] : [] };
    if (sql.startsWith('insert into bar_game_commands'))
      receipts.set(args[1] as string, { user_id: args[2] as string, payload: args[3] as string });
    if (sql.startsWith('update bar_game_matches set data')) {
      row.data = JSON.parse(args[1] as string);
      row.ended_at = args[2] as null;
    }
    if (sql.startsWith('select id,display_name'))
      return {
        rows: [
          { id: 'a', display_name: 'A', avatar_url: null },
          { id: 'b', display_name: 'B', avatar_url: null },
        ],
      };
    return { rows: [] };
  });
  return {
    row,
    query,
    pool: { connect: async () => ({ query, release: vi.fn() }) } as unknown as Pool,
  };
}
it('rejects nonparticipants and stale revisions without applying an action', async () => {
  const { pool, row } = fixture();
  await expect(readGame(pool, 'c', 'match')).rejects.toMatchObject({ statusCode: 404 });
  await expect(
    actGame(pool, 'b', 'match', {
      requestId: 'x',
      revision: 0,
      action: { type: 'dart', gesture: { dx: 0, dy: -0.5, durationMs: 400 } },
    }),
  ).rejects.toMatchObject({ statusCode: 409 });
  expect(row.data.runtime.game.turn).toBe(0);
});
it('applies an identical retried command once and rejects key reuse with a changed payload', async () => {
  const { pool, row } = fixture();
  const command = {
    requestId: 'x',
    revision: 0,
    action: { type: 'dart' as const, gesture: { dx: 0, dy: -0.5, durationMs: 400 } },
  };
  await actGame(pool, 'a', 'match', command);
  const revision = row.data.runtime.revision;
  await actGame(pool, 'a', 'match', command);
  expect(row.data.runtime.revision).toBe(revision);
  await expect(
    actGame(pool, 'a', 'match', { ...command, action: { type: 'surrender' } }),
  ).rejects.toMatchObject({ statusCode: 409 });
});
it('reconciles timeout before accepting a command at the deadline', async () => {
  const { pool } = fixture();
  vi.setSystemTime(41000);
  await expect(
    actGame(pool, 'a', 'match', {
      requestId: 'x',
      revision: 0,
      action: { type: 'dart', gesture: { dx: 0, dy: -0.5, durationMs: 400 } },
    }),
  ).rejects.toMatchObject({ statusCode: 409 });
});
