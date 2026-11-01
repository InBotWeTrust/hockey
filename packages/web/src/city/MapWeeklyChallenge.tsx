import {useState} from 'react';
import {ChevronDown,Trophy} from 'lucide-react';
import type {WeeklyChallenge} from '../api/weeklyChallenge.js';
import './map-actions.css';
export function MapWeeklyChallenge({challenge,onOpen}:{challenge:WeeklyChallenge|null|undefined;onOpen:()=>void}){
 const [expanded,setExpanded]=useState(true);
 if(!challenge?.hasProgress||challenge.status!=='running')return null;
 return <aside className="map-weekly"><button className="map-weekly-heading" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}><Trophy size={18}/><span>Недельный<br/><strong>челлендж</strong></span><ChevronDown size={14}/></button>{expanded&&<div className="map-weekly-body">{challenge.tasks.map(task=><button className="map-weekly-task" key={task.id} onClick={onOpen}><span>{task.title}</span><strong>{task.progress??0}/{task.target}</strong><span className="map-weekly-track"><i style={{width:`${task.target>0?Math.min(100,(task.progress??0)/task.target*100):0}%`}}/></span></button>)}{challenge.canClaimReward&&<button className="btn btn--cta" onClick={onOpen}>Забрать</button>}</div>}</aside>;
}
