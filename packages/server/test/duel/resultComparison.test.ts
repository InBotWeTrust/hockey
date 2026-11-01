import '../../src/db/pool.js';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {beforeAll, afterAll, describe, expect, it} from 'vitest';
import type {Pool} from 'pg';
import {createTestPool, resetDatabase, hasIntegrationEnv} from '../helpers/testDb.js';
import {applyMigrations} from '../../src/db/migrations.js';
import {readResultComparison, rememberResultContext} from '../../src/duel/resultComparison.js';
import {getGameSettings} from '../../src/duel/gameSettings.js';

describe.skipIf(!hasIntegrationEnv)('session result comparisons',()=>{
 let pool:Pool;
 beforeAll(async()=>{pool=createTestPool();await resetDatabase(pool);await applyMigrations(pool,fileURLToPath(new URL('../../db/migrations',import.meta.url)));},60000);
 afterAll(async()=>{await pool.end();});
 async function fixture(mode:'daily'|'training'){
  const user=randomUUID(), current=randomUUID(), previous=randomUUID();
  const context={limit:2,venue:'yard',selectedPeriod:mode==='daily'?null:1};
  await pool.query("insert into users(id,display_name,timezone) values($1,'Result fixture','UTC')",[user]);
  for(const [id,day] of [[previous,'2026-10-29'],[current,'2026-11-01']]){
   if(mode==='daily')await pool.query("insert into day_pool(id,user_id,day_date,state,current_period,game_core_version,daily_seed,result_context) values($1,$2,$3,'closed',1,126,'fixture',$4)",[id,user,day,context]);
   else await pool.query("insert into training_session(id,user_id,day_date,selected_period,state,game_core_version,training_seed,shots_limit,started_at,result_context) values($1,$2,$3,1,'closed',126,'fixture',2,now(),$4)",[id,user,day,context]);
  }
  if(mode==='daily')await pool.query("insert into period_log(day_pool_id,period_number,started_at,ended_at,shots_taken,goals,closed_reason) values($1,1,now(),now(),2,1,'quota')",[previous]);
  else await pool.query("insert into shot_session(user_id,mode,training_session_id,period_number,shot_index,seed,input_payload,server_result,game_core_version) values($1,'training',$2,1,1,'one','{}','goal',126),($1,'training',$2,1,2,'two','{}','save',126)",[user,previous]);
  return {user,current,previous};
 }
 it.each(['daily','training'] as const)('compares the last played %s with its recorded conditions',async mode=>{
  const {user,current}=await fixture(mode);const client=await pool.connect();
  try{expect(await readResultComparison(client,user,mode,current,'2026-11-01',2,2)).toMatchObject({kind:mode,previous:{day:'2026-10-29',shots:2,goals:1,limit:2,comparable:true}});}finally{client.release();}
 });
 it('does not compare different difficulty or unknown historical conditions',async()=>{
  const {user,current,previous}=await fixture('training');const client=await pool.connect();
  try{
   await pool.query("update training_session set result_context=jsonb_set(result_context,'{selectedPeriod}','2') where id=$1",[previous]);
   expect((await readResultComparison(client,user,'training',current,'2026-11-01',2,2))?.previous?.comparable).toBe(false);
   await pool.query('update training_session set result_context=null where id=$1',[previous]);
   expect((await readResultComparison(client,user,'training',current,'2026-11-01',2,2))?.previous?.comparable).toBe(false);
   expect(await readResultComparison(client,user,'training',current,'2026-11-01',1,1)).toBeNull();
  }finally{client.release();}
 });
 it('preserves the venue at session start when a player qualifies during the game',async()=>{
  const {user,current}=await fixture('daily');const client=await pool.connect();
  try{
   await pool.query('update day_pool set result_context=null where id=$1',[current]);
   const settings=await getGameSettings(client);
   await rememberResultContext(client,user,'daily',current,settings);
   await pool.query('update users set daily_goals_total=10000 where id=$1',[user]);
   await rememberResultContext(client,user,'daily',current,settings);
   expect((await pool.query('select result_context from day_pool where id=$1',[current])).rows[0].result_context.venue).toBe('yard');
  }finally{client.release();}
 });
});
