import { useEffect,useRef,useState,type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, ArrowDown } from 'lucide-react';
import { neutralFightInput,type FightHeldInput } from '@hockey/game-core';
import { FightHeldControls,type FightControl } from './fightHeldControls.js';
export function ResponsiveFightControls({disabled,onInput,onAttack,inRange,reset}:{disabled:boolean;onInput:(input:FightHeldInput)=>void;onAttack:()=>void;inRange:boolean;reset:number}):JSX.Element{
 const controls=useRef(new FightHeldControls());const callback=useRef(onInput);callback.current=onInput;
 const pressTimes=useRef(new Map<number,number>());
 const releases=useRef(new Map<number,ReturnType<typeof setTimeout>>());
 const clearReleases=()=>{for(const timer of releases.current.values())clearTimeout(timer);releases.current.clear();pressTimes.current.clear();};
 const [held,setHeld]=useState<FightHeldInput>(neutralFightInput());
 const lastPublished=useRef<FightHeldInput>(neutralFightInput());
 const publish=()=>{const next=controls.current.input;const previous=lastPublished.current;
  if(next.direction===previous.direction&&next.crouch===previous.crouch&&next.guard===previous.guard)return;
  lastPublished.current=next;setHeld(next);callback.current(next);};
 useEffect(()=>{const clear=()=>{const current=controls.current.input;clearReleases();controls.current.clear();lastPublished.current=neutralFightInput();setHeld(neutralFightInput());if(current.direction||current.crouch||current.guard)callback.current(neutralFightInput());};const hidden=()=>{if(document.hidden)clear();};window.addEventListener('blur',clear);document.addEventListener('visibilitychange',hidden);return()=>{clear();window.removeEventListener('blur',clear);document.removeEventListener('visibilitychange',hidden);};},[]);
 useEffect(()=>{const current=controls.current.input;clearReleases();controls.current.clear();lastPublished.current=neutralFightInput();setHeld(neutralFightInput());if(current.direction||current.crouch||current.guard)callback.current(neutralFightInput());},[disabled,reset]);
 const release=(id:number,cancel=false)=>{
  if(releases.current.has(id)&&!cancel)return;
  const timer=releases.current.get(id);if(timer)clearTimeout(timer);releases.current.delete(id);
  const started=pressTimes.current.get(id);pressTimes.current.delete(id);
  const delay=!cancel&&started!==undefined?Math.max(0,120-(performance.now()-started)):0;
  if(delay>0){releases.current.set(id,setTimeout(()=>{releases.current.delete(id);controls.current.release(id);publish();},delay));}
  else{controls.current.release(id);publish();}
 };
 const button=(control:FightControl,label:string,text:ReactNode,index:number)=><button key={control} type="button" className={`btn btn--cta fight-held fight-held--${control}`} disabled={disabled} aria-label={label} aria-pressed={control==='down'?held.crouch:control==='guard'?held.guard:held.direction===(control==='left'?-1:1)}
 onPointerDown={e=>{e.preventDefault();e.currentTarget.setPointerCapture?.(e.pointerId);const timer=releases.current.get(e.pointerId);if(timer)clearTimeout(timer);releases.current.delete(e.pointerId);if(control==='left'||control==='right')pressTimes.current.set(e.pointerId,performance.now());controls.current.press(e.pointerId,control);publish();}}
 onPointerUp={e=>release(e.pointerId)}
 onPointerCancel={e=>release(e.pointerId,true)}
 onLostPointerCapture={e=>release(e.pointerId)}
 onKeyDown={e=>{if((e.key===' '||e.key==='Enter')&&!e.repeat){e.preventDefault();controls.current.press(-1-index,control);publish();}}}
 onKeyUp={e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();controls.current.release(-1-index);publish();}}}
 onBlur={()=>{controls.current.release(-1-index);publish();}}>{text}</button>;
 return <div className="fight-responsive-controls" aria-label="Действия в драке"><div className="fight-control-left" aria-label="Движение в драке">{button('left','Двигаться назад',<ArrowLeft size={24} strokeWidth={2.5} aria-hidden="true"/>,0)}{button('right','Двигаться вперёд',<ArrowRight size={24} strokeWidth={2.5} aria-hidden="true"/>,1)}{button('down','Присесть',<ArrowDown size={24} strokeWidth={2.5} aria-hidden="true"/>,2)}</div><div className="fight-control-right">{button('guard','Блок','Блок',3)}<button type="button" className={`btn btn--cta fight-held${inRange?' is-in-range':''}`} disabled={disabled} aria-label="Удар" onPointerDown={e=>{e.preventDefault();onAttack();}} onClick={e=>{if(e.detail===0)onAttack();}}>Удар</button></div></div>;
}
