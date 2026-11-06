import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Target,X} from 'lucide-react';
import type {WeeklyChallenge} from '../api/weeklyChallenge.js';
import {MapActionButton} from './MapActionButton.js';
import {useGameWindowPosition} from './useGameWindowPosition.js';
import './map-actions.css';
import './floating-games.css';
import './map-weekly-window.css';

export function MapWeeklyChallenge({challenge,onOpen,owner}:{challenge:WeeklyChallenge|null|undefined;onOpen:()=>void;owner?:string|undefined}){
 const [open,setOpen]=useState(false);
 const closeButton=useRef<HTMLButtonElement>(null);
 const trigger=useRef<HTMLDivElement>(null);
 const available=Boolean(challenge?.status==='running'&&!challenge.rewardClaimedAt);
 const {handleProps,cardStyle}=useGameWindowPosition(owner,open&&available,'floating-challenge-window-v1');
 useEffect(()=>{if(!available)setOpen(false);},[available]);
 useEffect(()=>{if(open)closeButton.current?.focus({preventScroll:true});},[open]);
 if(!available||!challenge)return null;
 const completed=challenge.tasks.filter(task=>task.completed).length;
 const close=()=>{setOpen(false);trigger.current?.querySelector('button')?.focus({preventScroll:true});};
 const visit=()=>{setOpen(false);onOpen();};
 return <>
  <div ref={trigger} className="map-weekly-action">
   <MapActionButton label="Челлендж" progress={`${completed}/${challenge.tasks.length}`} icon={<Target/>} onClick={()=>open?close():setOpen(true)}/>
  </div>
  {open&&createPortal(<div className="floating-games-layer" style={{alignItems:'center'}}>
   <section role="dialog" aria-modal="false" aria-label="Недельный челлендж" className="glass floating-games-window map-weekly-window" style={cardStyle} onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();close();}}}>
    <button {...handleProps} type="button" className="floating-games-window__handle" aria-label="Переместить окно челленджа"><span aria-hidden="true"/></button>
    <div className="modal-header map-weekly-window__header">
     <h2 className="modal-title">Недельный челлендж</h2>
     <button ref={closeButton} type="button" className="icon-btn" aria-label="Закрыть челлендж" onClick={close}><X size={18}/></button>
    </div>
    <div className="map-weekly-body">{challenge.tasks.map(task=><button type="button" className="map-weekly-task" key={task.id} onClick={visit}><span>{task.title}</span><strong>{task.progress??0}/{task.target}</strong><span className="map-weekly-track"><i style={{width:`${task.target>0?Math.min(100,(task.progress??0)/task.target*100):0}%`}}/></span></button>)}{challenge.canClaimReward&&<button type="button" className="btn btn--cta" onClick={visit}>Забрать</button>}</div>
   </section>
  </div>,document.body)}
 </>;
}
