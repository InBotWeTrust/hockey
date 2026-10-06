import React, {useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {FightModal} from './src/components/duel/fight/FightModal';
import {FightView} from './src/game/fight/FightView';
import {advanceFight,createFightState,DEFAULT_FIGHT_RULES,type FightCommand} from '@hockey/game-core';
import './src/app/global.css';
import './src/app/design-system.css';
function Scene(){
 const [now,setNow]=useState(Date.now());
 const [zone,setZone]=useState<'head'|'body'>('head');
 const fight=useRef(createFightState(DEFAULT_FIGHT_RULES,now+1000));
 useEffect(()=>{const timer=setInterval(()=>{const time=Date.now();if(time>=fight.current.deadlineMs){const next=createFightState(DEFAULT_FIGHT_RULES,time);next.phaseId=fight.current.phaseId+1;fight.current=next;}else fight.current=advanceFight(fight.current,[],time-150).state;setNow(time)},16);return()=>clearInterval(timer)},[]);
 const demo=(kind:string)=>{
   const time=Date.now(); const state=createFightState(DEFAULT_FIGHT_RULES,time-1000);
   state.phaseId=fight.current.phaseId+1;
   const attacker=kind==='guard'||kind==='hit'?1:0;
   const commands:FightCommand[]=[{player:attacker,kind:'attack',zone,phaseId:state.phaseId,seq:1,effectiveAtMs:time}];
   if(kind==='guard'||kind==='blocked')commands.push({...commands[0]!,player:attacker===0?1:0,kind:'block'});
   fight.current=advanceFight(state,commands,time).state;setNow(time);
 };
 return <div className="duel-fight-screen"><FightModal><FightView currentPlayer={{name:'Александр',avatarUrl:'/sprites/advanced-training-coach-avatar.webp'}} opponent={{name:'Михаил',avatarUrl:null}} state={fight.current} player={0} nowMs={now} onAction={(kind,zone)=>{
  const time=Date.now();fight.current=advanceFight(fight.current,[{player:0,kind,zone,phaseId:fight.current.phaseId,seq:fight.current.lastSeq[0]+1,effectiveAtMs:time}],time).state;setNow(time);
 }}/>{new URLSearchParams(location.search).has('effects')&&<div style={{display:'flex',gap:6,justifyContent:'center',flexWrap:'wrap',paddingTop:8}}><select aria-label="Зона проверки" value={zone} onChange={e=>setZone(e.target.value as 'head'|'body')} style={{fontSize:11}}><option value="head">Голова</option><option value="body">Корпус</option></select>{[['strike','Попасть'],['blocked','В блок'],['guard','Защититься'],['hit','Пропустить']].map(([kind,label])=><button key={kind} onClick={()=>demo(kind!)} style={{fontSize:10}}>{label}</button>)}</div>}</FightModal></div>
}createRoot(document.getElementById('root')!).render(<Scene/>);
