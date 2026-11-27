import {durakTable} from '@hockey/game-core';
import {commandCardRoom,readCardRoom} from '../../src/bar/durakRooms.js';
import { actGame } from '../../src/bar/games/service.js';
import { createMatch } from '@hockey/game-core';
import { durak } from '@hockey/game-core';
import { createDurakAchievementTelemetry } from '../../src/bar/durakAchievementAdapter.js';
import { startMariaMatch, getMariaMatch } from '../../src/bar/durakService.js';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';
import { applyMigrations } from '../../src/db/migrations.js';
import {
  recordBarGameResult,
  recordBarMessage,
  recordBarCardPurchase,
} from '../../src/achievements/barProgress.js';
import { claimCurrentAchievementStage } from '../../src/achievements/claimStage.js';
import { fetchAchievementCatalogueForUser } from '../../src/achievements/service.js';
describe.skipIf(!hasIntegrationEnv)('bar live reward lifecycle', () => {
  let pool: Pool;
  const at = new Date('2027-01-02T20:00:00Z');
  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, fileURLToPath(new URL('../../db/migrations', import.meta.url)));
    await pool.query("update bar_achievement_launch set started_at='2027-01-01Z'");
  }, 60000);
  afterAll(async () => {
    await pool?.end();
  });
  async function user(amateur = true) {
    const id = randomUUID();
    await pool.query(
      "insert into users(id,display_name,timezone,amateur_onboarding_completed) values($1,'Bar integration','Europe/Moscow',$2)",
      [id, amateur],
    );
    return id;
  }
  async function transaction(run: (c: PoolClient) => Promise<void>) {
    const c = await pool.connect();
    try {
      await c.query('begin');
      await run(c);
      await c.query('commit');
    } catch (e) {
      await c.query('rollback');
      throw e;
    } finally {
      c.release();
    }
  }
  async function result(
    id: string,
    eventId = randomUUID(),
    won = true,
    opponentId = 'daria',
    startedAt = at,
  ) {
    await transaction((c) =>
      recordBarGameResult(c, {
        eventId,
        game: 'darts',
        occurredAt: at,
        startedAt,
        mode: 'character',
        participants: [{ userId: id, opponentId, won, qualifiers: {} }],
      }),
    );
    return eventId;
  }
  const card = async (id: string, achievementId: string) =>
    (await fetchAchievementCatalogueForUser(pool, id)).find((a) => a.id === achievementId)!;
  it('seeds every approved task/stage without historical progress', async () => {
    const id = await user();
    const list = await fetchAchievementCatalogueForUser(pool, id);
    const bar = list.filter((a) => a.category === 'bar');
    expect(bar).toHaveLength(95);
    expect(bar.every((a) => !a.isClaimable)).toBe(true);
    expect(
      (
        await pool.query(
          "select count(*)::int as n,sum(reward_stars)::int as reward from achievement_stages where achievement_id like 'bar-%'",
        )
      ).rows[0],
    ).toEqual({ n: 268, reward: 10363 });
    await result(id, randomUUID(), true, 'daria', new Date('2026-12-31Z'));
    expect((await card(id, 'bar-1-character')).stage?.progressValue).toBe(0);
  });
  it('deduplicates results and pays each claimed stage once, retaining progress while waiting', async () => {
    const id = await user();
    const event = await result(id);
    await result(id, event);
    for (let i = 0; i < 5; i++) await result(id);
    expect((await card(id, 'bar-1-character')).isClaimable).toBe(true);
    await transaction(async (c) => {
      const r = await claimCurrentAchievementStage(c, id, 'bar-1-character', at);
      expect(r.rewards).toMatchObject({ stars: 3, experience: 3 });
    });
    const second = await card(id, 'bar-1-character');
    expect(second.stage).toMatchObject({ current: 2, progressValue: 6, targetValue: 5 });
    expect(second.isClaimable).toBe(true);
    await transaction(async (c) => {
      const r = await claimCurrentAchievementStage(c, id, 'bar-1-character', at);
      expect(r.rewards.stars).toBe(7);
    });
    await expect(
      transaction(async (c) => {
        await claimCurrentAchievementStage(c, id, 'bar-1-character', at);
      }),
    ).rejects.toThrow();
    expect(
      (await pool.query('select xp,experience from users where id=$1', [id])).rows[0],
    ).toMatchObject({ xp: 10, experience: 10 });
  });
  it('keeps opponents/modes separate and awards immediate rematch only after an actual loss', async () => {
    const id = await user();
    await result(id, randomUUID(), false);
    await result(id);
    expect((await card(id, 'bar-5-character')).isClaimable).toBe(true);
    expect((await card(id, 'bar-1-online')).isClaimable).toBe(false);
  });
  it('deduplicates visits by player-local date and meetings require a reply', async () => {
    const id = await user();
    const message = randomUUID();
    await transaction(async (c) => {
      await recordBarMessage(c, id, message, 'igor', at, false);
      await recordBarMessage(c, id, message, 'igor', at, false);
    });
    expect((await card(id, 'bar-44-social')).stage?.progressValue).toBe(1);
    expect((await card(id, 'bar-45-social')).isClaimable).toBe(false);
    await transaction((c) => recordBarMessage(c, id, message, 'igor', at, true));
    expect((await card(id, 'bar-45-social')).isClaimable).toBe(true);
    await transaction((c) =>
      recordBarMessage(c, id, randomUUID(), 'igor', new Date('2027-01-02T21:00:00Z'), false),
    );
    expect((await card(id, 'bar-44-social')).stage?.progressValue).toBe(1); // completed stage frozen; totals still grow
    expect(
      (
        await pool.query(
          "select value from bar_achievement_totals where user_id=$1 and achievement_id='bar-44-social'",
          [id],
        )
      ).rows[0].value,
    ).toBe(2);
  });
  it('credits a new card purchase/extension once and redacts unavailable character data', async () => {
    const id = await user(false);
    await transaction((c) => recordBarCardPurchase(c, id, randomUUID(), at));
    expect((await card(id, 'bar-54-social')).isClaimable).toBe(true);
    const cards = (await fetchAchievementCatalogueForUser(pool, id)).filter(
      (a) => a.accessRequirement,
    );
    expect(cards).toHaveLength(25);
    expect(JSON.stringify(cards)).not.toMatch(
      /Арсенич|Тимофей|Мария|Элина|checkers|durak|battleship/,
    );
    await expect(
      transaction(async (c) => {
        await claimCurrentAchievementStage(c, id, 'bar-36-character', at);
      }),
    ).rejects.toThrow('Любитель');
  });
  it('runs Maria from a trusted state and hides her cards in the response', async () => {
    await pool.query("update bar_achievement_launch set started_at=now()-interval '1 minute'");
    const id = await user();
    const v = await startMariaMatch(pool, id);
    expect(v.hand).toHaveLength(6);
    expect(v.opponentCount).toBe(6);
    expect(v).not.toHaveProperty('hands');
    expect(v).not.toHaveProperty('telemetry');
    const next = await getMariaMatch(pool, id, v.id, { revision: v.revision, action: 'surrender' });
    expect(next.result).toBe(1);
    expect((await card(id, 'bar-36-character')).isClaimable).toBe(false);
  });

  it('credits an actual legal Maria win, waits for claim and ignores a replayed final action', async () => {
    const id = await user();
    const initial = await startMariaMatch(pool, id);
    const c = (suit: durak.Suit, rank: number) => ({ id: `${suit}-${rank}`, suit, rank });
    const g: durak.Game = {
      ...durak.createGame(() => 0.4),
      attacker: 0,
      trump: 'clubs',
      deck: [],
      table: [],
      discard: [],
      limit: 2,
      phase: 'attack',
      hands: [
        [c('hearts', 6), c('clubs', 6)],
        [c('diamonds', 9), c('spades', 9)],
      ],
      result: null,
    };
    await pool.query('update bar_maria_matches set state=$2 where id=$1', [
      initial.id,
      JSON.stringify({ game: g, telemetry: createDurakAchievementTelemetry(g) }),
    ]);
    let v = await getMariaMatch(pool, id, initial.id, {
      revision: g.revision,
      action: { type: 'play', cardId: 'hearts-6' },
    });
    await pool.query(
      "update bar_maria_matches set deadline_at=now()-interval '1 second' where id=$1",
      [v.id],
    );
    v = await getMariaMatch(pool, id, v.id);
    expect(v.phase).toBe('taking');
    v = await getMariaMatch(pool, id, v.id, {
      revision: v.revision,
      action: { type: 'play', cardId: 'clubs-6' },
    });
    const revision = v.revision;
    v = await getMariaMatch(pool, id, v.id, { revision, action: { type: 'finish' } });
    expect(v.result).toBe(0);
    expect((await pool.query('select provenance,result from bar_computer_card_history where id=$1',[v.id])).rows[0]).toEqual({provenance:'server',result:'win'});
    await getMariaMatch(pool, id, v.id, { revision, action: { type: 'finish' } });
    expect((await card(id, 'bar-36-character')).isClaimable).toBe(true);
    expect((await card(id, 'bar-39-character')).isClaimable).toBe(true);
    expect((await pool.query('select xp from users where id=$1', [id])).rows[0].xp).toBe(0);
    await transaction(async (client) => {
      const r = await claimCurrentAchievementStage(client, id, 'bar-36-character', new Date());
      expect(r.rewards.stars).toBe(3);
    });
    expect(
      (await pool.query('select xp,experience from users where id=$1', [id])).rows[0],
    ).toMatchObject({ xp: 3, experience: 3 });
  });

  it('observes an actual checkers command and its server-confirmed win exactly once', async () => {
    const id = await user(),
      matchId = randomUUID(),
      now = Date.now();
    const r = createMatch('checkers', 0, now, true, 1);
    if (r.game.kind !== 'checkers') throw Error('checkers');
    r.game.board = Array(64).fill(0);
    r.game.board[42] = 1;
    r.game.board[35] = -2;
    r.game.positions = {};
    await pool.query(
      "insert into bar_game_matches(id,kind,player_a,character,data) values($1,'checkers',$2,'arsenich',$3)",
      [
        matchId,
        id,
        JSON.stringify({ runtime: r, starter: 0, ready: null, achievementStartedAt: now }),
      ],
    );
    const input = {
      requestId: randomUUID(),
      revision: r.revision,
      action: { type: 'checkers' as const, path: [42, 28] },
    };
    const won = await actGame(pool, id, matchId, input);
    expect(won.runtime.game.winner).toBe(0);
    await actGame(pool, id, matchId, input);
    expect((await card(id, 'bar-13-character')).isClaimable).toBe(true);
    expect((await card(id, 'bar-17-character')).isClaimable).toBe(true);
  });
  it('credits an online table participant at their own finish before the rest of the table ends',async()=>{
    const seats=[await user(),await user(),await user()],id=randomUUID();
    const c=(suit:durak.Suit,rank:number)=>({id:`${suit}-${rank}`,suit,rank});
    const game=durakTable.createTable(3,()=>0.4);
    game.hands=[[c('clubs',6)],[c('hearts',9),c('spades',9)],[c('diamonds',9)]];
    Object.assign(game,{deck:[],table:[],discard:[],attacker:0,defender:1,turn:0,limit:2,trump:'clubs',phase:'attack'});
    const data={seats,capacity:3,owner:seats[0],status:'playing',ready:seats,searchUntil:null,countdownAt:null,proposed:false,revision:0,game,deadline:Date.now()+30000,achievementStartedAt:Date.now(),achievementTelemetry:createDurakAchievementTelemetry(game)};
    await pool.query('insert into bar_card_rooms(id,data) values($1,$2)',[id,JSON.stringify(data)]);
    let revision=0;
    for(const [p,action] of [[0,{type:'play',cardId:'clubs-6'}],[1,{type:'take'}],[0,{type:'pass'}],[2,{type:'pass'}]] as [number,durakTable.TableAction][]) {
      const v=await commandCardRoom(pool,seats[p]!,id,revision,{type:'move',action});revision=v.revision;
    }
    const finished=await readCardRoom(pool,seats[0]!,id);expect(finished.status).toBe('playing');expect(finished.seats[0]?.status).toBe('won');
    expect((await card(seats[0]!,'bar-36-online')).isClaimable).toBe(true);
    expect((await card(seats[1]!,'bar-36-online')).isClaimable).toBe(false);
  });

});
