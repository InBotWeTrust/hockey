import { expect, it, vi } from 'vitest';
import { drainFightOutbox } from '../../src/duel/amateur/fight/outbox.js';
import type { FastifyInstance } from 'fastify';

it('coalesces each match and only marks the selected rows after successful publication', async () => {
  const rows = [
    { id: '1', match_id: 'a', revision: '2' },
    { id: '2', match_id: 'b', revision: '8' },
    { id: '3', match_id: 'a', revision: '3' },
  ];
  const query = vi.fn(async (sql: string) => ({ rows: sql.startsWith('select') ? rows : [] }));
  const publish = vi.fn(async () => {});
  await drainFightOutbox({
    pg: { query },
    realtime: { publish },
    log: { warn: vi.fn() },
  } as unknown as FastifyInstance);
  expect(publish.mock.calls).toEqual([
    ['duel:fight:a', { type: 'duel:fight_update', matchId: 'a', revision: 3 }],
    ['duel:fight:b', { type: 'duel:fight_update', matchId: 'b', revision: 8 }],
  ]);
  expect(query.mock.calls.filter(([sql]) => sql.startsWith('update'))).toHaveLength(2);
  const updates = query.mock.calls as unknown as Array<[string, unknown[]]>;
  expect(updates.filter(([sql]) => sql.startsWith('update')).map(([, args]) => args[0])).toEqual([
    ['1', '3'],
    ['2'],
  ]);
});
it('retains a failed match for retry and still publishes another match', async () => {
  const query = vi.fn(async (sql: string) => ({
    rows: sql.startsWith('select')
      ? [
          { id: '1', match_id: 'a', revision: '1' },
          { id: '2', match_id: 'b', revision: '2' },
        ]
      : [],
  }));
  const publish = vi.fn(async (channel: string) => {
    if (channel.endsWith(':a')) throw Error('unavailable');
  });
  await drainFightOutbox({
    pg: { query },
    realtime: { publish },
    log: { warn: vi.fn() },
  } as unknown as FastifyInstance);
  expect(publish).toHaveBeenCalledTimes(2);
  const updates = query.mock.calls as unknown as Array<[string, unknown[]]>;
  expect(updates.filter(([sql]) => sql.startsWith('update')).map(([, args]) => args[0])).toEqual([
    ['2'],
  ]);
});
