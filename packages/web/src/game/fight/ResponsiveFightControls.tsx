import { useEffect,useRef,useState } from 'react';
import { neutralFightInput,type FightHeldInput } from '@hockey/game-core';
import { FightHeldControls,type FightControl } from './fightHeldControls.js';
export function ResponsiveFightControls({disabled,onInput,onAttack,inRange,reset}:{disabled:boolean;onInput:(input:FightHeldInput)=>void;onAttack:()=>void;inRange:boolean;reset:number}):JSX.Element{
 const controls=useRef(new FightHeldControls());const callback=useRef(onInput);callback.current=onInput;
 const [held,setHeld]=useState<FightHeldInput>(neutralFightInput());
 const publish=()=>{const next=controls.current.input;setHeld(next);callback.current(next);};
 useEffect(()=>{const clear=()=>{const current=controls.current.input;controls.current.clear();setHeld(neutralFightInput());if(current.direction||current.crouch||current.guard)callback.current(neutralFightInput());};const hidden=()=>{if(document.hidden)clear();};window.addEventListener('blur',clear);document.addEventListener('visibilitychange',hidden);return()=>{clear();window.removeEventListener('blur',clear);document.removeEventListener('visibilitychange',hidden);};},[]);
 useEffect(()=>{const current=controls.current.input;controls.current.clear();setHeld(neutralFightInput());if(current.direction||current.crouch||current.guard)callback.current(neutralFightInput());},[disabled,reset]);
 const button=(control:FightControl,label:string,text:string,index:number)=><button key={control} type="button" className={`btn btn--cta fight-held fight-held--${control}`} disabled={disabled} aria-label={label} aria-pressed={control==='down'?held.crouch:control==='guard'?held.guard:held.direction===(control==='left'?-1:1)}
 onPointerDown={e=>{e.preventDefault();e.currentTarget.setPointerCapture?.(e.pointerId);controls.current.press(e.pointerId,control);publish();}}
 onPointerUp={e=>{controls.current.release(e.pointerId);publish();}}
 onPointerCancel={e=>{controls.current.release(e.pointerId);publish();}}
 onLostPointerCapture={e=>{controls.current.release(e.pointerId);publish();}}
 onKeyDown={e=>{if((e.key===' '||e.key==='Enter')&&!e.repeat){e.preventDefault();controls.current.press(-1-index,control);publish();}}}
 onKeyUp={e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();controls.current.release(-1-index);publish();}}}
 onBlur={()=>{controls.current.release(-1-index);publish();}}>{text}</button>;
 return <div className="fight-responsive-controls" aria-label="Действия в драке"><div className="fight-control-left" aria-label="Движение в драке">{button('left','Двигаться назад','←',0)}{button('right','Двигаться вперёд','→',1)}{button('down','Присесть','↓',2)}</div><div className="fight-control-right">{button('guard','Блок','Блок',3)}<button type="button" className={`btn btn--cta fight-held${inRange?' is-in-range':''}`} disabled={disabled} aria-label="Удар" onClick={onAttack}>Удар</button></div></div>;
}
