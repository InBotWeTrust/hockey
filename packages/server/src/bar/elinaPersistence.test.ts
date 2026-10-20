import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {officeDayMode} from './officeSchedule.js';
import {staffRoomEvent} from './staffRoom.js';
import {requireElinaOffice} from './elinaOffice.js';
import {SqlConversationStore} from './conversationStore.js';
import {visitorAccount} from './visitorService.js';
const url=process.env.BAR_OLEG_TEST_DATABASE_URL;
const enabled=!!url&&url.includes('uh_bar_oleg_test_');
describe.skipIf(!enabled)('Elina isolated persistence',()=>{
 const pool=new Pool({connectionString:url}),store=new SqlConversationStore(pool);
 let seated:string,empty:string,day:string;
 beforeAll(async()=>{
  day=(await pool.query("select (now() at time zone 'Europe/Moscow')::date::text as day")).rows[0].day;
  for(const mode of ['seated','empty'] as const){
   let user=randomUUID();while(officeDayMode(user,day)!==mode)user=randomUUID();
   await pool.query("insert into users(id,display_name,timezone) values($1,'Synthetic Elina QA','Europe/Moscow')",[user]);
   if(mode==='seated')seated=user;else empty=user;
  }
  const db=await pool.connect();try{await db.query('begin');await visitorAccount(db,seated,Date.now());await db.query("update bar_visitor_accounts set purchased_at=now(),expires_at=now()+interval '7 days' where user_id=$1",[seated]);await db.query('commit');}finally{db.release();}
 });
 afterAll(async()=>{await pool.query('delete from users where id=any($1::uuid[])',[[seated,empty]]);await pool.end();});
 it('uses real daily modes and enforces empty-office timing and quick departure',async()=>{
  expect((await staffRoomEvent(pool,seated,'enter',randomUUID())).phase).toBe('seated');
  const entry=randomUUID();expect(await staffRoomEvent(pool,empty,'enter',entry)).toMatchObject({phase:'empty',warnAfterMs:30000});
  await pool.query("update bar_staff_room_entries set entered_at=now()-interval '4 seconds' where user_id=$1",[empty]);
  await expect(staffRoomEvent(pool,empty,'warn',entry)).rejects.toMatchObject({code:'staff_room_not_ready'});
  await staffRoomEvent(pool,empty,'leave',entry);await expect(staffRoomEvent(pool,empty,'warn',entry)).rejects.toMatchObject({code:'staff_room_not_ready'});
  await staffRoomEvent(pool,empty,'enter',entry);await pool.query("update bar_staff_room_entries set entered_at=now()-interval '31 seconds' where user_id=$1",[empty]);
  const warnings=await Promise.all([staffRoomEvent(pool,empty,'warn',entry),staffRoomEvent(pool,empty,'warn',entry)]);
  expect(warnings.every(x=>x.phase==='warning')).toBe(true);
  expect((await pool.query("select jsonb_array_length(turns) as count from bar_conversations where user_id=$1 and character_id='oleg'",[empty])).rows[0].count).toBe(1);
 });
 it('rejects a conversation when absent without reserving a message',async()=>{
  await expect(store.reserve(empty,'elina',randomUUID(),0)).rejects.toMatchObject({code:'elina_unavailable'});
  expect((await pool.query('select 1 from bar_visitor_receipts where user_id=$1',[empty])).rowCount).toBe(0);
 });
 it('expires abandoned visits and refreshes the lease without restarting the visit',async()=>{
  const entry=randomUUID();await staffRoomEvent(pool,seated,'enter',entry);
  await pool.query("update bar_staff_room_entries set last_seen_at=now()-interval '3 minutes' where user_id=$1",[seated]);
  await expect(requireElinaOffice(pool,seated)).rejects.toMatchObject({code:'elina_unavailable'});
  const started=(await pool.query('select entered_at from bar_staff_room_entries where user_id=$1 and entry_id=$2',[seated,entry])).rows[0].entered_at;
  await staffRoomEvent(pool,seated,'enter',entry);
  expect((await requireElinaOffice(pool,seated)).warnings).toBe(0);
  expect((await pool.query('select entered_at from bar_staff_room_entries where user_id=$1 and entry_id=$2',[seated,entry])).rows[0].entered_at).toEqual(started);
 });
 it('persists ordinary replies, warns once and ejects once without duplicate charges',async()=>{
  const entry=randomUUID();await staffRoomEvent(pool,seated,'enter',entry);
  expect((await requireElinaOffice(pool,seated)).warnings).toBe(0);
  for(const intervention of [undefined,'office-warning','office-eject']){
   const before=await store.read(seated,'elina'),id=randomUUID();
   expect((await store.reserve(seated,'elina',id,before.revision)).kind).toBe('reserved');
   const record=await store.complete(seated,'elina',{id,user:'Synthetic message',assistant:'Synthetic reply',createdAt:new Date().toISOString(),officeDay:day,...(intervention?{intervention,speaker:'oleg' as const}:{emotion:'interest' as const})});
   expect((await store.reserve(seated,'elina',id,record.revision)).kind).toBe('duplicate');
  }
  const row=(await pool.query('select office_warnings,departed_at from bar_staff_room_state where user_id=$1',[seated])).rows[0];
  expect(row.office_warnings).toBe(2);expect(row.departed_at).not.toBeNull();
  expect((await pool.query('select 1 from bar_visitor_receipts where user_id=$1 and status=\'complete\'',[seated])).rowCount).toBe(3);
  expect((await pool.query('select 1 from bar_oleg_fights where user_id=$1',[seated])).rowCount).toBe(0);
  expect((await staffRoomEvent(pool,seated,'enter',randomUUID())).phase).toBe('empty');
  await expect(store.reserve(seated,'elina',randomUUID(),3)).rejects.toMatchObject({code:'elina_unavailable'});
 });
 it('resets office warnings and departure on a new day and loads Elina memory',async()=>{
  await pool.query('update bar_staff_room_state set day=day-1 where user_id=$1',[seated]);
  expect((await staffRoomEvent(pool,seated,'enter',randomUUID())).phase).toBe('seated');
  expect((await requireElinaOffice(pool,seated)).warnings).toBe(0);
  const {SqlConversationMemory}=await import('./conversationMemory.js');
  const context=await new SqlConversationMemory(pool).context(seated,'elina','Привет',[]);
  expect(context.barBehaviour).toMatchObject({games:[],cards:[],fights:[]});
  const old=await store.read(seated,'elina'),id=randomUUID();
  await store.reserve(seated,'elina',id,old.revision);
  await expect(store.complete(seated,'elina',{id,user:'Old day',assistant:'Stale reply',createdAt:new Date().toISOString(),officeDay:'2000-01-01'})).rejects.toMatchObject({code:'conversation_stale'});
  await store.release(seated,'elina',id);
  expect((await store.read(seated,'elina')).revision).toBe(old.revision);
 });
});
