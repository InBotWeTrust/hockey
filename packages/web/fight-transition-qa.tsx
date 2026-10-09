import {resultPreviewMatch} from './fight-result-qa-match';
import React, {useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {advanceFight,createFightState,DEFAULT_FIGHT_RULES,FIGHT_MEDICAL_AID_MS,FIGHT_FINISH_ANIMATION_MS,FIGHT_RESULT_DISPLAY_MS,type FightHeldInput} from '@hockey/game-core';
import {fightWindowRemainingMs,FIGHT_RESPONSE_TIMEOUT_MS} from '../server/src/duel/amateur/fight/window';
import {PlayView} from './src/game/PlayView';
import {FightResultModal} from './src/components/duel/fight/FightResultModal';
import {FightModal} from './src/components/duel/fight/FightModal';
import {FightControls} from './src/components/duel/fight/FightControls';
import {FightView} from './src/game/fight/FightView';
import {useAmateurDuelStore} from './src/stores/amateurDuelStore';
import {DuelResultModal,DuelInventoryMiniHud,DUEL_INVENTORY_ICON_GLASS_STYLE as glass} from './src/screens/DailyScreen';
import type {AmateurDuelMatchState} from './src/api/amateurDuel';
import './src/app/global.css';
import './src/app/design-system.css';
let ends = Date.now()+180000;
function windowRemaining(now=Date.now()){return fightWindowRemainingMs({periodElapsedMs:Math.max(0,180000-(ends-now)),remainingMs:Math.max(0,ends-now),running:now<ends});}
function initial():AmateurDuelMatchState {
 return {id:'transition-preview',state_revision:0,fight_enabled:true,fight:null,fight_paused_at:null, fight_availability:{allowed:true,reason:'available',remainingMs:0,remainingCalls:3},server_now:new Date().toISOString(),me:{user_id:'me',side:'challenger',state:'period_active',display_name:'Александр',current_period:1,loadout:{items:[]},inventory_available:[],inventory_report:[]},opponent:{user_id:'other',display_name:'Михаил'},current_period_shots:0,current_period_goals:0} as AmateurDuelMatchState;
}
function write(match:AmateurDuelMatchState){useAmateurDuelStore.getState().applyState({...match,server_now:new Date().toISOString(),state_revision:(useAmateurDuelStore.getState().match?.state_revision??0)+1});}
function offer(incoming:boolean,forced=false){
 if(windowRemaining()<=0)return;
 const match=useAmateurDuelStore.getState().match!;
 const calls=match.fight_availability?.remainingCalls??3;
 if(!incoming&&calls===0)return;
 write({...match,fight_paused_at:null,fight_availability:{allowed:false,reason:'unavailable',remainingMs:0,remainingCalls:incoming?calls:calls-1},fight:{id:'preview-fight',status:'offered',forced,initiator_user_id:incoming?'other':'me',response_deadline_at:new Date(Date.now()+FIGHT_RESPONSE_TIMEOUT_MS).toISOString(),starts_at:null,resolved_at:null,winner_user_id:null,engine_state:null}});
}
function accept(automatic=false){
 const match=useAmateurDuelStore.getState().match!; const time=Date.now();
 if(match.fight?.status!=='offered'||(!automatic&&time>=Date.parse(match.fight.response_deadline_at))||windowRemaining(time)<=0)return;
 write({...match,fight_paused_at:new Date(time).toISOString(),fight:{...match.fight,status:'starting',starts_at:new Date(time+1000).toISOString(),engine_state:createFightState(DEFAULT_FIGHT_RULES,time+1000)}});
}
const originalFetch=window.fetch.bind(window);
window.fetch=async(input,init)=>{const url=input instanceof Request?input.url:String(input);if(url.includes('/duel/amateur/matches/transition-preview/fight/')){if(url.endsWith('/challenge'))offer(false);if(url.endsWith('/respond'))accept();return new Response(JSON.stringify({match:useAmateurDuelStore.getState().match}),{headers:{'content-type':'application/json'}});}return originalFetch(input,init);};
useAmateurDuelStore.setState({match:initial()});
const holdInterruptedPreview=new URLSearchParams(location.search).has('interrupted');
const holdDrawPreview=holdInterruptedPreview||new URLSearchParams(location.search).has('draw');
function Scene(){
 const match=useAmateurDuelStore(s=>s.match)!;
 const [now,setNow]=useState(Date.now());
 const [recovering,setRecovering]=useState(false);
 useEffect(()=>{if(holdDrawPreview){offer(true);accept(true);demoResult(null);if(holdInterruptedPreview){const current=useAmateurDuelStore.getState().match!;write({...current,fight:{...current.fight!,reason:'runtime_interrupted'}});}}},[]);
 const paused=!!match.fight_paused_at;
 const aidUntil=match.me.fight_aid_until?Date.parse(match.me.fight_aid_until):undefined;
 const assisting=aidUntil!==undefined;
 const [showResult,setShowResult]=useState(new URLSearchParams(location.search).has('result'));
 const [repeat,setRepeat]=useState(new URLSearchParams(location.search).has('incoming'));
 const repeatRef=useRef(repeat); repeatRef.current=repeat;
 const lastOfferEnded=useRef(0);
 useEffect(()=>{if(repeatRef.current)offer(true);const id=setInterval(()=>{
  const time=Date.now(), current=useAmateurDuelStore.getState().match!;
  if(current.me.fight_aid_until&&time>=Date.parse(current.me.fight_aid_until)){write({...current,me:{...current.me,fight_aid_until:null}});}
  if(current.fight?.status==='offered'&&time>=Date.parse(current.fight.response_deadline_at)){if(current.fight.forced)accept(true);else write({...current,fight_availability:{...current.fight_availability!,allowed:(current.fight_availability?.remainingCalls??0)>0},fight:{...current.fight,status:'declined'}});lastOfferEnded.current=time;}
  else if(repeatRef.current&&!current.fight_paused_at&&current.fight?.status!=='offered'&&time-lastOfferEnded.current>=1000)offer(true);
  else if(['resolved','cancelled'].includes(current.fight?.status??'')&&current.fight_paused_at){
   if(holdDrawPreview)return;
   if(time-Date.parse(current.fight.resolved_at!)>=FIGHT_FINISH_ANIMATION_MS+FIGHT_RESULT_DISPLAY_MS){const resultEnd=Date.parse(current.fight.resolved_at!)+FIGHT_FINISH_ANIMATION_MS+FIGHT_RESULT_DISPLAY_MS;const lost=current.fight.winner_user_id==='other';ends+=resultEnd-Date.parse(current.fight_paused_at)+(lost?FIGHT_MEDICAL_AID_MS:0);write({...current,fight_paused_at:null,me:{...current.me,recovery_until:null,fight_aid_until:lost?new Date(resultEnd+FIGHT_MEDICAL_AID_MS).toISOString():null}});}
  }
  else if(current.fight?.engine_state&&current.fight_paused_at){
   const state=advanceFight(current.fight.engine_state,[],time-150).state;
   if(state.status==='resolved'){write({...current,fight:{...current.fight,status:state.status,engine_state:state,winner_user_id:state.winner===0?'me':'other',resolved_at:new Date(time).toISOString()}});}
   else if(state.status==='cancelled'){write({...current,fight:{...current.fight,status:state.status,engine_state:state,winner_user_id:null,resolved_at:new Date(time).toISOString()}});}
   else {repeatRef.current=false;setRepeat(false);write({...current,fight:{...current.fight,engine_state:state}});}
  }
  setNow(time);
 },32);return()=>clearInterval(id)},[]);

 const demoResult=(won:boolean|null)=>{const current=useAmateurDuelStore.getState().match!;if(!current.fight?.engine_state)return;write({...current,fight:{...current.fight,status:won===null?'cancelled':'resolved',winner_user_id:won===null?null:won?'me':'other',resolved_at:new Date().toISOString(),engine_state:{...current.fight.engine_state,...(won===null?{phaseStartedAtMs:Date.now()-30000,deadlineMs:Date.now(),phaseId:1}:{}),status:won===null?'cancelled':'resolved',winner:won===null?null:won?0:1,hp:won===null?[1,1]:won?[2,0]:[0,2]}}});};
 const send=(command:{kind:'input';input:FightHeldInput}|{kind:'attack'|'block';zone:'head'|'body'})=>{
  const current=useAmateurDuelStore.getState().match!;const state=current.fight!.engine_state!;
  const actionId=crypto.randomUUID();const time=Math.max(Date.now(),state.finalizedThroughMs+1);
  const next=advanceFight(state,[{...command,actionId,player:0,phaseId:state.phaseId,seq:state.lastSeq[0]+1,effectiveAtMs:time}],time);
  write({...current,fight:{...current.fight!,engine_state:next.state}});
  return next.events.some(e=>e.type==='rejected')?false:actionId;
 };
 const action=(kind:'attack'|'block',zone:'head'|'body')=>{send({kind,zone});};
 return <main style={{height:'100dvh',maxWidth:480,margin:'auto',display:'flex',flexDirection:'column'}}>
  <div style={{display:'flex',gap:6,justifyContent:'center',padding:'4px 8px',fontSize:11,flexWrap:'wrap',width:'max-content',maxWidth:'94vw',position:'fixed',top:3,left:'50%',transform:'translateX(-50%)',zIndex:90,background:'rgba(255,255,255,.8)',borderRadius:12}} aria-label="Управление предпросмотром">
   <button onClick={()=>{write(initial());ends=Date.now()+180000;}}>Сброс</button>
   <button onClick={()=>{ends=Date.now()+120000;write(initial());}} disabled={paused||assisting}>Середина периода</button>
   <button onClick={()=>{ends=Date.now()+45000;write(initial());}} disabled={paused||assisting}>Последние 45 сек.</button>
   <button onClick={()=>{ends=Date.now()+3000;write(initial());}} disabled={paused||assisting}>Осталось 3 сек.</button>
   <button onClick={()=>{const deadline=Date.now()+FIGHT_MEDICAL_AID_MS;ends+=FIGHT_MEDICAL_AID_MS;write({...initial(),me:{...initial().me,fight_aid_until:new Date(deadline).toISOString()}});}}>Оказание помощи</button>
   <button onClick={()=>setRecovering(v=>!v)}>Сообщение восстановления</button>
   <button onClick={()=>setShowResult(true)}>Итог дуэли</button>
   <button onClick={()=>offer(true)} disabled={paused||assisting}>Входящий вызов</button>
   <button onClick={()=>offer(true,true)} disabled={paused||assisting}>Обязательная драка</button>
   <label style={{display:'flex',alignItems:'center',whiteSpace:'nowrap'}}><input type="checkbox" checked={repeat} onChange={e=>{setRepeat(e.target.checked);if(e.target.checked)offer(true)}}/>Повтор</label>
   <button onClick={()=>accept()} disabled={match.fight?.status!=='offered'||match.fight.initiator_user_id!=='me'}>Соперник принимает</button>
  </div>
  <PlayView suppressedByModal={paused||assisting||showResult} preserveSceneOnModalReturn showIceCar={false} onBack={()=>write(initial())} active seed="preview" goalieId="rookie" periodNumber={1} periodsTotal={3} goals={match.current_period_goals} shots={match.current_period_shots} shotsTotal={30} periodEndsAt={ends}
   {...(paused?{timer:`${Math.floor(Math.max(0,ends-Date.parse(match.fight_paused_at!))/60000)}:${String(Math.floor(Math.max(0,ends-Date.parse(match.fight_paused_at!))/1000)%60).padStart(2,'0')}`}:assisting?{timer:`${Math.floor(Math.max(0,ends-aidUntil!)/60000)}:${String(Math.floor(Math.max(0,ends-aidUntil!)/1000)%60).padStart(2,'0')}`}:{})}
   duelCondition={new URLSearchParams(location.search).has('fatigue') ? ()=>({puckSpeedDelta:0,shooterSpeedMultiplier:.65,canShoot:true,status:'normal',fatigueLevel:'heavy',stumbleActive:false,shooterXOffsetPx:0,fatigueMs:5000,nutritionConsumed:0,skatesConsumed:0}) : undefined}
   primaryActionBlocked={assisting}
   longCourtBackground="/sprites/amateur-daily-court.webp" scoreboardOpponent={{name:'Михаил',avatarUrl:null,goals:0,shots:0,time:'ИГРАЕТ 1/3',timeTone:'active'}}
   hudAddon={<DuelInventoryMiniHud match={match}/>}
   rightHudAddon={assisting?null:<FightControls match={{...match,fight_availability:{...match.fight_availability!,allowed:match.fight_availability?.allowed===true&&windowRemaining(now)>0}}} nowMs={Math.max(now,Date.parse(match.server_now))} iconStyle={glass}/>}
   optimisticAddShot={()=>{}} submitShot={async({claimedResult})=>{const current=useAmateurDuelStore.getState().match!;write({...current,current_period_shots:current.current_period_shots+1,current_period_goals:current.current_period_goals+(claimedResult==='goal'?1:0)});return {serverResult:claimedResult,state:useAmateurDuelStore.getState().match!};}} applyState={()=>{}}
  />
  {showResult&&<DuelResultModal match={resultPreviewMatch} onClose={()=>setShowResult(false)}/>}
  {assisting&&<FightModal medicalAidUntilMs={aidUntil!} nowMs={now}/> }
  {paused&&match.fight?.engine_state&&<FightModal><FightView key={`${match.fight.id}:scene`} onInput={input=>send({kind:'input',input})} onAttack={()=>send({kind:'attack',zone:'head'})} currentPlayer={{name:'Александр',avatarUrl:'/sprites/advanced-training-coach-avatar.webp'}} opponent={{name:'Михаил',avatarUrl:null}} state={match.fight.engine_state} player={0} nowMs={now} onAction={action}/>{['resolved','cancelled'].includes(match.fight.status)?<FightResultModal key={`${match.fight.id}:result`} won={match.fight.winner_user_id==='me'} draw={match.fight.status==='cancelled'} interrupted={match.fight.reason==='runtime_interrupted'}/>:<div aria-label="Проверка результата" style={{display:'flex',gap:8,justifyContent:'center',paddingTop:4,fontSize:10}}><button onClick={()=>demoResult(true)}>Проверить победу</button><button onClick={()=>demoResult(false)}>Проверить поражение</button><button onClick={()=>demoResult(null)}>Без победителя</button><button onClick={()=>setRecovering(v=>!v)}>Сообщение восстановления</button></div>}{recovering&&<p className="fight-connection" role="status">Восстанавливаем управление боем…</p>}</FightModal>}
 </main>
}
createRoot(document.getElementById('root')!).render(<Scene/>);
