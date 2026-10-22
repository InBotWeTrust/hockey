import { installBarInviteSchema } from './inviteChatTestSchema.js';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { joinCardRoom, readCardRoom, commandCardRoom, inviteToRoom, inviteCardsFromProfile } from './durakRooms.js';
import { inviteCards, respondCards } from './durakService.js';
const url = process.env.TEST_CARD_DATABASE_URL;
(url ? describe : describe.skip)('isolated card rooms', () => {
  let pool: Pool;
  const users = Array.from({ length: 8 }, () => randomUUID());
  const schema = `rooms_${Date.now()}`;
  beforeAll(async () => {
    const parsed = new URL(url!);
    if (parsed.hostname !== '127.0.0.1' || parsed.pathname !== '/durak_test')
      throw new Error('Dedicated DB required');
    const setup = new Pool({ connectionString: url });
    await setup.query(`create schema ${schema}`);
    await setup.end();
    pool = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
    await pool.query(
      "create table users(id uuid primary key,display_name text,avatar_url text,account_kind text default 'player',blocked_at timestamptz)",
    );
    for (const file of ['196_online_durak.sql', '197_durak_tables.sql'])
      await pool.query(
        await readFile(new URL(`../../db/migrations/${file}`, import.meta.url), 'utf8'),
      );
    await pool.query(
      await readFile(new URL('../../db/migrations/197_durak_tables.sql', import.meta.url), 'utf8'),
    );
    await installBarInviteSchema(pool);
    for (const id of users)
      await pool.query('insert into users(id,display_name) values($1,$2)', [id, id]);
  });
  afterAll(async () => {
    if (pool) {
      await pool.query(`drop schema ${schema} cascade`);
      await pool.end();
    }
  });
  afterEach(async () => {
    await pool.query('truncate messages,chat_members,chats cascade');
    await pool.query(
      'truncate bar_card_invites,bar_card_room_players,bar_card_rooms,bar_card_queue,bar_card_matches',
    );
  });
  it('groups only the same format, fixes deadline and allows free departure', async () => {
    const a = await joinCardRoom(pool, users[0]!, 5);
    const b = await joinCardRoom(pool, users[1]!, 5);
    const c = await joinCardRoom(pool, users[2]!, 3);
    expect(b.roomId).toBe(a.roomId);
    expect(c.roomId).not.toBe(a.roomId);
    const room = await readCardRoom(pool, users[0]!, a.roomId);
    expect(room.seats).toHaveLength(2);
    expect(room.searchUntil!-room.serverNow).toBeGreaterThan(119000);
    expect(room.searchUntil!-room.serverNow).toBeLessThanOrEqual(120000);
    expect((await joinCardRoom(pool, users[0]!, 5)).roomId).toBe(a.roomId);
    expect((await readCardRoom(pool, users[0]!, a.roomId)).searchUntil).toBe(room.searchUntil);
    await expect(inviteCards(pool, users[3]!, users[0]!)).rejects.toMatchObject({
      statusCode: 409,
    });
    await commandCardRoom(pool, users[0]!, a.roomId, room.revision, { type: 'leave' });
    expect((await readCardRoom(pool, users[1]!, a.roomId)).owner).toBe(users[1]);
    const other = await readCardRoom(pool, users[2]!, c.roomId);
    await commandCardRoom(pool, users[2]!, c.roomId, other.revision, { type: 'leave' });
  });
  it('matches any selected format and fixes the first compatible table', async () => {
    const four = await joinCardRoom(pool, users[0]!, 4);
    const flexible = await joinCardRoom(pool, users[1]!, [2, 4, 6]);
    expect(flexible.roomId).toBe(four.roomId);
    expect((await readCardRoom(pool, users[1]!, four.roomId)).capacity).toBe(4);
    const other = await joinCardRoom(pool, users[2]!, [2, 6]);
    expect(other.roomId).not.toBe(four.roomId);
    const deadline = (await readCardRoom(pool, users[2]!, other.roomId)).searchUntil;
    const two = await joinCardRoom(pool, users[3]!, 2);
    expect(two.roomId).toBe(other.roomId);
    const ready = await readCardRoom(pool, users[2]!, other.roomId);
    expect(ready.capacity).toBe(2);
    expect(ready.status).toBe('confirming');
    expect(deadline).toBeGreaterThan(ready.serverNow);
    await expect(joinCardRoom(pool, users[4]!, [])).rejects.toMatchObject({ statusCode: 400 });
  });
  it('merges flexible searches but keeps the capacity promised by an invitation', async () => {
    const first = (await joinCardRoom(pool, users[0]!, [2, 4])).roomId;
    let room = await readCardRoom(pool, users[0]!, first);
    await commandCardRoom(pool, users[0]!, first, room.revision, { type: 'pause' });
    const second = (await joinCardRoom(pool, users[1]!, [2, 6])).roomId;
    room = await readCardRoom(pool, users[0]!, first);
    await commandCardRoom(pool, users[0]!, first, room.revision, { type: 'renew' });
    const merged = await readCardRoom(pool, users[1]!, second);
    expect(merged.id).toBe(first);
    expect(merged.capacity).toBe(2);
    expect(merged.status).toBe('confirming');
    const reserved = (await joinCardRoom(pool, users[2]!, [2, 6])).roomId;
    await inviteToRoom(pool, users[2]!, reserved, users[3]!);
    expect((await readCardRoom(pool, users[2]!, reserved)).formats).toEqual([6]);
    expect((await joinCardRoom(pool, users[4]!, 2)).roomId).not.toBe(reserved);
  });
  it('requires unanimous smaller-game consent and cancels countdown on departure', async () => {
    const roomId = (await joinCardRoom(pool, users[3]!, 5)).roomId;
    await joinCardRoom(pool, users[4]!, 5);
    await pool.query(
      "update bar_card_rooms set data=jsonb_set(data,'{searchUntil}','0') where id=$1",
      [roomId],
    );
    let room = await readCardRoom(pool, users[3]!, roomId);
    room = await commandCardRoom(pool, users[3]!, roomId, room.revision, { type: 'propose' });
    expect(room.status).toBe('confirming');
    room = await commandCardRoom(pool, users[4]!, roomId, room.revision, { type: 'ready' });
    expect(room.status).toBe('countdown');
    expect(room.countdownAt! - room.serverNow).toBeLessThanOrEqual(5000);
    await commandCardRoom(pool, users[4]!, roomId, room.revision, { type: 'leave' });
    room = await readCardRoom(pool, users[3]!, roomId);
    expect(room.status).toBe('ended');
    expect(room.countdownAt).toBeNull();
    await commandCardRoom(pool, users[3]!, roomId, room.revision, { type: 'leave' });
  });
  it('starts once under concurrent joins, hides hands and rejects strangers', async () => {
    const results = await Promise.all([
      joinCardRoom(pool, users[5]!, 2),
      joinCardRoom(pool, users[6]!, 2),
    ]);
    expect(results[0]!.roomId).toBe(results[1]!.roomId);
    const id = results[0]!.roomId;
    let ready = await readCardRoom(pool, users[5]!, id);
    ready = await commandCardRoom(pool, users[5]!, id, ready.revision, { type: 'ready' });
    await commandCardRoom(pool, users[6]!, id, ready.revision, { type: 'ready' });
    await pool.query(
      "update bar_card_rooms set data=jsonb_set(data,'{countdownAt}',to_jsonb($2::bigint)) where id=$1",
      [id, Date.now() - 1],
    );
    const room = await readCardRoom(pool, users[5]!, id);
    expect(room.status).toBe('playing');
    expect(room.game!.hand).toHaveLength(6);
    expect(room.game).not.toHaveProperty('hands');
    expect(room.game).not.toHaveProperty('deck');
    await expect(readCardRoom(pool, users[7]!, id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(joinCardRoom(pool, users[5]!, 3)).rejects.toMatchObject({ statusCode: 409 });
    const ended = await commandCardRoom(pool, users[5]!, id, room.revision, { type: 'leave' });
    expect(ended.status).toBe('ended');
  });
  it('room invitations reuse notification responses and reserve available seats', async () => {
    const id = (await joinCardRoom(pool, users[5]!, 3, false)).roomId;
    const invite = await inviteToRoom(pool, users[5]!, id, users[6]!);
    const deadline=(await pool.query('select expires_at from bar_card_invites where id=$1',[invite.id])).rows[0].expires_at;
    const snapshot=await readCardRoom(pool,users[5]!,id);
    expect(deadline.getTime()-snapshot.serverNow).toBeGreaterThan(299000);
    expect(deadline.getTime()-snapshot.serverNow).toBeLessThanOrEqual(300000);
    const result = await respondCards(pool, users[6]!, invite.id, 'accept');
    expect(result.roomId).toBe(id);
    expect((await respondCards(pool, users[6]!, invite.id, 'accept')).roomId).toBe(id);
    expect((await readCardRoom(pool, users[5]!, id)).seats).toHaveLength(2);
  });
  it('merges separately created searching tables and redirects existing members', async () => {
    const a = (await joinCardRoom(pool, users[0]!, 3, false)).roomId;
    const b = (await joinCardRoom(pool, users[1]!, 3, false)).roomId;
    let room = await readCardRoom(pool, users[0]!, a);
    await commandCardRoom(pool, users[0]!, a, room.revision, { type: 'renew' });
    room = await readCardRoom(pool, users[1]!, b);
    await commandCardRoom(pool, users[1]!, b, room.revision, { type: 'renew' });
    const latest = await readCardRoom(pool, users[1]!, b);
    expect(latest.id).toBe(a);
    expect(latest.seats).toHaveLength(2);
    expect((await joinCardRoom(pool, users[2]!, 3)).roomId).toBe(a);
    expect((await readCardRoom(pool, users[0]!, a)).status).toBe('confirming');
  });
  it('guards ownership, rejects illegal moves and makes stale retries harmless', async () => {
    const id = (await joinCardRoom(pool, users[0]!, 2)).roomId;
    await joinCardRoom(pool, users[1]!, 2);
    let readiness = await readCardRoom(pool, users[0]!, id);
    readiness = await commandCardRoom(pool, users[0]!, id, readiness.revision, { type: 'ready' });
    await commandCardRoom(pool, users[1]!, id, readiness.revision, { type: 'ready' });
    await pool.query(
      "update bar_card_rooms set data=jsonb_set(data,'{countdownAt}',to_jsonb($2::bigint)) where id=$1",
      [id, Date.now() - 1],
    );
    const room = await readCardRoom(pool, users[0]!, id);
    await expect(
      commandCardRoom(pool, users[0]!, id, room.revision, {
        type: 'move',
        action: { type: 'play', cardId: 'foreign' },
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    const actor = users[room.game!.turn]!;
    const own = await readCardRoom(pool, actor, id);
    const command = {
      type: 'move' as const,
      action: own.game!.actions.find((a) => a.type === 'play')!,
    };
    const next = await commandCardRoom(pool, actor, id, own.revision, command);
    const retry = await commandCardRoom(pool, actor, id, own.revision, command);
    expect(retry.revision).toBe(next.revision);
    expect(retry.game!.table).toHaveLength(1);
    expect(retry.game!.deadline).toBe(next.game!.deadline);
    const third = (await joinCardRoom(pool, users[2]!, 3, false)).roomId;
    await expect(inviteToRoom(pool, users[3]!, third, users[4]!)).rejects.toMatchObject({
      statusCode: 403,
    });
    await expect(inviteToRoom(pool, users[2]!, third, actor)).rejects.toMatchObject({
      statusCode: 409,
    });
  });
  it('fills six seats exactly once under simultaneous admission', async () => {
    const results = await Promise.all(users.slice(0, 6).map((user) => joinCardRoom(pool, user, 6)));
    expect(new Set(results.map((r) => r.roomId)).size).toBe(1);
    let room = await readCardRoom(pool, users[0]!, results[0]!.roomId);
    expect(room.status).toBe('confirming');
    for(const user of users.slice(0,6)) room=await commandCardRoom(pool,user,room.id,room.revision,{type:'ready'});
    expect(room.status).toBe('countdown');
    expect(room.seats).toHaveLength(6);
    expect(new Set(room.seats.map((s) => s.userId)).size).toBe(6);
    const overflow = await joinCardRoom(pool, users[6]!, 6);
    expect(overflow.roomId).not.toBe(room.id);
  });
  it('invites each participant to a private table from the profile without duplicate messages', async () => {
    const [owner,one,two,stranger]=users as [string,string,string,string,...string[]];
    const invitation=await inviteCardsFromProfile(pool,owner,one,4);
    expect((await inviteCardsFromProfile(pool,owner,one,4)).id).toBe(invitation.id);
    await inviteToRoom(pool,owner,invitation.roomId,two);
    const cards=(await pool.query("select metadata from messages where metadata->>'type'='bar_game_invite' and metadata->>'status'='pending'")).rows;
    expect(cards).toHaveLength(2);
    expect(cards.every(r=>r.metadata.capacity===4 && r.metadata.roomId===invitation.roomId)).toBe(true);
    await expect(respondCards(pool,stranger,invitation.id,'accept')).rejects.toMatchObject({statusCode:404});
    await Promise.all([respondCards(pool,one,invitation.id,'accept'),respondCards(pool,one,invitation.id,'accept')]);
    expect((await pool.query("select metadata from messages where metadata->>'inviteId'=$1 and metadata->>'type'='bar_game_invite_status'",[invitation.id])).rows).toHaveLength(1);
  });
  it('rolls back the private table when the invited profile does not exist', async () => {
    const before=await pool.query('select id from bar_card_rooms');
    await expect(inviteCardsFromProfile(pool,users[0]!,randomUUID(),6)).rejects.toMatchObject({statusCode:404});
    expect((await pool.query('select id from bar_card_rooms')).rows).toEqual(before.rows);
  });

  it('preserves multiple sizes selected in a profile invitation', async () => {
    const first=await inviteCardsFromProfile(pool,users[0]!,users[1]!,[2,4,6]);
    const room=await readCardRoom(pool,users[0]!,first.roomId);
    expect(room.formats).toEqual([2,4,6]);
    const message=(await pool.query("select metadata from messages where metadata->>'inviteId'=$1",[first.id])).rows[0];
    expect(message.metadata.capacities).toEqual([2,4,6]);
    expect((await inviteCardsFromProfile(pool,users[0]!,users[1]!,[2,4,6])).id).toBe(first.id);
    expect((await pool.query('select id from messages')).rows).toHaveLength(1);
    await inviteToRoom(pool,users[0]!,first.roomId,users[2]!);
    expect((await readCardRoom(pool,users[0]!,first.roomId)).formats).toEqual([2,4,6]);
  });

});
