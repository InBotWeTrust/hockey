import {ArrowLeft} from 'lucide-react';
import {useEffect,useRef,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {ApiError} from '../api/apiFetch.js';
import {staffRoomEvent,type StaffRoomState} from './staffRoomApi.js';
import {OlegFightPanel} from './OlegFightPanel.js';
import './bar-staff-room.css';

export function BarStaffRoom() {
 const navigate=useNavigate();
 const [attempt,setAttempt]=useState(0);
 const [state,setState]=useState<StaffRoomState|null>(null);
 const [error,setError]=useState(false);
 const [warning,setWarning]=useState(false);
 const entry=useRef(crypto.randomUUID());
 const warnPending=useRef(false);
 const active=useRef(true);
 const [roomLoaded,setRoomLoaded]=useState(false);
 const [pose,setPose]=useState<'first'|'second'>('first');
 const [framesLoaded,setFramesLoaded]=useState([false,false]);
 useEffect(()=>{
  active.current=true;
  let disposed=false;
  setError(false);
  void staffRoomEvent('enter',entry.current).then(next=>{if(!disposed)setState(next);}).catch(error=>{if(!disposed){if(error instanceof ApiError&&error.code==='bar_closed')navigate('/sections',{replace:true});else setError(true);}});
  return()=>{disposed=true;active.current=false;};
 },[attempt]);
 const showOleg=()=>navigate('/bar',{replace:true,state:{staffRoomWarning:true}});
 const warn=async()=>{
  if(warnPending.current)return;
  warnPending.current=true;setWarning(true);setError(false);
  try{const next=await staffRoomEvent('warn',entry.current);if(active.current){if(next.phase==='warning')showOleg();else setState(next);}}
  catch(error){if(active.current){if(error instanceof ApiError&&error.code==='staff_room_not_ready'){setWarning(false);setState(null);setAttempt(v=>v+1);}else setError(true);}}
  finally{warnPending.current=false;}
 };
 const warnRef=useRef(warn);warnRef.current=warn;
 useEffect(()=>{
  if(state?.phase==='warning'){showOleg();return;}
  if(state?.phase!=='scene'||!roomLoaded||!framesLoaded.every(Boolean)||warning)return;
  setPose('first');
  const reaction=setTimeout(()=>setPose('second'),1000);
  const timer=setTimeout(()=>void warnRef.current(),3000);
  return()=>{clearTimeout(reaction);clearTimeout(timer);};
 },[state?.phase,roomLoaded,framesLoaded,warning]);
 const back=()=>{
  active.current=false;
  if(!warnPending.current)void staffRoomEvent('leave',entry.current).catch(()=>{});
  const slot=sessionStorage.getItem('bar-staff-return-slot');
  if(slot)sessionStorage.setItem('bar-active-slot',slot);
  navigate('/bar',{replace:true});
 };
 if(state?.phase==='fight'&&state.fightId)return <OlegFightPanel id={state.fightId} onDone={access=>{
  if(access.blockedUntil){navigate('/sections',{replace:true});return;}
  back();
 }}/>;
 return <main className="bar-staff-room" aria-label="Кабинет директора" data-staff-room-phase={warning?'warning':state?.phase??'loading'} data-staff-room-pose={!warning&&state?.phase==='scene'?pose:undefined}>
  <picture className="bar-staff-room__background">
   <source media="(orientation:landscape)" srcSet="/bar/city-v3/director-office-wide-v1.webp"/>
   <img src="/bar/city-v3/director-office-portrait-v1.webp" alt="Кабинет директора: книжные полки, рабочий стол и свободное место в центре" draggable={false} onLoad={()=>setRoomLoaded(true)} onError={()=>setError(true)}/>
  </picture>
  {state?.phase==='scene'&&<div className="bar-staff-room__elina" data-pose={pose}>
   {[1,2].map((frame,index)=><img key={frame} className={`bar-staff-room__frame bar-staff-room__frame--${frame}`} src={`/bar/city-v3/elina-office-frame-${frame}-v1.webp`} alt={`Элина — ${frame===1?'первый':'второй'} кадр`} draggable={false} onLoad={()=>setFramesLoaded(previous=>previous[index]?previous:previous.map((loaded,i)=>i===index||loaded))} onError={()=>setError(true)}/>)}
  </div>}
  <header className="bar-staff-room__header bonus-games-catalog__header"><button className="icon-btn catalog-header-back" type="button" aria-label="Вернуться в бар" onClick={back}><ArrowLeft size={16}/></button><h1 className="bonus-games-catalog__title screen-title-on-arena">Кабинет</h1></header>
  {error&&<div className="bar-staff-room__status" role="alert">Не удалось проверить доступ. <button className="btn" onClick={()=>warning?void warn():setAttempt(v=>v+1)}>Повторить</button></div>}
 </main>;
}
