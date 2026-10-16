import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  tickGames,
  startComputer,
  actGame,
  readGame,
  queueGame,
  gameLobby,
  inviteGame,
  respondGame,
  localCards,
  proposeOchkoStake,
  startOchkoStake,
} from './service.js';
import { barOchko } from '@hockey/game-core';
import {settleOchko} from './ochkoEconomy.js';
import * as ochkoDeck from './ochkoDeck.js';
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
      "create table users(id uuid primary key,display_name text,avatar_url text,last_seen_at timestamptz,xp int not null default 100,experience int default 0,coins int default 0,account_kind text default 'player',blocked_at timestamptz)",
    );
    await pool.query(`create table user_currency_account(user_id uuid primary key references users(id), balance int not null default 0, reserved_balance int not null default 0);
      create table currency_ledger(id bigserial primary key,user_id uuid not null references users(id),reason text not null,available_delta int not null,reserved_delta int not null,balance_after int not null,reserved_after int not null,metadata jsonb not null default '{}',created_at timestamptz not null default now());`);
    for (const file of [
      '196_online_durak.sql',
      '197_durak_tables.sql',
      '222_bar_games.sql',
      '223_bar_games_daria.sql',
      '224_bar_ochko.sql',
      '225_bar_armwrestling.sql',
      '226_bar_ochko_history.sql',
    ])
      await pool.query(
        await readFile(new URL('../../../db/migrations/' + file, import.meta.url), 'utf8'),
      );
    // Reapply current migrations to prove their idempotence without restoring old constraints.
    for (const file of ['224_bar_ochko.sql', '225_bar_armwrestling.sql', '226_bar_ochko_history.sql'])
      await pool.query(
        await readFile(new URL('../../../db/migrations/' + file, import.meta.url), 'utf8'),
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
    vi.restoreAllMocks();
    vi.spyOn(ochkoDeck, 'createPrivateOchko').mockImplementation((now) =>
      barOchko.createOchko(1, now),
    );
    await pool.query('update users set xp=100');
    await pool.query(
      'truncate currency_ledger,bar_game_stakes,bar_ochko_offers,bar_game_commands,bar_game_queue,bar_game_invites,bar_game_matches,bar_local_card_sessions,bar_card_queue,bar_card_invites,bar_card_room_players,bar_card_rooms,bar_card_matches',
    );
  });
  it('schedules character arm matches and replays three seconds ahead', async () => {
    const before=Date.now();
    const match=await startComputer(pool,a,'oleg',randomUUID());
    expect(match.runtime.game.kind).toBe('armwrestling');
    if(match.runtime.game.kind!=='armwrestling')throw Error('Expected arm');
    expect(match.runtime.game.startedAt).toBeGreaterThanOrEqual(before+3000);
    expect(match.runtime.game.endsAt-match.runtime.game.startedAt).toBe(60000);
    const clock=vi.spyOn(Date,'now').mockReturnValue(match.runtime.game.startedAt-1);
    try {
      const waiting=await readGame(pool,a,match.id);
      if(waiting.runtime.game.kind!=='armwrestling')throw Error('Expected arm');
      expect(waiting.runtime.game.progress).toBe(0);
      expect(waiting.runtime.game.stamina).toEqual([1,1]);
      await actGame(pool,a,match.id,{requestId:randomUUID(),revision:waiting.runtime.revision,action:{type:'surrender'}});
      const replay=await startComputer(pool,a,'oleg',randomUUID(),match.id);
      if(replay.runtime.game.kind!=='armwrestling')throw Error('Expected arm');
      expect(replay.runtime.game.startedAt).toBe(Date.now()+3000);
    }finally{clock.mockRestore();}
  });
  it('shares one rotated 501 board between online participants and retries', async () => {
    await queueGame(pool,a,'darts');await queueGame(pool,b,'darts');
    const id=(await gameLobby(pool,a)).matchId!;
    for(const user of [a,b]){
      const view=await readGame(pool,user,id);
      await actGame(pool,user,id,{requestId:randomUUID(),revision:view.runtime.revision,action:{type:'ready'}});
    }
    const stored=(await pool.query('select data from bar_game_matches where id=$1',[id])).rows[0].data;
    let time=stored.ready.startsAt+1;
    const clock=vi.spyOn(Date,'now').mockImplementation(()=>time);
    try {
      let view=await readGame(pool,a,id);
      if(view.runtime.game.kind!=='darts')throw Error('Expected darts');
      expect(view.runtime.game.scores).toEqual([501,501]);
      const actor=view.runtime.game.turn===view.player?a:b;
      for(let i=0;i<3;i++){
        view=await readGame(pool,actor,id);
        const input={requestId:randomUUID(),revision:view.runtime.revision,action:{type:'dart' as const,gesture:{dx:0,dy:-.5,durationMs:400}}};
        const thrown=await actGame(pool,actor,id,input);
        if(i===2){
          const retry=await actGame(pool,actor,id,input);
          const opponent=await readGame(pool,actor===a?b:a,id);
          expect(thrown.runtime.dartRotation).toBeDefined();
          expect(retry.runtime.dartRotation).toEqual(thrown.runtime.dartRotation);
          expect(opponent.runtime.dartRotation).toEqual(thrown.runtime.dartRotation);
          expect(opponent.runtime.game).toEqual(thrown.runtime.game);
        }
        time=thrown.runtime.animationUntil+1;
      }
    }finally{clock.mockRestore();}
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
  it('finishes new character games through scheduled ticks without client reads', async () => {
    const offer = await proposeOchkoStake(pool, a);
    const paid = await startOchkoStake(pool, a, {
      requestId: randomUUID(),
      offerId: offer.offerId,
      stars: 20,
    });
    const arm = await startComputer(pool, b, 'oleg', randomUUID());
    const deadlines = await pool.query(
      "select data->'runtime'->>'deadline' as deadline from bar_game_matches where id=any($1::uuid[])",
      [[paid.id, arm.id]],
    );
    expect(
      deadlines.rows.every((row) => Number.isFinite(Number(row.deadline)) && row.deadline !== null),
    ).toBe(true);
    const future = Date.now() + 70000;
    const clock = vi.spyOn(Date, 'now').mockReturnValue(future);
    try {
      await tickGames(pool);
      const ended = await pool.query(
        'select ended_at from bar_game_matches where id=any($1::uuid[])',
        [[paid.id, arm.id]],
      );
      expect(ended.rows.every((row) => row.ended_at !== null)).toBe(true);
      const stake = (
        await pool.query('select payout from bar_game_stakes where match_id=$1', [paid.id])
      ).rows[0];
      expect(stake.payout).not.toBeNull();
      const balance = Number(
        (await pool.query('select xp from users where id=$1', [a])).rows[0].xp,
      );
      expect(balance).toBe(80 + Number(stake.payout));
      await tickGames(pool);
      expect(Number((await pool.query('select xp from users where id=$1', [a])).rows[0].xp)).toBe(
        balance,
      );
    } finally {
      clock.mockRestore();
    }
  });
  it('creates a paid game once under concurrent retries and never pays twice', async () => {
    const offer = await proposeOchkoStake(pool, a),
      requestId = randomUUID();
    expect(offer.stars).toBeLessThanOrEqual(30);
    const input = { requestId, offerId: offer.offerId, stars: 50 };
    const [one, two] = await Promise.all([
      startOchkoStake(pool, a, input),
      startOchkoStake(pool, a, input),
    ]);
    expect(one.id).toBe(two.id);
    const debits = await pool.query("select reason,metadata from currency_ledger where metadata->>'bar_game_match_id'=$1",[one.id]);
    expect(debits.rows).toHaveLength(1);
    expect(debits.rows[0]).toMatchObject({reason:'bar_ochko_stake',metadata:{stars:-50}});

    expect(Number((await pool.query('select xp from users where id=$1', [a])).rows[0].xp)).toBe(50);
    expect('deck' in one.runtime.game).toBe(false);
    expect(one.runtime.seed).toBe(0);
    // Force an unfinished fair test hand without changing balances or marking the row ended.
    const raw = (await pool.query('select data from bar_game_matches where id=$1', [one.id]))
      .rows[0].data;
    Object.assign(raw.runtime.game, {
      hands: [
        [0, 4],
        [1, 5],
      ],
      scores: [13, 13],
      done: [false, true],
      golden: [false, false],
      deck: [8, 9],
      dealUntil: [0, 0],
      actionSeq: [0, 0],
    });
    await pool.query('update bar_game_matches set data=$2 where id=$1', [one.id, raw]);
    const command = {
      requestId: randomUUID(),
      revision: raw.runtime.revision,
      action: { type: 'ochko-stand' as const, seq: 1 },
    };
    await actGame(pool, a, one.id, command);
    await actGame(pool, a, one.id, command);
    await readGame(pool, a, one.id);
    expect(Number((await pool.query('select xp from users where id=$1', [a])).rows[0].xp)).toBe(
      100,
    );
    expect(
      (await pool.query('select * from bar_game_stakes where match_id=$1', [one.id])).rows,
    ).toHaveLength(1);
  });
  it.each([[0,40,'bar_ochko_payout'],['draw',20,'bar_ochko_refund'],[1,0,null]] as const)('records settlement %s in the bank exactly once', async(winner,payout,reason)=>{
    const offer=await proposeOchkoStake(pool,a);
    const match=await startOchkoStake(pool,a,{requestId:randomUUID(),offerId:offer.offerId,stars:20});
    const row=(await pool.query('select * from bar_game_matches where id=$1',[match.id])).rows[0];
    row.data.runtime.game.winner=winner;
    const client=await pool.connect();
    try {
      await client.query('begin');
      await settleOchko(client,row,Date.now());
      await settleOchko(client,row,Date.now());
      await client.query('commit');
    }catch(e){await client.query('rollback');throw e;}finally{client.release();}
    const entries=(await pool.query("select reason,metadata from currency_ledger where metadata->>'bar_game_match_id'=$1 order by id",[match.id])).rows;
    expect(entries).toHaveLength(payout?2:1);
    expect(entries[0]).toMatchObject({reason:'bar_ochko_stake',metadata:{stars:-20}});
    if(payout)expect(entries[1]).toMatchObject({reason,metadata:{stars:payout}});
  });
  it('rolls back match creation if a wager exceeds the new balance', async () => {
    const offer = await proposeOchkoStake(pool, a);
    await pool.query('update users set xp=5 where id=$1', [a]);
    await expect(
      startOchkoStake(pool, a, { requestId: randomUUID(), offerId: offer.offerId, stars: 20 }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(
      (await pool.query('select id from bar_game_matches where player_a=$1', [a])).rows,
    ).toHaveLength(0);
    expect(Number((await pool.query('select xp from users where id=$1', [a])).rows[0].xp)).toBe(5);
  });

  it('starts both new online games through the existing ready countdown and preserves independent actions', async () => {
    for (const kind of ['ochko', 'armwrestling'] as const) {
      await queueGame(pool, a, kind);
      await queueGame(pool, b, kind);
      const lobby = await gameLobby(pool, a);
      let v = await readGame(pool, a, lobby.matchId!);
      v = await actGame(pool, a, v.id, {
        requestId: randomUUID(),
        revision: v.runtime.revision,
        action: { type: 'ready' },
      });
      v = await actGame(pool, b, v.id, {
        requestId: randomUUID(),
        revision: v.runtime.revision,
        action: { type: 'ready' },
      });
      expect(v.ready?.startsAt).toBeGreaterThanOrEqual(v.serverNow + 4990);
      const data = (await pool.query('select data from bar_game_matches where id=$1', [v.id]))
        .rows[0].data;
      data.ready.startsAt = Date.now() - 800;
      await pool.query('update bar_game_matches set data=$2 where id=$1', [v.id, data]);
      v = await readGame(pool, a, v.id);
      expect(v.ready).toBeNull();
      if (kind === 'ochko') {
        expect('deck' in v.runtime.game).toBe(false);
        const other = await readGame(pool, b, v.id);
        if (other.runtime.game.kind === 'ochko')
          expect(other.runtime.game.hands[0].every((c) => c === -1)).toBe(true);
      } else {
        const action = {
          type: 'arm-input' as const,
          seq: 1,
          supportHeld: true,
          support: 0.6,
          pressing: true,
          wrist: 'straight' as const,
        };
        await Promise.all([
          actGame(pool, a, v.id, { requestId: randomUUID(), revision: v.runtime.revision, action }),
          actGame(pool, b, v.id, { requestId: randomUUID(), revision: v.runtime.revision, action }),
        ]);
        const current = await readGame(pool, a, v.id);
        if (current.runtime.game.kind === 'armwrestling')
          expect(current.runtime.game.lastSeq).toEqual([1, 1]);
      }
      const latest = await readGame(pool, a, v.id);
      await actGame(pool, a, v.id, {
        requestId: randomUUID(),
        revision: latest.runtime.revision,
        action: { type: 'surrender' },
      });
      expect((await gameLobby(pool, a)).matchId).toBeNull();
    }
  });
  it('pays wins, losses and technical refunds exactly once inside terminal persistence', async () => {
    const { persist } = await import('./admission.js');
    for (const outcome of [0, 1, 'technical'] as const) {
      await pool.query('update users set xp=100 where id=$1', [a]);
      const offer = await proposeOchkoStake(pool, a);
      const v = await startOchkoStake(pool, a, {
        requestId: randomUUID(),
        offerId: offer.offerId,
        stars: 20,
      });
      const row = (await pool.query('select * from bar_game_matches where id=$1', [v.id])).rows[0];
      row.data.runtime.game.winner = outcome === 'technical' ? 'draw' : outcome;
      row.data.runtime.reason = outcome === 'technical' ? 'technical' : 'played';
      const client = await pool.connect();
      try {
        await client.query('begin');
        await persist(client, row, Date.now());
        await persist(client, row, Date.now());
        await client.query('commit');
      } finally {
        client.release();
      }
      expect(Number((await pool.query('select xp from users where id=$1', [a])).rows[0].xp)).toBe(
        outcome === 0 ? 120 : outcome === 1 ? 80 : 100,
      );
    }
  });
  it('refunds an unsupported paid match exactly once after reconciliation', async () => {
    const offer = await proposeOchkoStake(pool, a);
    const v = await startOchkoStake(pool, a, {
      requestId: randomUUID(),
      offerId: offer.offerId,
      stars: 20,
    });
    const data = (await pool.query('select data from bar_game_matches where id=$1', [v.id])).rows[0]
      .data;
    data.runtime.engineVersion = 999;
    await pool.query('update bar_game_matches set data=$2 where id=$1', [v.id, data]);
    const ended = await readGame(pool, a, v.id);
    await readGame(pool, a, v.id);
    expect(ended.runtime.reason).toBe('technical');
    expect(ended.stake?.payout).toBe(20);
    expect(Number((await pool.query('select xp from users where id=$1', [a])).rows[0].xp)).toBe(
      100,
    );
  });
  it('rejects oversized or impossible wallet-capacity bets before creating a match', async () => {
    const offer = await proposeOchkoStake(pool, a);
    await expect(
      startOchkoStake(pool, a, {
        requestId: randomUUID(),
        offerId: offer.offerId,
        stars: Number.MAX_SAFE_INTEGER,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    await pool.query('update users set xp=2000000000 where id=$1', [a]);
    await expect(
      startOchkoStake(pool, a, {
        requestId: randomUUID(),
        offerId: offer.offerId,
        stars: 1000000000,
      }),
    ).rejects.toMatchObject({ code: 'bar_star_capacity' });
    expect((await pool.query('select id from bar_game_matches')).rows).toHaveLength(0);
  });
  it('settles golden initial deals at paid creation without a second debit or payout', async () => {
    for (const [handA, handB, balance] of [
      [[32, 33], [8, 12], 120],
      [[8, 12], [32, 33], 80],
      [[32, 33], [34, 35], 100],
    ] as [number[], number[], number][]) {
      await pool.query('update users set xp=100 where id=$1', [a]);
      const used = new Set([...handA, ...handB]);
      const deck = [
        ...Array.from({ length: 36 }, (_, i) => i).filter((c) => !used.has(c)),
        handB[1]!,
        handB[0]!,
        handA[1]!,
        handA[0]!,
      ];
      vi.mocked(ochkoDeck.createPrivateOchko).mockImplementation((now) =>
        barOchko.createOchkoFromDeck(deck, now),
      );
      const offer = await proposeOchkoStake(pool, a),
        input = { requestId: randomUUID(), offerId: offer.offerId, stars: 20 };
      const first = await startOchkoStake(pool, a, input);
      await startOchkoStake(pool, a, input);
      await readGame(pool, a, first.id);
      expect(first.runtime.game.winner).not.toBeNull();
      expect(Number((await pool.query('select xp from users where id=$1', [a])).rows[0].xp)).toBe(
        balance,
      );
    }
  });
  it('rechecks funds under a competing purchase transaction and never leaves a negative balance', async () => {
    const offer = await proposeOchkoStake(pool, a),
      client = await pool.connect();
    try {
      await client.query('begin');
      await client.query('update users set xp=xp-80 where id=$1 and xp>=80', [a]);
      const start = startOchkoStake(pool, a, {
        requestId: randomUUID(),
        offerId: offer.offerId,
        stars: 50,
      });
      const outcome = start.then(
        () => null,
        (error) => error,
      );
      await client.query('commit');
      expect(await outcome).toMatchObject({ code: 'bar_insufficient_stars' });
      expect(Number((await pool.query('select xp from users where id=$1', [a])).rows[0].xp)).toBe(
        20,
      );
      expect((await pool.query('select id from bar_game_matches')).rows).toHaveLength(0);
    } finally {
      client.release();
    }
  });
  it('rejects foreign, expired and changed stake requests without another debit',async()=>{
    const foreign=await proposeOchkoStake(pool,a);
    await expect(startOchkoStake(pool,b,{requestId:randomUUID(),offerId:foreign.offerId,stars:20})).rejects.toMatchObject({code:'bar_offer_expired'});
    await pool.query('update bar_ochko_offers set expires_at=$2 where id=$1',[foreign.offerId,new Date(Date.now()-1)]);
    await expect(startOchkoStake(pool,a,{requestId:randomUUID(),offerId:foreign.offerId,stars:20})).rejects.toMatchObject({code:'bar_offer_expired'});
    const offer=await proposeOchkoStake(pool,a),input={requestId:randomUUID(),offerId:offer.offerId,stars:20};
    await startOchkoStake(pool,a,input);
    await expect(startOchkoStake(pool,a,{...input,stars:21})).rejects.toMatchObject({code:'bar_game_changed'});
    expect(Number((await pool.query('select xp from users where id=$1',[a])).rows[0].xp)).toBe(80);
  });
  it('processes independent ochko hands once despite a stale shared revision',async()=>{
    await queueGame(pool,a,'ochko');await queueGame(pool,b,'ochko');const id=(await gameLobby(pool,a)).matchId!;
    const data=(await pool.query('select data from bar_game_matches where id=$1',[id])).rows[0].data;
    data.ready=null;Object.assign(data.runtime.game,{hands:[[0,4],[1,5]],scores:[13,13],deck:[20,21,22,23],done:[false,false],golden:[false,false],winner:null,actionSeq:[0,0],dealUntil:[0,0]});
    await pool.query('update bar_game_matches set data=$2 where id=$1',[id,data]);
    await Promise.all([actGame(pool,a,id,{requestId:randomUUID(),revision:0,action:{type:'ochko-hit',seq:1}}),actGame(pool,b,id,{requestId:randomUUID(),revision:0,action:{type:'ochko-hit',seq:1}})]);
    await expect(actGame(pool,a,id,{requestId:randomUUID(),revision:0,action:{type:'ochko-hit',seq:1}})).rejects.toMatchObject({statusCode:409});
    const game=(await pool.query('select data from bar_game_matches where id=$1',[id])).rows[0].data.runtime.game;
    expect(game.actionSeq).toEqual([1,1]);expect(game.hands.map((hand:number[])=>hand.length)).toEqual([3,3]);
  });
});
