import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {SqlConversationStore} from './conversationStore.js';
import {staffRoomEvent} from './staffRoom.js';
import {officeDayMode} from './officeSchedule.js';
import {readElinaMeeting} from './elinaMeetingStore.js';
import {visitorAccount} from './visitorService.js';
const url=process.env.BAR_OLEG_TEST_DATABASE_URL;
const enabled=!!url&&url.includes('uh_bar_oleg_test_');
describe.skipIf(!enabled)('Elina business meeting persistence',()=>{
 const pool=new Pool({connectionString:url}),store=new SqlConversationStore(pool);
 let user:string,day:string,entry:string;
 beforeAll(async()=>{
  await pool.query(await readFile(new URL('../../db/migrations/238_elina_business_visits.sql',import.meta.url),'utf8'));
  day=(await pool.query("select (now() at time zone 'Europe/Moscow')::date::text as day")).rows[0].day;
  user=randomUUID();while(officeDayMode(user,day)==='scene')user=randomUUID();
  await pool.query("insert into users(id,display_name,timezone) values($1,'Synthetic business visit QA','Europe/Moscow')",[user]);
  await pool.query("insert into bar_staff_room_state(user_id,day,presence_mode,presence_until) values($1,$2,'seated',now()+interval '30 minutes')",[user,day]);
  const db=await pool.connect();try{await db.query('begin');await visitorAccount(db,user,Date.now());await db.query("update bar_visitor_accounts set purchased_at=now(),expires_at=now()+interval '7 days' where user_id=$1",[user]);await db.query('commit');}finally{db.release();}
  entry=(await staffRoomEvent(pool,user,'enter',randomUUID())).entryId!;
 });
 afterAll(async()=>{if(user)await pool.query('delete from users where id=$1',[user]);await pool.end();});
 const send=async(interest:'none'|'business'|'personal')=>{
  const before=await store.read(user,'elina'),id=randomUUID();
  expect((await store.reserve(user,'elina',id,before.revision)).kind).toBe('reserved');
  const record=await store.complete(user,'elina',{id,user:'Synthetic question',assistant:'Synthetic answer',createdAt:new Date().toISOString(),officeDay:day},[],undefined,interest);
  expect((await store.reserve(user,'elina',id,record.revision)).kind).toBe('duplicate');
  return record;
 };
 it('resumes across tabs, does not spend failed reservations, and grants one success per meeting',async()=>{
  expect((await staffRoomEvent(pool,user,'enter',randomUUID())).entryId).toBe(entry);
  const before=await store.read(user,'elina'),id=randomUUID();
  await store.reserve(user,'elina',id,before.revision);await store.release(user,'elina',id);
  expect((await readElinaMeeting(pool,user)).meeting.remaining).toBe(2);
  await send('business');await send('business');
  const row=(await pool.query('select successful_meetings,meeting from bar_staff_room_state where user_id=$1',[user])).rows[0];
  expect(row.successful_meetings).toBe(1);expect(row.meeting.remaining).toBe(10);
 });
 it('opens personal topics only in the next meeting after two successes',async()=>{
  await pool.query("update bar_staff_room_state set meeting=jsonb_set(meeting,'{lastMessageAt}',to_jsonb((extract(epoch from now()-interval '31 minutes')*1000)::bigint)) where user_id=$1",[user]);
  await send('business');expect((await readElinaMeeting(pool,user)).context.personalAllowed).toBe(false);
  await pool.query("update bar_staff_room_state set meeting=null where user_id=$1",[user]);
  expect((await readElinaMeeting(pool,user)).context.personalAllowed).toBe(true);
 });
 it('refreshes a preserved entry identifier on a new day without losing trust',async()=>{
  await pool.query("update bar_staff_room_entries set day=day-1 where user_id=$1",[user]);
  const next=await staffRoomEvent(pool,user,'enter',entry);
  expect(next.day).toBe(day);
  expect((await pool.query('select day::text as day from bar_staff_room_entries where user_id=$1 and entry_id=$2',[user,entry])).rows[0].day).toBe(day);
  expect((await readElinaMeeting(pool,user)).context.personalAllowed).toBe(true);
 });
 it('leaves after the budget, blocks re-entry, and escorts exactly once without conflict',async()=>{
  await send('none');const record=await send('none');
  expect(record.turns.at(-1)?.intervention).toBe('office-departure');
  expect((await staffRoomEvent(pool,user,'enter',entry)).phase).toBe('empty');
  await expect(staffRoomEvent(pool,user,'warn',entry)).rejects.toMatchObject({code:'staff_room_not_ready'});
  await pool.query("update bar_staff_room_entries set empty_since=now()-interval '16 seconds' where user_id=$1",[user]);
  expect((await Promise.all([staffRoomEvent(pool,user,'warn',entry),staffRoomEvent(pool,user,'warn',entry)])).map(x=>x.phase)).toEqual(['escorted','escorted']);
  expect((await store.read(user,'oleg')).turns.filter(t=>t.intervention==='office-escort')).toHaveLength(1);
  expect((await pool.query('select warned_at,fight_id,absent_until>now() as absent from bar_staff_room_state where user_id=$1',[user])).rows[0]).toMatchObject({warned_at:null,fight_id:null,absent:true});
 });
});
