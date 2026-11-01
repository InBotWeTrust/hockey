import {Check} from 'lucide-react';
import type {ReactNode} from 'react';
import './map-actions.css';
export function MapActionButton({label,note,timer,icon,count=0,done=false,onClick}:{label:string;note?:string;timer?:string;icon:ReactNode;count?:number;done?:boolean;onClick:()=>void}){
 return <button type="button" className={`map-action${done?' is-done':''}`} aria-label={`${label}${done?' – завершено':''}${count>0?`, событий: ${count}`:''}`} onClick={onClick}><span className="map-action-art">{icon}{count>0&&<b>{count>99?'99+':count}</b>}{done&&<em><Check size={11}/></em>}</span><span className="map-action-title">{label}</span>{!done&&note&&<span className="map-action-note">{note}</span>}{!done&&timer&&<span className="map-action-timer" role="timer">{timer}</span>}</button>;
}
