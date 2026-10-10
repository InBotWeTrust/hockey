import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  cardLobby,
  queueCards,
  inviteCards,
  respondCards,
  getCardMatch,
  tickCardMatches,
} from './durakService.js';
const url = process.env.TEST_CARD_DATABASE_URL;
const suite = url ? describe : describe.skip;
suite('isolated online card service', () => {
  let pool: Pool;
  let a: string, b: string, c: string;
  const schema = `durak_${Date.now()}`;
  beforeAll(async () => {
    const parsed = new URL(url!);
    if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) || parsed.pathname !== '/durak_test')
      throw new Error('Requires dedicated local durak_test database');
    const setup = new Pool({ connectionString: url });
    await setup.query(`create schema ${schema}`);
    await setup.end();
    pool = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
    await pool.query(
      "create table users(id uuid primary key,display_name text,avatar_url text,account_kind text default 'player',blocked_at timestamptz)",
    );
    await pool.query(
      await readFile(
        new URL('../../db/migrations/196_online_durak.sql', import.meta.url),
        'utf8',
      ).catch(() =>
        readFile(new URL('../../../db/migrations/196_online_durak.sql', import.meta.url), 'utf8'),
      ),
    );
    [a, b, c] = [randomUUID(), randomUUID(), randomUUID()];
    for (const id of [a, b, c])
      await pool.query('insert into users(id,display_name) values($1,$2)', [id, id]);
  });
  afterAll(async () => {
    if (!pool) return;
    await pool.query(`drop schema ${schema} cascade`);
    await pool.end();
  });
  it('allows only one pending waiting state per player', async () => {
    const invitation = await inviteCards(pool, a, b);
    await expect(inviteCards(pool, c, b)).rejects.toMatchObject({ statusCode: 409 });
    await expect(queueCards(pool, b)).rejects.toMatchObject({ statusCode: 409 });
    await expect(inviteCards(pool, b, c)).rejects.toMatchObject({ statusCode: 409 });
    await respondCards(pool, b, invitation.id, 'decline');
    await queueCards(pool, b);
    await expect(inviteCards(pool, a, b)).rejects.toMatchObject({ statusCode: 409 });
    await queueCards(pool, b, true);
  });
  it('matches concurrent search once, hides cards and rejects strangers', async () => {
    await Promise.all([queueCards(pool, a), queueCards(pool, b)]);
    const first = await cardLobby(pool, a);
    const second = await cardLobby(pool, b);
    expect(first.matchId).toBe(second.matchId);
    expect(first.matchId).not.toBeNull();
    const view = await getCardMatch(pool, a, first.matchId!);
    expect(view.hand).toHaveLength(6);
    expect(view.opponentCount).toBe(6);
    expect(view).not.toHaveProperty('state');
    expect(view).not.toHaveProperty('deck');
    await expect(getCardMatch(pool, c, first.matchId!)).rejects.toMatchObject({ statusCode: 404 });
    await getCardMatch(pool, a, first.matchId!, { revision: view.revision, action: 'surrender' });
  });
  it('invitation accept is idempotent and foreign users cannot respond', async () => {
    const invitation = await inviteCards(pool, a, b);
    expect((await inviteCards(pool, a, b)).id).toBe(invitation.id);
    await expect(respondCards(pool, c, invitation.id, 'accept')).rejects.toMatchObject({
      statusCode: 404,
    });
    const results = await Promise.all([
      respondCards(pool, b, invitation.id, 'accept'),
      respondCards(pool, b, invitation.id, 'accept'),
    ]);
    expect(results[0]!.matchId).toBe(results[1]!.matchId);
    const id = results[0]!.matchId!;
    const view = await getCardMatch(pool, a, id);
    const attacker = view.attacker === 0 ? a : b;
    const own = await getCardMatch(pool, attacker, id);
    const command = {
      revision: own.revision,
      action: { type: 'play' as const, cardId: own.hand[0]!.id },
    };
    const one = await getCardMatch(pool, attacker, id, command);
    const retry = await getCardMatch(pool, attacker, id, command);
    expect(retry.revision).toBe(one.revision);
    expect(retry.table).toHaveLength(1);
    await expect(
      getCardMatch(pool, attacker, id, {
        revision: retry.revision,
        action: { type: 'play', cardId: 'not-owned' },
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await pool.query(
      "update bar_card_matches set deadline_at=now()-interval '21 seconds' where id=$1",
      [id],
    );
    await tickCardMatches(pool);
    expect((await getCardMatch(pool, a, id)).revision).toBeGreaterThan(retry.revision);
    const latest = await getCardMatch(pool, a, id);
    await getCardMatch(pool, a, id, { revision: latest.revision, action: 'surrender' });
  });
  it('expires invites and queue, and cancel is idempotent', async () => {
    const invitation = await inviteCards(pool, a, b);
    await pool.query(
      "update bar_card_invites set expires_at=now()-interval '1 second' where id=$1",
      [invitation.id],
    );
    await expect(respondCards(pool, b, invitation.id, 'accept')).rejects.toMatchObject({
      statusCode: 409,
    });
    await queueCards(pool, c);
    await queueCards(pool, c, true);
    await queueCards(pool, c, true);
    expect((await cardLobby(pool, c)).searching).toBe(false);
    await queueCards(pool, c);
    await pool.query("update bar_card_queue set expires_at=now()-interval '1 second'");
    expect((await cardLobby(pool, c)).searching).toBe(false);
  });
});
