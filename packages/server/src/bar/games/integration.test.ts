import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  startComputer,
  actGame,
  readGame,
  queueGame,
  gameLobby,
  inviteGame,
  respondGame,
  localCards,
} from './service.js';
import { joinCardRoom } from '../durakRooms.js';
const url = process.env.BAR_GAMES_TEST_DATABASE_URL ?? process.env.TEST_DATABASE_URL;
const a = '00000000-0000-4000-8000-000000000001',
  b = '00000000-0000-4000-8000-000000000002',
  c = '00000000-0000-4000-8000-000000000003';
describe.skipIf(!url)('bar games on an isolated PostgreSQL schema', () => {
  let admin: Pool, pool: Pool;
  const schema = 'bar_games_test_' + randomUUID().replaceAll('-', '');
  beforeAll(async () => {
    admin = new Pool({ connectionString: url });
    await admin.query(`create schema ${schema}`);
    pool = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
    await pool.query(
      "create table users(id uuid primary key,display_name text,avatar_url text,last_seen_at timestamptz,account_kind text default 'player',blocked_at timestamptz)",
    );
    for (const file of ['196_online_durak.sql', '197_durak_tables.sql', '222_bar_games.sql'])
      await pool.query(
        await readFile(new URL('../../../db/migrations/' + file, import.meta.url), 'utf8'),
      );
    // Migration is intentionally repeatable.
    await pool.query(
      await readFile(
        new URL('../../../db/migrations/222_bar_games.sql', import.meta.url),
        'utf8',
      ),
    );
    for (const [id, name] of [
      [a, 'A'],
      [b, 'B'],
      [c, 'C'],
    ])
      await pool.query('insert into users(id,display_name)values($1,$2)', [id, name]);
  });
  afterAll(async () => {
    await pool?.end();
    if (admin) {
      await admin.query(`drop schema if exists ${schema} cascade`);
      await admin.end();
    }
  });
  beforeEach(async () => {
    await pool.query(
      'truncate bar_game_commands,bar_game_queue,bar_game_invites,bar_game_matches,bar_local_card_sessions,bar_card_queue,bar_card_invites,bar_card_room_players,bar_card_rooms,bar_card_matches',
    );
  });
  it('persists a character game and applies concurrent retries only once', async () => {
    const view = await startComputer(pool, a, 'daria', randomUUID());
    const first = await readGame(pool, a, view.id);
    const input = {
      requestId: randomUUID(),
      revision: first.runtime.revision,
      action: { type: 'surrender' as const },
    };
    const replies = await Promise.all([
      actGame(pool, a, view.id, input),
      actGame(pool, a, view.id, input),
    ]);
    expect(replies[0].runtime.revision).toBe(replies[1].runtime.revision);
    expect(replies[0].runtime.reason).toBe('surrender');
    const rows = await pool.query('select * from bar_game_commands');
    expect(rows.rows).toHaveLength(1);
    const replay = await startComputer(pool, a, 'daria', randomUUID(), view.id);
    expect(replay.runtime.game.turn).not.toBe(view.runtime.game.turn);
  });
  it('matches queues atomically and isolates game kinds', async () => {
    await queueGame(pool, c, 'checkers');
    await Promise.all([queueGame(pool, a, 'darts'), queueGame(pool, b, 'darts')]);
    const la = await gameLobby(pool, a),
      lb = await gameLobby(pool, b),
      lc = await gameLobby(pool, c);
    expect(la.matchId).toBeTruthy();
    expect(la.matchId).toBe(lb.matchId);
    expect(lc.matchId).toBeNull();
    expect(lc.searching).toBe('checkers');
    const rows = await pool.query('select * from bar_game_matches');
    expect(rows.rows).toHaveLength(1);
  });
  it('accepts invitations once and begins only after both ready and shared countdown', async () => {
    const invite = await inviteGame(pool, a, b, 'billiards');
    const [one, two] = await Promise.all([
      respondGame(pool, b, invite.id, 'accept'),
      respondGame(pool, b, invite.id, 'accept'),
    ]);
    expect(one.matchId).toBe(two.matchId);
    let view = await readGame(pool, a, one.matchId!);
    expect(view.ready?.players).toEqual([]);
    view = await actGame(pool, a, view.id, {
      requestId: randomUUID(),
      revision: view.runtime.revision,
      action: { type: 'ready' },
    });
    view = await actGame(pool, b, view.id, {
      requestId: randomUUID(),
      revision: view.runtime.revision,
      action: { type: 'ready' },
    });
    expect(view.ready?.startsAt).toBeGreaterThan(view.serverNow);
    await pool.query(
      "update bar_game_matches set data=jsonb_set(data,'{ready,startsAt}',to_jsonb($2::bigint))where id=$1",
      [view.id, Date.now() - 1000],
    );
    expect((await readGame(pool, a, view.id)).ready).toBeNull();
  });
  it('prevents concurrent games across new games, card rooms and local cards, then releases ended matches', async () => {
    const lease = randomUUID();
    await localCards(pool, a, lease);
    await expect(startComputer(pool, a, 'arsenich', randomUUID())).rejects.toMatchObject({
      statusCode: 409,
    });
    await localCards(pool, a, lease, true);
    const room = await joinCardRoom(pool, a, 2, false);
    expect(room).toBeTruthy();
    await expect(startComputer(pool, a, 'arsenich', randomUUID())).rejects.toMatchObject({
      statusCode: 409,
    });
    await startComputer(pool, b, 'veronika', randomUUID());
    await expect(joinCardRoom(pool, b, 2, false)).rejects.toMatchObject({ statusCode: 409 });
  });
  it('denies unrelated users, stale revisions and wrong turns without corrupting the match', async () => {
    const view = await startComputer(pool, a, 'daria', randomUUID());
    await expect(readGame(pool, b, view.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      actGame(pool, a, view.id, {
        requestId: randomUUID(),
        revision: 999,
        action: { type: 'surrender' },
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect((await readGame(pool, a, view.id)).runtime.game.winner).toBeNull();
  });
});
