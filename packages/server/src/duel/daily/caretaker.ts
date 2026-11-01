import {randomInt} from 'node:crypto';
import type {PoolClient} from 'pg';
import {AppError} from '../../plugins/errors.js';
import {getGameSettings} from '../gameSettings.js';
import {lockUserGameplay} from '../gameplayLocks.js';
import {reconcileDayPool} from './reconcile.js';
import {acceleratedReadyAt,applyCaretakerInput,caretakerKinds,caretakerTargets,initialProgress,type CaretakerInput,type CaretakerKind,type CaretakerProgress} from './caretakerRules.js';
interface Row {id:string;user_id:string;day_pool_id:string;period_number:number;kind:CaretakerKind;period_end:Date;original_ready_at:Date;attempt_id:string;attempt_ids:string[];started_at:Date;updated_at:Date;seq:number;progress:CaretakerProgress;last_input:CaretakerInput|null;completed_at:Date|null}
function view(row:Row,now:Date){return {id:row.id,attemptId:row.attempt_id,kind:row.kind,period:row.period_number,seq:row.seq,progress:row.progress.value,target:caretakerTargets[row.kind],startedAt:row.started_at.toISOString(),serverNow:now.toISOString(),completed:row.completed_at!==null,readyAt:new Date(row.completed_at?acceleratedReadyAt(+row.period_end,+row.original_ready_at,+row.completed_at):+row.original_ready_at).toISOString()};}
export async function caretakerContext(client:PoolClient,user:string,now:Date){await lockUserGameplay(client,user);const settings=await getGameSettings(client);const result=await reconcileDayPool(client,user,now,settings.daily);return {...result,settings};}
export async function startCaretaker(client:PoolClient,user:string,requestId:string,now:Date){
 const {pool,settings}=await caretakerContext(client,user,now);
 if(!pool||pool.state!=='break_active'||!pool.break_started_at)throw new AppError('conflict','Уборка доступна во время перерыва.',409);
 const existing=(await client.query<Row>('select * from daily_caretaker where day_pool_id=$1 and period_number=$2 for update',[pool.id,pool.current_period])).rows[0];
 if(existing&&!caretakerKinds.includes(existing.kind))throw new AppError('conflict','Открой новую уборку льда.',409);
 if(existing?.completed_at)return view(existing,now);
 if(existing){if(existing.attempt_id===requestId)return view(existing,now);if(existing.attempt_ids.includes(requestId))throw new AppError('conflict','Эта попытка уже заменена новой.',409);const row=(await client.query<Row>('update daily_caretaker set attempt_id=$2,attempt_ids=array_append(attempt_ids,$2),started_at=$3,updated_at=$3,seq=0,progress=$4,last_input=null where id=$1 returning *',[existing.id,requestId,now,initialProgress()])).rows[0]!;return view(row,now);}
 await client.query('insert into daily_caretaker_user(user_id) values($1) on conflict do nothing',[user]);
 let deck=(await client.query<{deck:CaretakerKind[]}>('select deck from daily_caretaker_user where user_id=$1 for update',[user])).rows[0]!.deck;
 if(!deck.length){deck=[...caretakerKinds];for(let i=deck.length-1;i>0;i--){const j=randomInt(i+1);[deck[i],deck[j]]=[deck[j]!,deck[i]!];}}
 // The first deck starts with push; all later selections are shuffled without replacement.
 const kind=deck.shift()!;for(let i=deck.length-1;i>0;i--){const j=randomInt(i+1);[deck[i],deck[j]]=[deck[j]!,deck[i]!];}
 await client.query('update daily_caretaker_user set deck=$2,introduced_at=coalesce(introduced_at,$3) where user_id=$1',[user,deck,now]);
 const row=(await client.query<Row>(`insert into daily_caretaker(user_id,day_pool_id,period_number,kind,period_end,original_ready_at,attempt_id,attempt_ids,started_at,updated_at) values($1,$2,$3,$4,$5,$6,$7,array[$7]::uuid[],$8,$8) returning *`,[user,pool.id,pool.current_period,kind,pool.break_started_at,new Date(+pool.break_started_at+settings.daily.breakDurationMs),requestId,now])).rows[0]!;
 await client.query("select record_novice_funnel($1,'caretaker_started',$2,$3,$4)",[user,row.id,{kind:row.kind,period:row.period_number},now]);
 return view(row,now);
}
export async function actCaretaker(client:PoolClient,user:string,attemptId:string,seq:number,input:CaretakerInput,now:Date){
 const {pool}=await caretakerContext(client,user,now);
 const row=(await client.query<Row>('select * from daily_caretaker where user_id=$1 and attempt_id=$2 for update',[user,attemptId])).rows[0];
 if(row&&!caretakerKinds.includes(row.kind))throw new AppError('conflict','Открой новую уборку льда.',409);
 if(!row||!pool||pool.id!==row.day_pool_id||pool.current_period!==row.period_number||!['break_active','idle'].includes(pool.state))throw new AppError('conflict','Этот перерыв уже закончился. Вернись к игре.',409);
 if(seq===row.seq){if(JSON.stringify(row.last_input)!==JSON.stringify(input)&&Object.keys(input).some(k=>input[k as keyof CaretakerInput]!==row.last_input?.[k as keyof CaretakerInput]))throw new AppError('conflict','Повтор действия отличается от сохранённого.',409);return view(row,now);}
 if(row.completed_at)return view(row,now);
 if(seq!==row.seq+1)throw new AppError('conflict','Обнови состояние уборки.',409);
 const progress=applyCaretakerInput(row.kind,row.progress,input,+now-+row.started_at,+now-+row.updated_at);
 const completed=progress.value>=caretakerTargets[row.kind];
 const updated=(await client.query<Row>('update daily_caretaker set progress=$2,seq=$3,last_input=$4,updated_at=$5,completed_at=$6 where id=$1 returning *',[row.id,progress,seq,input,now,completed?now:null])).rows[0]!;
 if(completed){const ready=new Date(acceleratedReadyAt(+row.period_end,+row.original_ready_at,+now));await client.query('update day_pool set caretaker_ready_at=$2 where id=$1',[pool.id,ready]);await client.query("select record_novice_funnel($1,'caretaker_completed',$2,$3,$4)",[user,row.id,{kind:row.kind,period:row.period_number},now]);}
 return view(updated,now);
}
