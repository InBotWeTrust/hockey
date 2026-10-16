import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {staffRoomEvent} from './staffRoom.js';
const url=process.env.BAR_OLEG_TEST_DATABASE_URL;
const enabled=!!url&&url.includes('uh_bar_oleg_test_');
describe.skipIf(!enabled)('staff-room isolated persistence',()=>{
 const pool=new Pool({connectionString:url});const user=randomUUID();
 beforeAll(async()=>{
  await pool.query(readFileSync(new URL('../../db/migrations/224_bar_staff_room.sql',import.meta.url),'utf8'));
  await pool.query("insert into users(id,display_name,timezone) values($1,'Staff room test','Europe/Moscow')",[user]);
 });
 afterAll(async()=>{await pool.query('delete from users where id=$1',[user]);await pool.end();});
 it('cancels quick visits and warns exactly once across retries and tabs',async()=>{
  const first=randomUUID(),second=randomUUID();
  await staffRoomEvent(pool,user,'enter',first);await staffRoomEvent(pool,user,'leave',first);
  await expect(staffRoomEvent(pool,user,'warn',first)).rejects.toMatchObject({code:'staff_room_not_ready'});
  await staffRoomEvent(pool,user,'enter',second);
  await pool.query("update bar_staff_room_entries set entered_at=now()-interval '4 seconds' where user_id=$1",[user]);
  const results=await Promise.all([staffRoomEvent(pool,user,'warn',second),staffRoomEvent(pool,user,'warn',second)]);
  expect(results.every(r=>r.phase==='warning')).toBe(true);
  const turns=(await pool.query("select turns from bar_conversations where user_id=$1 and character_id='oleg'",[user])).rows[0].turns;
  expect(turns.filter((t:{intervention?:string})=>t.intervention==='staff-room')).toHaveLength(1);
 });
 it('reuses one fight and empties only after its win, then resets next day',async()=>{
  const one=await staffRoomEvent(pool,user,'enter',randomUUID());
  const two=await staffRoomEvent(pool,user,'enter',randomUUID());
  expect(one.phase).toBe('fight');expect(two.fightId).toBe(one.fightId);
  await pool.query("update bar_oleg_fights set status='resolved',outcome='win',acknowledged=true where id=$1",[one.fightId]);
  expect((await staffRoomEvent(pool,user,'enter',randomUUID())).phase).toBe('empty');
  await pool.query("update bar_staff_room_state set day=day-1 where user_id=$1",[user]);
  expect((await staffRoomEvent(pool,user,'enter',randomUUID())).phase).toBe('scene');
 });
});
