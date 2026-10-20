import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {recordPhysicalIncident} from './physicalIncident.js';
import {SqlConflictStore} from './conflict.js';
import {SqlConversationStore} from './conversationStore.js';
const url=process.env.BAR_OLEG_TEST_DATABASE_URL;
describe.skipIf(!url?.includes('uh_bar_oleg_test_'))('physical incidents in isolated DB',()=>{
 const pool=new Pool({connectionString:url}),user=randomUUID(),other=randomUUID();
 const state=new SqlConflictStore(pool),store=new SqlConversationStore(pool);
 beforeAll(async()=>{await pool.query("insert into users(id,display_name,timezone) values($1,'Synthetic physical QA','Europe/Moscow'),($2,'Synthetic other QA','UTC')",[user,other]);});
 afterAll(async()=>{await pool.query('delete from users where id=any($1::uuid[])',[[user,other]]);await pool.end();});
 it('deduplicates concurrent delivery, isolates ownership, records no fabricated user message',async()=>{
  const id=randomUUID();await Promise.all([recordPhysicalIncident(pool,user,'maria',id),recordPhysicalIncident(pool,user,'maria',id)]);
  expect((await state.state(user)).warnings).toBe(1);expect((await state.state(other)).warnings).toBe(0);
  const turns=(await store.read(user,'maria')).turns;expect((await store.read(user,'daria')).interventionActive).toBe(true);expect((await store.read(other,'daria')).interventionActive).toBe(false);expect(turns).toHaveLength(1);expect(turns[0]).toMatchObject({user:'',event:'physical',speaker:'oleg',intervention:'intervention'});
  await expect(recordPhysicalIncident(pool,user,'daria',id)).rejects.toMatchObject({statusCode:409});
 });
 it('reset starts a new intervention; next gesture against another character starts one fight',async()=>{
  await pool.query("update bar_conflicts set day=day-1 where user_id=$1",[user]);
  expect((await store.read(user,'maria')).interventionActive).toBe(false);
  await recordPhysicalIncident(pool,user,'oleg',randomUUID());expect((await state.state(user)).warnings).toBe(1);
  const id=randomUUID();await recordPhysicalIncident(pool,user,'grigory',id);await recordPhysicalIncident(pool,user,'grigory',id);
  expect((await state.state(user)).warnings).toBe(2);expect((await store.read(user,'grigory')).turns[0]?.fightId).toBeTruthy();
  expect((await pool.query('select id from bar_oleg_fights where user_id=$1',[user])).rows).toHaveLength(1);
 });
 it('does not mutate warnings while a conversation owns the pending reservation',async()=>{
  const id=randomUUID();expect((await store.reserve(other,'maria',id,0)).kind).toBe('reserved');
  await expect(recordPhysicalIncident(pool,other,'maria',randomUUID())).rejects.toMatchObject({code:'conversation_busy'});
  expect((await state.state(other)).warnings).toBe(0);expect((await store.read(other,'maria')).turns).toHaveLength(0);
  await store.release(other,'maria',id);
 });
 it('rejects new gestures during a fight and blocked access',async()=>{
  await expect(recordPhysicalIncident(pool,user,'daria',randomUUID())).rejects.toMatchObject({code:'bar_fight_pending'});
  await pool.query("update bar_conflicts set blocked_until=now()+interval '1 hour' where user_id=$1",[other]);
  // Create the other owner's block explicitly; no global state is modified.
  await pool.query("insert into bar_conflicts(user_id,day,blocked_until) values($1,current_date,now()+interval '1 hour') on conflict(user_id) do update set blocked_until=excluded.blocked_until",[other]);
  await expect(recordPhysicalIncident(pool,other,'maria',randomUUID())).rejects.toMatchObject({code:'bar_closed'});
 });
});
