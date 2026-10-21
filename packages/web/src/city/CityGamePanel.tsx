import {useEffect,useRef,useState,type ReactNode} from 'react';
import {Gamepad2,ChevronDown,ChevronLeft,ChevronRight,ChevronUp} from 'lucide-react';
import type {ArenaEntry} from '../screens/DailyScreen.js';
import './city-game-panel.css';

export function CityGamePanel({entries,activeIndex,onActiveIndexChange,renderFace,renderActions,openRequest=0,storageKey='city-game-panel-expanded-v1'}:{storageKey?:string;openRequest?:number;entries:ArenaEntry[];activeIndex:number;onActiveIndexChange:(index:number)=>void;renderFace:(entry:ArenaEntry)=>ReactNode;renderActions:(entry:ArenaEntry)=>ReactNode}){
 const [expanded,setExpanded]=useState(()=>{try{return localStorage.getItem(storageKey)==='true';}catch{return false;}});
 useEffect(()=>{try{localStorage.setItem(storageKey,String(expanded));}catch{/* Persistence is optional. */}},[expanded,storageKey]);
 const minimizedKey=`${storageKey}:minimized`;
 const [minimized,setMinimized]=useState(()=>{try{return localStorage.getItem(minimizedKey)==='true';}catch{return false;}});
 useEffect(()=>{try{localStorage.setItem(minimizedKey,String(minimized));}catch{/* Persistence is optional. */}},[minimized,minimizedKey]);
 const swipe=useRef<{id:number;x:number;y:number}|null>(null);
 const blockClickUntil=useRef(0);
 const active=entries[activeIndex]??entries[0];
 const actionable=entries.map((entry,index)=>({entry,index})).filter(({entry})=>entry.attention||((entry.kind==='daily'||entry.kind==='training')&&(entry.dockState==='ready'||entry.dockState==='active'||entry.dockState==='break')));
 const notificationKey=actionable.map(({entry})=>entry.id).sort().join('|');
 const previous=useRef(notificationKey);
 const handledOpen=useRef(0);
 useEffect(()=>{
  if(openRequest<=handledOpen.current)return;handledOpen.current=openRequest;
  const first=entries.map((entry,index)=>({entry,index})).filter(({entry})=>entry.attention).sort((a,b)=>(a.entry.deadlineAt??Infinity)-(b.entry.deadlineAt??Infinity))[0];
  if(first)onActiveIndexChange(first.index);setMinimized(false);setExpanded(true);
 },[openRequest,entries,onActiveIndexChange]);
 const [pulse,setPulse]=useState(false);
 useEffect(()=>{
  if(previous.current===notificationKey)return;
  const old=new Set(previous.current.split('|'));previous.current=notificationKey;
  if(!notificationKey.split('|').some(id=>id&&!old.has(id))){setPulse(false);return;}
  setPulse(true);const timer=setTimeout(()=>setPulse(false),900);return()=>clearTimeout(timer);
 },[notificationKey]);
 if(!active)return null;
 const next=(delta:number)=>onActiveIndexChange((activeIndex+delta+entries.length)%entries.length);
 const openNotification=()=>{
  const first=[...actionable].sort((a,b)=>Number(Boolean(b.entry.attention))-Number(Boolean(a.entry.attention))||(a.entry.deadlineAt??Infinity)-(b.entry.deadlineAt??Infinity))[0];
  if(first)onActiveIndexChange(first.index);setMinimized(false);setExpanded(true);
 };
 // The existing scoreboard owns the timer value; this view only changes its presentation.
 const trainingStatus=active.kind==='training'&&active.meta?`${active.dockState==='done'?'Завершена · ':''}${active.meta}`:null;
 const timer=active.scoreboard?.props as {timer?:string;timerLabel?:string}|undefined;
 if(minimized)return <section className="city-game-minimized glass" aria-label="Мои игры"><button type="button" className="icon-btn city-game-restore" aria-label={`Показать верхнее меню${actionable.length?`, уведомлений: ${actionable.length}`:''}`} aria-expanded={false} onClick={()=>setMinimized(false)}><Gamepad2 aria-hidden="true"/>{actionable.length>0&&<small className="district-badge">{actionable.length>99?'99+':actionable.length}</small>}</button></section>;
 return <section className={`city-game-panel glass${expanded?' is-expanded':''}`} aria-label="Мои игры">
  <div className="city-game-summary">
   <button className="city-game-toggle" aria-label={expanded?'Свернуть игры':'Развернуть игры'} aria-expanded={expanded} aria-controls="city-game-details" onClick={()=>setExpanded(value=>!value)}>
    <span><strong>{active.eyebrow}</strong>{(trainingStatus||active.title!==active.eyebrow||timer?.timer)&&<span className="city-game-status">{trainingStatus??(active.title===active.eyebrow?null:active.title)}{timer?.timer&&<>{active.title===active.eyebrow?'':' · '}<span aria-label={timer.timerLabel}>{timer.timer}</span></>}</span>}</span>
    {expanded?<ChevronUp size={18}/>:<ChevronDown size={18}/>}
   </button>
   {actionable.length>0&&<button className={`icon-btn city-game-notification${pulse?' is-new':''}`} aria-label={`Игры требуют действия: ${actionable.length}`} onClick={openNotification}><Gamepad2 size={18}/><small>{actionable.length>99?'99+':actionable.length}</small></button>}
  </div>
  {expanded&&<div id="city-game-details" className="city-game-details"
    onPointerDown={event=>{swipe.current={id:event.pointerId,x:event.clientX,y:event.clientY};}}
    onPointerMove={event=>{const start=swipe.current;if(start&&Math.abs(event.clientX-start.x)>44&&Math.abs(event.clientX-start.x)>Math.abs(event.clientY-start.y)*1.2)event.currentTarget.setPointerCapture?.(event.pointerId);}}
    onPointerCancel={()=>{swipe.current=null;}}
    onPointerUp={event=>{const start=swipe.current;swipe.current=null;if(!start||start.id!==event.pointerId)return;const dx=event.clientX-start.x,dy=event.clientY-start.y;if(Math.abs(dx)<44||Math.abs(dx)<Math.abs(dy)*1.2)return;event.preventDefault();blockClickUntil.current=performance.now()+500;next(dx<0?1:-1);}}
    onClickCapture={event=>{if(event.detail!==0&&performance.now()<blockClickUntil.current){event.preventDefault();event.stopPropagation();}}}>

   <div className="city-game-carousel"><button className="icon-btn" aria-label="Предыдущая игра" disabled={entries.length<2} onClick={()=>next(-1)}><ChevronLeft size={18}/></button><div className="city-game-position">{entries.length>1&&<div className="city-game-dots" role="group" aria-label="Вкладки игр">{entries.map((entry,index)=><button key={entry.id} type="button" className="city-game-dot" aria-label={`Выбрать ${entry.eyebrow}`} aria-pressed={index===activeIndex} onClick={()=>onActiveIndexChange(index)}/>)}</div>}{active.eyebrowStatus&&<span>{active.eyebrowStatus}</span>}</div><button className="icon-btn" aria-label="Следующая игра" disabled={entries.length<2} onClick={()=>next(1)}><ChevronRight size={18}/></button></div>
   <div className="city-game-face">{renderFace(active)}</div>
   <div className="city-game-actions">{renderActions(active)}</div>
  </div>}
  <button type="button" className="city-game-minimize" aria-label="Свернуть верхнее меню" aria-expanded={true} onClick={()=>setMinimized(true)}><span className="district-navigation-handle" aria-hidden="true"/></button>
 </section>;
}
