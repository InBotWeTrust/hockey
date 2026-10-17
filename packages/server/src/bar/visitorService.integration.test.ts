import { createMatch } from '@hockey/game-core';
import { reconcile, type MatchRow } from './games/admission.js';
import { SqlConversationStore } from './conversationStore.js';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  admitVisitorGame,
  purchaseVisitorProduct,
  reserveVisitorMessage,
  refundVisitorReceipt,
  completeVisitorMessage,
  visitorState,
  visitorAccount,
  visitorTransaction,
} from './visitorService.js';
const testUrl = process.env.TEST_DATABASE_URL;
const enabled = process.env.BAR_VISITOR_TEST_DB === 'hockey_test' || !!testUrl;
const connection = testUrl
  ? { connectionString: testUrl }
  : { host: '/tmp', database: 'hockey_test' };
const schema = `bar_visitor_${randomUUID().replaceAll('-', '')}`;
const admin = new Pool({ ...connection, max: 1 });
const pool = new Pool({
  ...connection,
  options: `-c search_path=${schema}`,
  max: 4,
});
const user = '00000000-0000-4000-8000-000000000001';
describe.skipIf(!enabled)('visitor SQL transactions in an isolated schema', () => {
  beforeAll(async () => {
    await admin.query(`create schema ${schema}`);
    await pool.query(
      `create table users(id uuid primary key,timezone text,xp integer); create table user_currency_account(user_id uuid primary key,balance integer,reserved_balance integer default 0,updated_at timestamptz); create table currency_ledger(user_id uuid,reason text,available_delta integer,reserved_delta integer,balance_after integer,reserved_after integer,metadata jsonb)`,
    );
    await pool.query(
      `create table bar_game_matches(id uuid primary key,data jsonb,ended_at timestamptz); create table bar_conversations(user_id uuid,character_id text,revision integer default 0,turns jsonb default '[]',pending_id uuid,pending_until timestamptz,primary key(user_id,character_id)); create table bar_memory_settings(user_id uuid,character_id text,enabled boolean default false,primary key(user_id,character_id)); create table bar_conflicts(user_id uuid,day date,intervening boolean,blocked_until timestamptz); create table bar_oleg_fights(id uuid,user_id uuid,status text,acknowledged boolean,created_at timestamptz)`,
    );
    await pool.query(
      await readFile(
        new URL('../../db/migrations/229_bar_visitor_card.sql', import.meta.url),
        'utf8',
      ),
    );
  });
  beforeEach(async () => {
    await pool.query(
      'truncate bar_conversations,bar_memory_settings,bar_conflicts,bar_oleg_fights,bar_visitor_receipts,bar_visitor_accounts,currency_ledger,user_currency_account,users cascade',
    );
    await pool.query("insert into users values($1,'Europe/Moscow',1000)", [user]);
    await pool.query('insert into user_currency_account(user_id,balance) values($1,100000)', [
      user,
    ]);
  });
  afterAll(async () => {
    await pool.end();
    await admin.query(`drop schema if exists ${schema} cascade`);
    await admin.end();
  });
  const state = () => visitorTransaction(pool, user, (db, now) => visitorState(db, user, now));
  const purchase = (
    id = randomUUID(),
    productId = 'visitor-card',
    currency: 'coins' | 'stars' = 'coins',
    expectedPrice = 14900,
  ) =>
    purchaseVisitorProduct(pool, user, {
      id,
      productId,
      currency,
      expectedPrice,
      expectedRevision: 1,
    });
  it('purchases once under concurrency and retains expiry when extending', async () => {
    const id = randomUUID();
    const results = await Promise.all([purchase(id), purchase(id)]);
    expect(results[0]!.card.expiresAt).toBe(results[1]!.card.expiresAt);
    expect((await pool.query('select balance from user_currency_account')).rows[0].balance).toBe(
      85100,
    );
    const renewed = await purchase();
    expect(Date.parse(renewed.card.expiresAt!) - Date.parse(results[0]!.card.expiresAt!)).toBe(
      30 * 86400000,
    );
    expect((await pool.query('select count(*)::int as n from currency_ledger')).rows[0].n).toBe(2);
  });
  it('keeps all successful messages spent today when upgrading after using paid stock', async () => {
    await state();
    await pool.query('update bar_visitor_accounts set messages_used=10');
    await purchase(randomUUID(), 'messages-10', 'stars', 20);
    for (let n = 0; n < 5; n++)
      await visitorTransaction(pool, user, async (db) => {
        const id = randomUUID();
        await reserveVisitorMessage(db, user, 'maria', id);
        await completeVisitorMessage(db, user, id);
      });
    const upgraded = await purchase();
    expect(upgraded.messages.used).toBe(15);
    expect(upgraded.messages.remaining).toBe(15);
    expect(upgraded.messages.paid).toBe(5);
  });
  it('rejects changed prices and insufficient stars without granting anything', async () => {
    await expect(purchase(randomUUID(), 'visitor-card', 'coins', 1)).rejects.toMatchObject({
      code: 'bar_price_changed',
    });
    await pool.query('update users set xp=1');
    await expect(purchase(randomUUID(), 'visitor-card', 'stars', 300)).rejects.toMatchObject({
      code: 'bar_insufficient_funds',
    });
    expect((await state()).card.purchased).toBe(false);
  });
  it('serializes the last free message and refunds failed reservations exactly once', async () => {
    await state();
    await pool.query('update bar_visitor_accounts set messages_used=9');
    const ids = [randomUUID(), randomUUID()];
    const results = await Promise.all(
      ids.map((id) =>
        visitorTransaction(pool, user, (db) => reserveVisitorMessage(db, user, 'daria', id)),
      ),
    );
    expect(results.sort()).toEqual([false, true]);
    const reserved = (await pool.query('select id from bar_visitor_receipts')).rows[0].id;
    await visitorTransaction(pool, user, async (db) => {
      await refundVisitorReceipt(db, user, reserved, 'message');
      await refundVisitorReceipt(db, user, reserved, 'message');
    });
    expect((await state()).messages.remaining).toBe(1);
  });
  it('uses paid stock after daily stock, completes once and refunds stale replies', async () => {
    await state();
    await pool.query('update bar_visitor_accounts set messages_used=10');
    await purchase(randomUUID(), 'messages-10', 'stars', 20);
    const id = randomUUID();
    await visitorTransaction(pool, user, async (db) => {
      expect(await reserveVisitorMessage(db, user, 'maria', id)).toBe(true);
      await completeVisitorMessage(db, user, id);
    });
    expect((await state()).messages.paid).toBe(9);
    await expect(
      visitorTransaction(pool, user, (db) => completeVisitorMessage(db, user, id)),
    ).rejects.toMatchObject({ code: 'conversation_stale' });
    const stale = randomUUID();
    await visitorTransaction(pool, user, (db) => reserveVisitorMessage(db, user, 'maria', stale));
    await pool.query(
      "update bar_visitor_receipts set pending_until=now()-interval '1 second' where id=$1",
      [stale],
    );
    expect((await state()).messages.paid).toBe(9);
  });
  it('counts global free games, then per-character games after upgrade without counting resumes', async () => {
    const id = randomUUID();
    await visitorTransaction(pool, user, (db, now) => admitVisitorGame(db, user, 'daria', id, now));
    await visitorTransaction(pool, user, (db, now) => admitVisitorGame(db, user, 'daria', id, now));
    expect((await state()).games.remaining).toBe(2);
    await purchase();
    expect((await state()).games.byCharacter.daria).toBe(1);
    await visitorTransaction(pool, user, (db, now) =>
      admitVisitorGame(db, user, 'daria', randomUUID(), now),
    );
    await expect(
      visitorTransaction(pool, user, (db, now) =>
        admitVisitorGame(db, user, 'daria', randomUUID(), now),
      ),
    ).rejects.toMatchObject({ code: 'bar_game_limit' });
    await visitorTransaction(pool, user, (db) => refundVisitorReceipt(db, user, id, 'game'));
    expect((await state()).games.byCharacter.daria).toBe(1);
  });
  it('returns a character game after a confirmed engine failure', async () => {
    const id = randomUUID();
    await visitorTransaction(pool, user, async (db, now) => {
      await admitVisitorGame(db, user, 'daria', id, now);
      const runtime = createMatch('darts', 0, now, true, 1);
      runtime.engineVersion = 999;
      const row: MatchRow = {
        id,
        kind: 'darts',
        player_a: user,
        player_b: null,
        character: 'daria',
        ended_at: null,
        data: { runtime, ready: null, starter: 0 },
      };
      await db.query('insert into bar_game_matches(id,data)values($1,$2)', [
        id,
        JSON.stringify(row.data),
      ]);
      const settled = await reconcile(db, row, now);
      expect(settled.data.runtime.reason).toBe('technical');
      expect(settled.ended_at).not.toBeNull();
    });
    expect((await state()).games.remaining).toBe(3);
  });
  it.each(['maria', 'daria', 'grigory', 'arsenich', 'veronika', 'oleg', 'timofey'])(
    'caps games with %s at two after buying a card',
    async (character) => {
      await purchase();
      await visitorTransaction(pool, user, (db, now) =>
        admitVisitorGame(db, user, character, randomUUID(), now),
      );
      await visitorTransaction(pool, user, (db, now) =>
        admitVisitorGame(db, user, character, randomUUID(), now),
      );
      await expect(
        visitorTransaction(pool, user, (db, now) =>
          admitVisitorGame(db, user, character, randomUUID(), now),
        ),
      ).rejects.toMatchObject({ code: 'bar_game_limit' });
    },
  );
  it('rejects replaying a finished local-card admission identifier', async () => {
    const id = randomUUID();
    await visitorTransaction(pool, user, (db, now) => admitVisitorGame(db, user, 'maria', id, now));
    await pool.query('update bar_visitor_receipts set payload=\'{"finished":true}\' where id=$1', [
      id,
    ]);
    await expect(
      visitorTransaction(pool, user, (db, now) => admitVisitorGame(db, user, 'maria', id, now)),
    ).rejects.toMatchObject({ code: 'bar_game_changed' });
  });
  it('saves the final answer with one free farewell and releases a failed answer', async () => {
    const store = new SqlConversationStore(pool);
    await state();
    await pool.query('update bar_visitor_accounts set messages_used=9');
    const id = randomUUID();
    expect((await store.reserve(user, 'daria', id, 0)).kind).toBe('reserved');
    const completed = await store.complete(user, 'daria', {
      id,
      user: 'Привет',
      assistant: 'Привет!',
      createdAt: new Date().toISOString(),
    });
    expect(completed.turns).toHaveLength(1);
    expect(completed.turns[0]?.farewell).toBeTruthy();
    expect((await store.reserve(user, 'maria', randomUUID(), 0)).kind).toBe('limit');
    await purchase(randomUUID(), 'messages-10', 'stars', 20);
    const failed = randomUUID();
    expect((await store.reserve(user, 'maria', failed, 0)).kind).toBe('reserved');
    await store.release(user, 'maria', failed);
    expect((await state()).messages.paid).toBe(10);
    expect((await store.read(user, 'maria')).turns).toHaveLength(0);
  });
  it('does not refund a completed answer on a late release and preserves paid stock across days', async () => {
    const store = new SqlConversationStore(pool);
    const id = randomUUID();
    await store.reserve(user, 'daria', id, 0);
    await store.complete(user, 'daria', {
      id,
      user: 'Привет',
      assistant: 'Привет!',
      createdAt: new Date().toISOString(),
    });
    await store.release(user, 'daria', id);
    expect((await state()).messages.remaining).toBe(9);
    await purchase(randomUUID(), 'messages-10', 'stars', 20);
    await pool.query("update bar_visitor_accounts set reset_at=now()-interval '1 second'");
    const after = await state();
    expect(after.messages.remaining).toBe(10);
    expect(after.messages.paid).toBe(10);
  });
  it('aligns the new timezone to a real midnight so the second reset cannot arrive early', async () => {
    await visitorTransaction(pool,user,async db=>{
      await visitorAccount(db,user,Date.parse('2026-10-17T12:00:00Z'));
      await db.query("update users set timezone='America/New_York'");
      const changed=await visitorAccount(db,user,Date.parse('2026-10-17T21:00:00.001Z'));
      expect(changed.resetAt).toBe('2026-10-19T04:00:00.000Z');
      await db.query('update bar_visitor_accounts set messages_used=3');
      const held=await visitorAccount(db,user,Date.parse('2026-10-18T21:00:00.001Z'));
      expect(held.messagesUsed).toBe(3);
      const next=await visitorAccount(db,user,Date.parse('2026-10-19T04:00:00.001Z'));
      expect(next.resetAt).toBe('2026-10-20T04:00:00.000Z');
    });
  });
  it('uses local midnight on a short daylight-saving day without granting an early reset for timezone changes', async () => {
    await pool.query("update users set timezone='America/New_York'");
    await visitorTransaction(pool, user, async (db) => {
      const before = await visitorAccount(db, user, Date.parse('2026-03-07T12:00:00Z'));
      expect(before.resetAt).toBe('2026-03-08T05:00:00.000Z');
      const after = await visitorAccount(db, user, Date.parse('2026-03-08T05:00:01Z'));
      expect(after.resetAt).toBe('2026-03-09T04:00:00.000Z');
    });
  });
  it('free service actions do not use quota and timezone changes cannot move the reset earlier', async () => {
    const before = await state();
    await pool.query("update users set timezone='Pacific/Kiritimati'");
    await visitorTransaction(pool, user, async (db) => {
      const id = randomUUID();
      await reserveVisitorMessage(db, user, 'oleg', id, true);
      await completeVisitorMessage(db, user, id);
    });
    const after = await state();
    expect(after.resetAt).toBe(before.resetAt);
    expect(after.messages.remaining).toBe(10);
  });
});
