import {useEffect,useRef,useState} from 'react';
import {accidentStageAt,createAccident,nextAccidentAt,validAccident,type Accident,type AccidentPhase,type AccidentSchedule} from './accident.js';
export type VisibleAccident={event:Accident;phase:AccidentPhase;sampledAt:number};
export function useCityAccident(owner:string|undefined,upperBusy:boolean,preview=false){
 const busy=useRef(upperBusy);busy.current=upperBusy;
 const [visible,setVisible]=useState<VisibleAccident|null>(null);
 useEffect(()=>{
  const key=`city-accident-v1:${owner??'anonymous'}`;
  let schedule:AccidentSchedule={nextAt:Date.now()+(5+Math.random()*10)*60000,event:null};
  if(!preview)try{
   const saved=JSON.parse(localStorage.getItem(key)??'null') as AccidentSchedule|null;
   if(saved&&Number.isFinite(saved.nextAt)&&saved.nextAt>0&&(saved.event===null||validAccident(saved.event)))schedule=saved;
  }catch{/* Storage is optional. */}
  if(preview)schedule.nextAt=Date.now();
  const save=()=>{if(!preview)try{localStorage.setItem(key,JSON.stringify(schedule));}catch{/* Storage is optional. */}};
  save();
  let timer:ReturnType<typeof setTimeout>|undefined;
  const update=(force=false)=>{
   clearTimeout(timer);
   const now=Date.now();
   if(schedule.event&&now>=schedule.event.end){schedule.event=null;save();}
   if(!schedule.event&&now>=schedule.nextAt&&!document.hidden&&!busy.current&&!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){
    schedule.event=createAccident(now,Math.random,preview);schedule.nextAt=nextAccidentAt(schedule.event);save();
   }
   const event=schedule.event,stage=event?accidentStageAt(event,now):null,phase=stage?.phase;
   // Wake at the exact phase boundary rather than waiting for a polling tick.
   const next=stage&&stage.phase!=='done'?stage.end:Math.max(now+500,schedule.nextAt);
   timer=setTimeout(update,Math.max(1,Math.ceil(next-now)));
   setVisible(previous=>event&&phase&&phase!=='done'?(previous?.event.start===event.start&&previous.phase===phase&&!force?previous:{event,phase,sampledAt:now}):null);
  };
  const visibility=()=>update(true);
  update();
  document.addEventListener('visibilitychange',visibility);window.addEventListener('focus',visibility);
  return()=>{clearTimeout(timer);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('focus',visibility);};
 },[owner,preview]);
 return visible;
}
