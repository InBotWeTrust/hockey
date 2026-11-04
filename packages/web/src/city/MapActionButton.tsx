import {Check} from 'lucide-react';
import type {ReactNode} from 'react';
import './map-actions.css';
export function MapActionButton({label,note,timer,progress,icon,count=0,done=false,onClick}:{label:string;note?:string;timer?:string;progress?:string;icon:ReactNode;count?:number;done?:boolean;onClick:()=>void}){
 const timerValue=timer?.match(/\d+:\d{2}(?::\d{2})?/)?.[0];
 return <button type="button" className={`map-action${done?' is-done':''}`} aria-label={`${label}${done?' – завершено':''}${count>0?`, событий: ${count}`:''}`} onClick={onClick}>
  <span className="map-action-art">{icon}{!done&&progress&&<span className="map-action-progress">{progress}</span>}{count>0&&<b>{count>99?'99+':count}</b>}{done&&<em><Check size={11}/></em>}</span>
  <span className="map-action-title">{label}</span>
  {!done&&(note||timerValue)&&<span className="map-action-note map-action-summary">
   {note&&<span>{note}</span>}
   {timerValue&&<span role="timer" aria-label={timer}>{timerValue}</span>}
  </span>}
 </button>;
}
