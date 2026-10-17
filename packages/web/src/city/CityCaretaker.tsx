import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {activeCaretakerVisit,caretakerDay,createCaretakerSchedule,type CaretakerKind,type CaretakerSchedule} from './caretakerSchedule.js';
import './city-caretaker.css';
export function useCaretakerVisit(owner:string|undefined,blocked:boolean):CaretakerKind|null{
 const [kind,setKind]=useState<CaretakerKind|null>(null);
 useEffect(()=>{
  const key=`city-caretaker-v1:${owner??'anonymous'}`;
  let schedule:CaretakerSchedule|undefined;
  const read=(now:number)=>{
   try{
    const saved=JSON.parse(localStorage.getItem(key)??'null') as CaretakerSchedule|null;
    if(saved?.day===caretakerDay(now)&&Array.isArray(saved.visits)&&saved.visits.length<=2&&saved.visits.every(v=>Number.isFinite(v.start)&&Number.isFinite(v.end)&&v.end>v.start&&(v.kind==='flood'||v.kind==='scrape')))return saved;
   }catch{/* Storage is optional. */}
   return createCaretakerSchedule(now);
  };
  const update=()=>{
   const now=Date.now();
   if(!schedule||schedule.day!==caretakerDay(now))schedule=read(now);
   const active=activeCaretakerVisit(schedule,now);
   // Once interrupted, this visit stays skipped across navigation and reloads.
   if(blocked&&active)active.skipped=true;
   try{localStorage.setItem(key,JSON.stringify(schedule));}catch{/* Storage is optional. */}
   setKind(blocked?null:activeCaretakerVisit(schedule,now)?.kind??null);
  };
  update();const timer=setInterval(update,10_000);
  window.addEventListener('focus',update);document.addEventListener('visibilitychange',update);
  return()=>{clearInterval(timer);window.removeEventListener('focus',update);document.removeEventListener('visibilitychange',update);};
 },[owner,blocked]);
 return blocked?null:kind;
}
const locations={yard:{x:12,y:54.5},stadium:{x:44,y:65},pro:{x:86,y:65}};
export function CityCaretaker({kind,venue}:{kind:CaretakerKind;venue:keyof typeof locations}){
 const point=kind==='flood'&&venue==='yard'?{x:10.5,y:54.5}:locations[venue];
 const figure=useRef<HTMLDivElement>(null),sprite=useRef<HTMLImageElement>(null);
 useLayoutEffect(()=>{
  const root=figure.current,image=sprite.current,world=root?.parentElement,viewport=world?.parentElement;
  if(kind!=='flood'||!root||!image||!world||!viewport)return;
  let shift=0;
  const update=()=>{
   if(!image.naturalWidth)return;
   const venueX={yard:12.7,stadium:44.8,pro:87}[venue];
   const centeredLeft=Math.max(0,Math.min(world.clientWidth-viewport.clientWidth,world.clientWidth*venueX/100-viewport.clientWidth/2));
   const imageWorldLeft=image.getBoundingClientRect().left-world.getBoundingClientRect().left+shift;
   shift=Math.max(0,imageWorldLeft-centeredLeft+20);
   root.style.setProperty('--caretaker-edge-shift',`${-shift}px`);
  };
  update();image.addEventListener('load',update);
  const observer=typeof ResizeObserver==='undefined'?undefined:new ResizeObserver(update);
  observer?.observe(viewport);observer?.observe(world);observer?.observe(image);
  return()=>{observer?.disconnect();image.removeEventListener('load',update);root.style.removeProperty('--caretaker-edge-shift');};
 },[kind,venue]);
 return <div ref={figure} className={`city-caretaker city-caretaker--${kind}`} style={{left:`${point.x}%`,top:`${point.y}%`}} role="img" aria-label={kind==='flood'?'Григорий заливает лёд':'Григорий чистит снег'}>
  <div className="city-caretaker-step"><img ref={sprite} src={kind==='flood'?'/sprites/city-grigory-flood-long-v4.webp':'/sprites/rink-caretaker-scrape.webp'} alt="" draggable={false}/></div>
 </div>;
}
