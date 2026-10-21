import {it,expect,vi,afterEach} from 'vitest';
import type {PoolClient} from 'pg';
import type {ConversationTurn} from './conversationRoutes.js';
import {readElinaMeeting,completeElinaMeeting} from './elinaMeetingStore.js';
import type {Meeting} from './elinaMeeting.js';
afterEach(()=>{vi.useRealTimers();});
// Query boundary fake: real access resolution, settings defaults and meeting policy run unchanged.
function fixture(level=1,days=0){
 let meeting:Meeting|null=null,successes=0,absent=false;
 const db={async query(sql:string,args:unknown[]=[]){
  if(sql.startsWith('select level'))return {rows:[{level,lifetime_goals_total:0}]};
  if(sql.includes('from game_settings'))return {rows:[]};
  if(sql.startsWith('select meeting'))return {rows:[{meeting,successful_meetings:successes}]};
  if(sql.startsWith('with completed'))return {rows:[{days}]};
  if(sql.startsWith('select a.title'))return {rows:[{title:'Первая шайба'}]};
  if(sql.startsWith('update bar_staff_room_state')){meeting=JSON.parse(String(args[1]));successes+=Number(args[2]);absent=Boolean(args[3]);return {rows:[]};}
  if(sql.startsWith('update bar_staff_room_entries'))return {rows:[]};
  throw Error('Unexpected query');
 }} as unknown as PoolClient;
 return {db,state:()=>({meeting,successes,absent})};
}
const turn=():ConversationTurn=>({id:'test',user:'Привет',assistant:'Ответ',createdAt:new Date().toISOString()});
it('persists the beginner budget, warning and departure without changing relationship for empty talk',async()=>{
 const f=fixture();
 const first=turn();await completeElinaMeeting(f.db,'owner',first,'none');
 expect(first.assistant).toContain('мало времени');expect(f.state().meeting?.remaining).toBe(1);
 const second=turn();await completeElinaMeeting(f.db,'owner',second,'none');
 expect(second.intervention).toBe('office-departure');expect(Date.parse(second.officeEmptyUntil!)-Date.now()).toBeGreaterThan(14000);
 expect(f.state()).toMatchObject({successes:0,absent:true,meeting:{remaining:0}});
});
it('uses server access and activity days, while granting only one success per meeting',async()=>{
 const f=fixture(2,4);
 expect((await readElinaMeeting(f.db,'owner')).context).toMatchObject({remaining:5,regular:true,competitionLevel:'amateur',personalAllowed:false,achievements:[{title:'Первая шайба'}]});
 await completeElinaMeeting(f.db,'owner',turn(),'business');await completeElinaMeeting(f.db,'owner',turn(),'business');
 expect(f.state()).toMatchObject({successes:1,meeting:{remaining:13}});
});
it('retains the restricted second meeting and unlocks personal interest on a later meeting',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-21T12:00:00Z'));
 const f=fixture();await completeElinaMeeting(f.db,'owner',turn(),'business');
 vi.advanceTimersByTime(1800000);await completeElinaMeeting(f.db,'owner',turn(),'business');
 expect((await readElinaMeeting(f.db,'owner')).context.personalAllowed).toBe(false);
 vi.advanceTimersByTime(1800000);expect((await readElinaMeeting(f.db,'owner')).context.personalAllowed).toBe(true);
});
it('does not treat three active days or an early personal topic as earned business trust',async()=>{
 const f=fixture(1,3);
 expect((await readElinaMeeting(f.db,'owner')).context.regular).toBe(false);
 await completeElinaMeeting(f.db,'owner',turn(),'personal');
 expect(f.state()).toMatchObject({successes:0,meeting:{remaining:1}});
});
