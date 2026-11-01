import '../../src/db/pool.js';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {beforeAll,afterAll,describe,expect,it} from 'vitest';
import type {Pool,PoolClient} from 'pg';
import {createTestPool,resetDatabase,hasIntegrationEnv} from '../helpers/testDb.js';
import {applyMigrations} from '../../src/db/migrations.js';
import {startCaretaker,actCaretaker} from '../../src/duel/daily/caretaker.js';
import {reconcileDayPool} from '../../src/duel/daily/reconcile.js';
describe.skipIf(!hasIntegrationEnv)('daily caretaker lifecycle',()=>{
 let pool:Pool;const base=new Date('2026-10-31T12:00:00Z');
 beforeAll(async()=>{pool=createTestPool();await resetDatabase(pool);await applyMigrations(pool,fileURLToPath(new URL('../../db/migrations',import.meta.url)));},60000);
 afterAll(async()=>{await pool.end();});
 async function fixture(){const user=randomUUID(),day=randomUUID();await pool.query("insert into users(id,display_name,timezone) values($1,'Caretaker fixture','UTC')",[user]);await pool.query("insert into day_pool(id,user_id,day_date,state,current_period,period_started_at,break_started_at,game_core_version,daily_seed) values($1,$2,'2026-10-31','break_active',1,$3,$4,117,'fixture')",[day,user,new Date(+base-60000),base]);return {user,day};}
 async function tx<T>(fn:(c:PoolClient)=>Promise<T>){const c=await pool.connect();try{await c.query('begin');const result=await fn(c);await c.query('commit');return result;}catch(e){await c.query('rollback');throw e;}finally{c.release();}}
 const gesture=(seq:number)=>({x:.5,y:Math.floor((seq-1)/4)%2===0?.8:.2,toX:.5,toY:Math.floor((seq-1)/4)%2===0?.2:.8,ms:500});
 it('retries exactly once, caps remaining break at two minutes and cannot start early',async()=>{const {user,day}=await fixture(),id=randomUUID();let state=await tx(c=>startCaretaker(c,user,id,base));expect(state.kind).toBe('push');for(let seq=1;seq<=20;seq++){state=await tx(c=>actCaretaker(c,user,id,seq,gesture(seq),new Date(+base+seq*1000)));const retry=await tx(c=>actCaretaker(c,user,id,seq,gesture(seq),new Date(+base+seq*1000)));expect(retry.progress).toBe(state.progress);}expect(state.completed).toBe(true);expect(state.readyAt).toBe('2026-10-31T12:02:20.000Z');expect((await tx(c=>reconcileDayPool(c,user,new Date(+base+139999)))).pool?.state).toBe('break_active');expect((await tx(c=>reconcileDayPool(c,user,new Date(+base+140000)))).pool?.state).toBe('idle');expect((await pool.query('select caretaker_ready_at from day_pool where id=$1',[day])).rows[0].caretaker_ready_at).toEqual(new Date(+base+140000));});
 it('restarts with the same kind and rejects superseded and foreign attempts',async()=>{const {user}=await fixture(),id=randomUUID();const first=await tx(c=>startCaretaker(c,user,id,base));const next=await tx(c=>startCaretaker(c,user,randomUUID(),new Date(+base+1000)));expect(next.kind).toBe(first.kind);await expect(tx(c=>startCaretaker(c,user,id,new Date(+base+1500)))).rejects.toThrow();await expect(tx(c=>actCaretaker(c,user,id,1,gesture(1),new Date(+base+2000)))).rejects.toThrow();const other=await fixture();await expect(tx(c=>actCaretaker(c,other.user,next.attemptId,1,gesture(1),new Date(+base+2000)))).rejects.toThrow();});
 it('allows finishing after natural readiness, rejects next-day actions',async()=>{const {user}=await fixture(),id=randomUUID();await tx(c=>startCaretaker(c,user,id,new Date(+base+899000)));let state;for(let seq=1;seq<=20;seq++)state=await tx(c=>actCaretaker(c,user,id,seq,gesture(seq),new Date(+base+899000+seq*1000)));expect(state?.readyAt).toBe('2026-10-31T12:15:00.000Z');await expect(tx(c=>actCaretaker(c,user,id,21,gesture(21),new Date('2026-11-01T00:00:01Z')))).rejects.toThrow();});
 it('does not reuse a kind within one deck',async()=>{const {user,day}=await fixture();const seen=new Set();for(let n=0;n<5;n++){if(n){await pool.query('delete from daily_caretaker where day_pool_id=$1',[day]);await pool.query('update day_pool set current_period=1,break_started_at=$2 where id=$1',[day,base]);}const state=await tx(c=>startCaretaker(c,user,randomUUID(),base));seen.add(state.kind);}expect(seen.size).toBe(5);});
});
