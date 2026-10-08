import { useEffect,useRef,useState } from 'react';
import { Assets,type Application } from 'pixi.js';
import { fightPositionsAt,fightInRange,getFightPosture,neutralFightInput,type FightHeldInput } from '@hockey/game-core';
import { PixiStage } from '../PixiStage.js';
import { Fighter,FIGHT_ASSETS } from './Fighter.js';
import { FightTimeline } from './fightTimeline.js';
import { fightEntranceX } from './fightEntrance.js';
import { ResponsiveFightControls } from './ResponsiveFightControls.js';
import { UserAvatar } from '../../chat/components/UserAvatar.js';
import type { FightViewProps } from './FightView.js';
import './fight.css';
export function ResponsiveFightView(props:FightViewProps):JSX.Element{
 const {state,player,nowMs,currentPlayer,opponent}=props;const other=(1-player) as 0|1;
 const latest=useRef(props);latest.current=props;
 const app=useRef<Application|null>(null),fighters=useRef<Fighter[]>([]);
 const timeline=useRef(new FightTimeline(state));timeline.current.observe(state,nowMs);
 const held=useRef<FightHeldInput>(neutralFightInput());const predictedReady=useRef(0);
 const clock=useRef({now:nowMs,performance:performance.now()});clock.current={now:nowMs,performance:performance.now()};
 const [failed,setFailed]=useState(false);
 const terminal=state.status==='resolved'||state.status==='cancelled';
 const disabled=terminal||nowMs<state.phaseStartedAtMs||nowMs>=state.deadlineMs;
 const reset=(props.predictionReset??0)+state.phaseId*100000;
 useEffect(()=>{timeline.current.clearPrediction();predictedReady.current=0;held.current=neutralFightInput();},[reset]);
 const setInput=(input:FightHeldInput)=>{if(latest.current.onInput?.(input)===false){held.current=neutralFightInput();return;}held.current={...input};};
 const attack=()=>{
   const current=latest.current;const posture=getFightPosture(current.state,current.player,current.nowMs);
   const ready=Math.max(predictedReady.current,posture.readyAtMs);
   if(current.nowMs<ready-150)return;
   const id=current.onAttack?.();if(id===false)return;
   // Server handles the final150ms buffer; do not replace the current action's picture.
   if(current.nowMs<ready)return;
   const crouch=held.current.crouch;
   timeline.current.predict(typeof id==='string'?id:crypto.randomUUID(),current.player,current.nowMs,crouch?'body':'head',crouch);
   predictedReady.current=current.nowMs+current.state.rules.windupMs+current.state.rules.activeMs+current.state.rules.attackRecoveryMs;
 };
 const layout=()=>{
  const a=app.current;if(!a)return;
  const p=latest.current;const time=clock.current.now+Math.max(0,performance.now()-clock.current.performance);
  const host=a.canvas.parentElement;if(host&&host.clientWidth>0&&host.clientHeight>0&&(a.screen.width!==host.clientWidth||a.screen.height!==host.clientHeight))a.renderer.resize(host.clientWidth,host.clientHeight);
  const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false;
  const scale=Math.min((a.screen.width-16)/580,a.screen.height*.84/512);
  const baseline=Math.min(a.screen.height*.9,a.screen.height*.6+405*scale*.5);
  const positions=fightPositionsAt(p.state,time);
  fighters.current.forEach((fighter,side)=>{
   const index=(side===0?p.player:1-p.player) as 0|1;
   const visual=timeline.current.frame(p.state,index,time);
   const posture=getFightPosture(p.state,index,time);
   if(index===p.player&&time>=Math.max(posture.readyAtMs,predictedReady.current)&&p.state.hp[index]>0&&!visual.reaction){
     visual.pose=held.current.crouch?(held.current.guard&&posture.guardUnits>0?'crouch_block':'crouch'):(held.current.guard&&posture.guardUnits>0?'block_head':'idle');
   }
   const x=a.screen.width*(p.player===0?positions[index]:1-positions[index])+(side===0?-8:8);
   fighter.view.position.set(fightEntranceX(a.screen.width,side as 0|1,p.state.phaseId,p.state.phaseStartedAtMs,time,reduced,scale,x),baseline);
   const margin=130*scale+12;if(reduced||p.state.phaseId!==0||time>=p.state.phaseStartedAtMs)fighter.view.x=Math.max(margin,Math.min(a.screen.width-margin,fighter.view.x));
   fighter.update(visual.pose,scale*384,scale*512,reduced,visual.reaction,undefined,visual.pose==='lose'?Math.min(1,Math.max(0,(time-(p.state.endedAtMs??time)-200)/350)):undefined,visual.motion,visual.recovery);
  });
 };
 const layoutRef=useRef(layout);layoutRef.current=layout;
 useEffect(()=>{let frame=0;const tick=()=>{layoutRef.current();frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);return()=>{cancelAnimationFrame(frame);app.current=null;fighters.current=[];};},[]);
 return <section className="fight-scene fight-scene--responsive" aria-label="Драка"><div className="fight-stage"><div className="fight-scoreboard game-scoreboard game-scoreboard--stable-surface"><div className="fight-scoreboard__row game-scoreboard__row">
 {([player,other] as const).map((index,side)=><div key={index} className={`fight-health fight-health--${side} game-scoreboard__metric`} aria-label={`${side===0?'Ты':'Соперник'}: ${state.hp[index]} HP`}>
 <UserAvatar avatarUrl={(side===0?currentPlayer:opponent)?.avatarUrl} name={(side===0?currentPlayer:opponent)?.name??(side===0?'Ты':'Соперник')} size={32} alt={side===0?'Аватар текущего игрока':'Аватар соперника'}/>
 <span className="fight-health__name game-scoreboard__label">{(side===0?currentPlayer:opponent)?.name??(side===0?'Ты':'Соперник')}</span>
 <div className="fight-health__pips" aria-hidden="true">{Array.from({length:state.rules.initialHp},(_,i)=><i key={i} className={i<state.hp[index]?'is-filled':''}/>)}</div>
 <div className="fight-guard-pips" aria-label={`Запас блока: ${getFightPosture(state,index,nowMs).guardUnits} из 3`}>{[0,1,2].map(i=><i key={i} className={i<getFightPosture(state,index,nowMs).guardUnits?'is-filled':''}/>)}</div></div>)}
 <div className="fight-timer game-scoreboard__metric game-scoreboard__metric--timer" role="timer"><span className="game-scoreboard__label">Время</span><strong className="game-scoreboard__value">{Math.max(0,Math.ceil(((nowMs<state.phaseStartedAtMs?state.phaseStartedAtMs:state.deadlineMs)-nowMs)/1000))}</strong>{(nowMs<state.phaseStartedAtMs||state.status==='sudden_death')&&<small>{nowMs<state.phaseStartedAtMs?'Старт':'Решающий удар'}</small>}</div></div></div>
 <div className="fight-arena"><PixiStage onResize={layout} onReady={a=>{app.current=a;void Assets.load([...FIGHT_ASSETS]).then(()=>{if(app.current!==a)return;fighters.current=([0,1] as const).map(side=>{const f=new Fighter(side);a.stage.addChild(f.view);return f;});layoutRef.current();}).catch(()=>{if(app.current===a)setFailed(true);});}}/>{failed&&<p className="fight-notice" role="status">Игроки не загрузились.</p>}</div></div>
 <ResponsiveFightControls disabled={disabled} onInput={setInput} onAttack={attack} inRange={fightInRange(state,nowMs)} reset={reset}/></section>;
}
