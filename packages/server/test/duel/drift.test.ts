import '../../src/db/pool.js';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import { createTestPool, resetDatabase, hasIntegrationEnv } from '../helpers/testDb.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { startDrift, actDrift } from '../../src/duel/daily/drift.js';
import { createDrift, stepDrift, driftProgress, caretakerBreakReadyAt, createCaretakerGame, stepCaretakerGame, isBlizzard, type DriftControl } from '@hockey/game-core';
import { reconcileDayPool } from '../../src/duel/daily/reconcile.js';
describe.skipIf(!hasIntegrationEnv)('daily caretaker lifecycle', () => {
  let pool: Pool;
  const base = new Date('2026-10-31T12:00:00Z');
  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, fileURLToPath(new URL('../../db/migrations', import.meta.url)));
  }, 60000);
  afterAll(async () => {
    await pool.end();
  });
  async function fixture() {
    const user = randomUUID(),
      day = randomUUID();
    await pool.query(
      "insert into users(id,display_name,timezone) values($1,'Caretaker fixture','UTC')",
      [user],
    );
    await pool.query(
      "insert into day_pool(id,user_id,day_date,state,current_period,period_started_at,break_started_at,game_core_version,daily_seed) values($1,$2,'2026-10-31','break_active',1,$3,$4,117,'fixture')",
      [day, user, new Date(+base - 60000), base],
    );
    return { user, day };
  }
  async function tx<T>(fn: (c: PoolClient) => Promise<T>) {
    const c = await pool.connect();
    try {
      await c.query('begin');
      const result = await fn(c);
      await c.query('commit');
      return result;
    } catch (e) {
      await c.query('rollback');
      throw e;
    } finally {
      c.release();
    }
  }

  it('alternates across breaks and days without advancing on retry', async () => {
    const {user, day} = await fixture();
    const first = await tx(c => startDrift(c, user, randomUUID(), base));
    expect(first.variant).toBe('drift');
    const retry = await tx(c => startDrift(c, user, randomUUID(), new Date(+base + 1000)));
    expect(retry.variant).toBe('drift');
    await pool.query('update day_pool set current_period=2, break_started_at=$2 where id=$1', [day, new Date(+base + 2000)]);
    const second = await tx(c => startDrift(c, user, randomUUID(), new Date(+base + 2000)));
    expect(second.variant).toBe('blizzard');
    await pool.query("update day_pool set state='closed', closed_at=$2 where id=$1", [day, new Date(+base + 3000)]);
    const nextDay = new Date('2026-11-01T12:00:00Z');
    await pool.query("insert into day_pool(user_id,day_date,state,current_period,break_started_at,game_core_version,daily_seed) values($1,'2026-11-01','break_active',1,$2,117,'next-day')", [user, nextDay]);
    const third = await tx(c => startDrift(c, user, randomUUID(), nextDay));
    expect(third.variant).toBe('drift');
    const other = await fixture();
    expect((await tx(c => startDrift(c, other.user, randomUUID(), base))).variant).toBe('drift');
    await pool.query("update day_pool set state='closed', closed_at=$2 where id=$1", [other.day, new Date(+base + 3000)]);
    await pool.query("insert into day_pool(user_id,day_date,state,current_period,break_started_at,game_core_version,daily_seed) values($1,'2026-11-01','break_active',1,$2,117,'next-day-other')", [other.user, nextDay]);
    expect((await tx(c => startDrift(c, other.user, randomUUID(), nextDay))).variant).toBe('blizzard');

  });
  it('replays batches, rejects changed replay, fast simulation and replaced attempts', async () => {
    const { user } = await fixture(),
      id = randomUUID();
    await tx((c) => startDrift(c, user, id, base));
    const controls = Array.from({ length: 30 }, () => ({ x: 0, y: -1, held: true }));
    await expect(tx((c) => actDrift(c, user, id, 1, controls, base))).rejects.toThrow('быстрые');
    const result = await tx((c) => actDrift(c, user, id, 1, controls, new Date(+base + 500)));
    expect(
      await tx((c) => actDrift(c, user, id, 1, controls, new Date(+base + 600))),
    ).toMatchObject({ seq: 1, progress: result.progress });
    await expect(
      tx((c) => actDrift(c, user, id, 1, [{ x: 1, y: 0, held: true }], new Date(+base + 600))),
    ).rejects.toThrow();
    const other = await fixture();
    await expect(
      tx((c) => actDrift(c, other.user, id, 2, controls, new Date(+base + 1000))),
    ).rejects.toThrow();
    await tx((c) => startDrift(c, user, randomUUID(), new Date(+base + 1000)));
    await expect(
      tx((c) => actDrift(c, user, id, 2, controls, new Date(+base + 1500))),
    ).rejects.toThrow();
  });
  it('locks the blizzard variant for a break and replays its controls deterministically', async () => {
    const {user}=await fixture(), first=randomUUID();
    const initial=await tx(c=>startDrift(c,user,first,base,'blizzard'));
    expect(initial.variant).toBe('blizzard');
    expect(initial.showInstruction).toBe(true);
    expect((await tx(c=>startDrift(c,user,first,base,'drift'))).variant).toBe('blizzard');
    const id=randomUUID();
    const restarted=await tx(c=>startDrift(c,user,id,base,'drift'));
    expect(restarted.variant).toBe('blizzard');
    expect(restarted.progress).toBe(0);
    expect(restarted.showInstruction).toBe(false);
    let physics=createCaretakerGame(restarted.seed,'blizzard');
    let retreat:{x:number;y:number}|undefined;
    let result=restarted,seq=0;
    for(let batch=0;batch<1400&&!result.completed;batch++){
      const controls:DriftControl[]=[];
      for(let tick=0;tick<30;tick++){
        if(!isBlizzard(physics))throw new Error('Wrong engine');
        const s=physics,cargo=s.flakes.some(f=>f.status===2);
        let target:{x:number;y:number}|undefined;
        if(cargo)target=[{x:40,y:s.y},{x:560,y:s.y},{x:s.x,y:70},{x:s.x,y:740}]
          .sort((a,b)=>Math.hypot(a.x-s.x,a.y-s.y)-Math.hypot(b.x-s.x,b.y-s.y))[0];
        else target=s.flakes.filter(f=>f.status===1)
          .sort((a,b)=>Math.hypot(a.x-s.x,a.y-s.y)-Math.hypot(b.x-s.x,b.y-s.y))[0];
        if(!cargo&&target&&!retreat&&Math.hypot(target.x-s.x,target.y-s.y)<75){
          const dx=s.x-target.x,dy=s.y-target.y,len=Math.hypot(dx,dy)||1;
          retreat={x:Math.max(120,Math.min(480,s.x+dx/len*150)),y:Math.max(200,Math.min(600,s.y+dy/len*150))};
        }
        if(retreat){if(Math.hypot(retreat.x-s.x,retreat.y-s.y)<25)retreat=undefined;else target=retreat;}
        const dx=target?target.x-s.x:0,dy=target?target.y-s.y:0,len=Math.hypot(dx,dy)||1;
        const input={x:dx/len,y:dy/len,held:!!target};
        controls.push(input);physics=stepCaretakerGame(physics,input);
        if(driftProgress(physics)>=1)break;
      }
      result=await tx(c=>actDrift(c,user,id,++seq,controls,new Date(+base+seq*500)));
      expect(result.progress).toBe(driftProgress(physics));
    }
    expect(result.completed).toBe(true);
    expect(result.progress).toBe(1);
    expect((await tx(c=>actDrift(c,user,id,seq+1,[{x:0,y:0,held:false}],new Date(+base+seq*500+100)))).readyAt).toBe(result.readyAt);
    await expect(tx(c=>startDrift(c,user,randomUUID(),new Date(+base+seq*500+100),'drift'))).rejects.toThrow();
  },30000);
  it('rejects actions as soon as the original break expires', async () => {
    const {user}=await fixture(), id=randomUUID();
    await tx(c=>startDrift(c,user,id,base));
    await expect(tx(c=>actDrift(c,user,id,1,[{x:0,y:0,held:false}],new Date(+base+900000))))
      .rejects.toThrow('перерыв уже закончился');
  });
  it('clears real snow, completes once and preserves natural readiness', async () => {
    const { user, day } = await fixture(),
      id = randomUUID(),
      start = new Date(+base);
    const initial = await tx((c) => startDrift(c, user, id, start));
    let physics = createDrift(initial.seed),
      seq = 0,
      result = initial;
    // Deterministic sweeping path across the full rink, with normal inertia and turning.

    for (let batch = 0; batch < 2400 && !result.completed; batch++) {
      const controls: DriftControl[] = [];
      for (let tick = 0; tick < 30; tick++) {
        const a = Math.sin(physics.ticks / 137) * Math.PI + physics.ticks / 311;
        const input = { x: Math.cos(a), y: Math.sin(a), held: true };
        controls.push(input);
        physics = stepDrift(physics, input);
        if (driftProgress(physics) >= 1) break;
      }
      result = await tx((c) =>
        actDrift(c, user, id, ++seq, controls, new Date(+start + seq * 500)),
      );
      expect(result.progress).toBe(driftProgress(physics));
    }
    expect(result.completed).toBe(true);
    const expectedReady = caretakerBreakReadyAt(+base + 900000, +start + seq * 500);
    expect(result.readyAt).toBe(new Date(expectedReady).toISOString());
    expect(
      (await pool.query('select caretaker_ready_at from day_pool where id=$1', [day])).rows[0]
        .caretaker_ready_at,
    ).toEqual(new Date(expectedReady));
    const replay = await tx(c=>actDrift(c,user,id,seq+1,[{x:0,y:0,held:false}],new Date(Math.max(expectedReady,+start+seq*500)+1)));
    expect(replay.completed).toBe(true);
    expect(replay.readyAt).toBe(result.readyAt);
    await expect(
      tx((c) =>
        actDrift(
          c,
          user,
          id,
          seq + 1,
          [{ x: 0, y: 0, held: false }],
          new Date('2026-11-01T00:00:01Z'),
        ),
      ),
    ).rejects.toThrow();
  });
});
