import type {Pool,PoolClient} from 'pg';
import {resolveAmateurAccess} from '../profile/amateurAccess.js';
import {beginMeeting,advanceMeeting,type Meeting,type Interest} from './elinaMeeting.js';
import type {ConversationTurn} from './conversationRoutes.js';
export async function readElinaMeeting(db:Pool|PoolClient,user:string){
 const [access,state,activity,achievements]=await Promise.all([
 resolveAmateurAccess(db,user),
 db.query<{meeting:Meeting|null;successful_meetings:number}>('select meeting,successful_meetings from bar_staff_room_state where user_id=$1',[user]),
 db.query<{days:number}>(`with completed as (
 select a.occurred_at from social_activity_actor actor join social_activity a on a.id=actor.activity_id
 where actor.user_id=$1 and (a.kind in ('daily','training','initial_course','advanced_course','duel','regular','playoff')
 or a.kind='bar_cards' and a.data->>'provenance'='server')
 union all select ended_at from bar_game_matches where (player_a=$1 or player_b=$1) and ended_at is not null
 and coalesce((data->'ready'->>'cancelled')::boolean,false)=false and coalesce(data->'runtime'->>'reason','')<>'technical'
 and data->'runtime'->'game'->>'winner' is not null
 union all select closed_at from bonus_game_attempt where user_id=$1 and status in ('completed','failed')
 and state='closed' and closed_at is not null and shots_taken>0
 ) select count(distinct (c.occurred_at at time zone coalesce(u.timezone,'UTC'))::date)::int as days
 from users u join completed c on c.occurred_at<=clock_timestamp() where u.id=$1
 and (c.occurred_at at time zone coalesce(u.timezone,'UTC'))::date between (now() at time zone coalesce(u.timezone,'UTC'))::date-6 and (now() at time zone coalesce(u.timezone,'UTC'))::date`,[user]),
 db.query(`select a.title from user_achievements ua join achievements a on a.id=ua.achievement_id
 where ua.user_id=$1 and ua.completed_at is not null order by ua.completed_at desc limit 8`,[user]),
 ]);
 const row=state.rows[0];
 const meeting=beginMeeting(row?.meeting??null,Date.now(),access.competitionLevel!=='beginner',row?.successful_meetings??0);
 return {meeting,context:{remaining:meeting.remaining,personalAllowed:meeting.personalAllowed,successful:meeting.successful,
 competitionLevel:access.competitionLevel,regular:(activity.rows[0]?.days??0)>=4,achievements:achievements.rows}};
}
// Same transaction and visitor lock as the persisted answer and message receipt.
export async function completeElinaMeeting(db:PoolClient,user:string,turn:ConversationTurn,interest:Interest){
 const {meeting}=await readElinaMeeting(db,user);
 const next=advanceMeeting(meeting,Date.now(),interest);
 await db.query(`update bar_staff_room_state set meeting=$2::jsonb,successful_meetings=successful_meetings+$3,
 absent_until=case when $4 then greatest(coalesce(presence_until,clock_timestamp()),clock_timestamp()+interval '15 minutes') else absent_until end,
 presence_mode=case when $4 then 'empty' else presence_mode end where user_id=$1`,
 [user,JSON.stringify(next),!meeting.successful&&next.successful?1:0,next.action==='leave']);
 if(next.action==='leave'){
  turn.intervention='office-departure';
  turn.officeEmptyUntil=new Date(Date.now()+15000).toISOString();
  turn.assistant='Мне пора возвращаться к работе. Этот разговор закончим.';
  await db.query('update bar_staff_room_entries set empty_since=clock_timestamp() where user_id=$1 and escorted_at is null',[user]);
 }else if(next.action==='warning')turn.assistant='У меня мало времени. Если есть конкретный вопрос, давай к нему.';
}
