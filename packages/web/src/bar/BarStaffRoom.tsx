import {BarConversation} from './BarConversation.js';
import {CharacterEmotionFigure} from './CharacterEmotionFigure.js';
import {emotionFromSnapshot,type CharacterEmotion} from './characterEmotion.js';
import type {ConversationSnapshot} from './conversationApi.js';
import {BarIdentityPanel} from './BarIdentityPanel.js';
import {createDefaultBarLayout} from '@hockey/game-core';
import {BarAvatarDock} from './BarAvatarDock.js';
import {ArrowLeft} from 'lucide-react';
import {useEffect,useRef,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {ApiError} from '../api/apiFetch.js';
import {staffRoomEvent,type StaffRoomState} from './staffRoomApi.js';
import {OlegFightPanel} from './OlegFightPanel.js';
import './bar-staff-room.css';

export function BarStaffRoom() {
 const navigate=useNavigate();
 const previewPose=import.meta.env.DEV&&window.location.pathname.endsWith('/durak-preview.html')?new URLSearchParams(window.location.search).get('office-preview'):null;
 const [attempt,setAttempt]=useState(0);
 const [state,setState]=useState<StaffRoomState|null>(null);
 const [error,setError]=useState(false);
 const [talking,setTalking]=useState(false);
 const [emotion,setEmotion]=useState<CharacterEmotion>('neutral');
 const ejectTimer=useRef<ReturnType<typeof setTimeout>>();
 useEffect(()=>()=>clearTimeout(ejectTimer.current),[]);
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
  if(previewPose==='scene-1'||previewPose==='scene-2'){setPose(previewPose==='scene-1'?'first':'second');return;}
  setPose('first');
  const reaction=setTimeout(()=>setPose('second'),1000);
  const timer=setTimeout(()=>void warnRef.current(),3000);
  return()=>{clearTimeout(reaction);clearTimeout(timer);};
 },[state?.phase,roomLoaded,framesLoaded,warning,previewPose]);
 useEffect(()=>{
  if(state?.phase!=='empty'||!state.warnAfterMs||!roomLoaded||warning)return;
  const timer=setTimeout(()=>void warnRef.current(),state.warnAfterMs);
  return()=>clearTimeout(timer);
 },[state?.phase,state?.warnAfterMs,roomLoaded,warning]);
 useEffect(()=>{
  if(state?.phase!=='seated')return;
  let cancelled=false;
  const refresh=()=>{void staffRoomEvent('enter',entry.current).then(next=>{
   if(cancelled)return;
   if(next.phase!=='seated'||next.day!==state.day){setTalking(false);setEmotion('neutral');}
   setState(next);
  }).catch(()=>{if(!cancelled){setTalking(false);setError(true);}});};
  const visible=()=>{if(!document.hidden)refresh();};
  const timer=setInterval(visible,60000);window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',visible);
  return()=>{cancelled=true;clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',visible);};
 },[state?.phase,state?.day]);
 const back=()=>{
  active.current=false;
  if(!warnPending.current)void staffRoomEvent('leave',entry.current).catch(()=>{});
  const slot=sessionStorage.getItem('bar-staff-return-slot');
  if(slot)sessionStorage.setItem('bar-active-slot',slot);
  navigate('/bar',{replace:true});
 };
 const conversationUpdated=(snapshot:ConversationSnapshot)=>{
  const last=snapshot.turns.at(-1);
  if(last?.officeDay===state?.day)setEmotion(emotionFromSnapshot(snapshot));
  if(last?.officeDay===state?.day&&last?.intervention==='office-eject'&&!ejectTimer.current)ejectTimer.current=setTimeout(back,1500);
 };
 if(state?.phase==='fight'&&state.fightId)return <OlegFightPanel id={state.fightId} onDone={access=>{
  if(access.blockedUntil){navigate('/sections',{replace:true});return;}
  back();
 }}/>;
 return <main className="bar-staff-room" aria-label="Кабинет директора" data-staff-room-phase={warning?'warning':state?.phase??'loading'} data-staff-room-pose={!warning&&state?.phase==='scene'?pose:undefined}>
  <picture className="bar-staff-room__background">
   <source media="(orientation:landscape)" srcSet="/bar/city-v3/director-office-wide-v1.webp"/>
   <img src="/bar/city-v3/director-office-portrait-v2.webp" alt="Кабинет директора: книжные полки, рабочий стол и свободное место в центре" draggable={false} onLoad={()=>setRoomLoaded(true)} onError={()=>setError(true)}/>
  </picture>
  {state?.phase==='scene'&&<div className="bar-staff-room__elina" data-pose={pose}>
   {[1,2].map((frame,index)=><img key={frame} className={`bar-staff-room__frame bar-staff-room__frame--${frame}`} src={`/bar/city-v3/elina-office-frame-${3-frame}-v2.webp`} alt={`Элина — ${frame===1?'первый':'второй'} кадр`} draggable={false} onLoad={()=>setFramesLoaded(previous=>previous[index]?previous:previous.map((loaded,i)=>i===index||loaded))} onError={()=>setError(true)}/>)}
  </div>}
  {(state?.phase==='seated'||state?.phase==='empty')&&<div className="bar-staff-room__seated">
   {state.phase==='seated'?<><CharacterEmotionFigure character="elina" emotion={emotion} fallback="/bar/emotions/elina/neutral-v1.webp" style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'contain',objectPosition:'center bottom'}} onFallbackError={()=>setError(true)}/><button className="bar-staff-room__talk-hit" aria-label="Поговорить с Элиной" onClick={()=>setTalking(true)}/></>:<img className="bar-staff-room__chair" src="/bar/emotions/elina/empty-chair-v1.webp" onError={()=>setError(true)} alt="Пустое кресло Элины" draggable={false}/>}
  </div>}
  {state?.phase==='seated'&&<section className="bar-staff-room__conversation-actions" aria-label="Элина"><div><strong>Элина</strong><span>Владелица бара</span></div><button className="btn btn--cta" onClick={()=>setTalking(true)}>Разговор</button></section>}
  {talking&&state?.phase==='seated'&&<BarConversation character="elina" name="Элина" role="Владелица бара" onClose={()=>setTalking(false)} onUpdate={conversationUpdated}/>}
  <header className="bar-staff-room__header bonus-games-catalog__header"><button className="icon-btn catalog-header-back" type="button" aria-label="Вернуться в бар" onClick={back}><ArrowLeft size={16}/></button><h1 className="bonus-games-catalog__title screen-title-on-arena">Кабинет</h1></header>
  {previewPose?.startsWith('scene-')&&<div className="bar-bottom-chrome bar-staff-room__preview-dock"><section className="bar-space__actions"><BarIdentityPanel profile={{...createDefaultBarLayout().profiles.maria,name:'Элина',role:'Директор'}} actions={['cards']} onTalk={()=>{}} onAction={()=>{}}/></section><BarAvatarDock layout={createDefaultBarLayout()} onSelectSlot={id=>{sessionStorage.setItem('bar-staff-return-slot',id);back();}}/></div>}
  {error&&<div className="bar-staff-room__status" role="alert">Не удалось проверить доступ. <button className="btn" onClick={()=>warning?void warn():setAttempt(v=>v+1)}>Повторить</button></div>}
 </main>;
}
