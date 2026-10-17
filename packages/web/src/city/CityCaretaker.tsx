import {useEffect,useState} from 'react';
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
 const point=locations[venue];
 return <div className={`city-caretaker city-caretaker--${kind}`} style={{left:`${point.x}%`,top:`${point.y}%`}} role="img" aria-label={kind==='flood'?'Григорий заливает лёд':'Григорий чистит снег'}>
  {kind==='flood'&&<svg className="city-caretaker-ground-hose" viewBox="0 0 1000 300" preserveAspectRatio="none" aria-hidden="true">
   <path d="M-5000 245 C-3500 275 -1800 215 -600 245 S-120 260 0 245 C170 258 300 240 420 205 S530 168 555 147 C580 126 583 104 615 91 S690 75 720 52 C760 25 820 65 870 35 S950 4 1000 0" fill="none" stroke="#233e35" strokeWidth="1.35" strokeLinecap="round" vectorEffect="non-scaling-stroke"/>
  </svg>}
  <div className="city-caretaker-step"><img src={kind==='flood'?'/sprites/city-grigory-flood-hose-v1.webp':'/sprites/rink-caretaker-scrape.webp'} alt="" draggable={false}/></div>
 </div>;
}
