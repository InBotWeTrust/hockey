import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { formatRussianCount } from '../lib/russianPlural.js';
import { characterDetails } from './characterDetails.js';
import { MessageCircle, Gamepad2, Play, X } from 'lucide-react';
import { isBarAssetPath, type BarProfile, type BarAction } from '@hockey/game-core';
export function BarIdentityPanel({ profile, characterId, actions, onAction, onTalk, conversationStarted=false }: {
 profile:BarProfile; characterId?:string; actions:BarAction[]; onAction:(action:BarAction)=>void; onTalk?:()=>void; conversationStarted?:boolean;
}) {
 const [expanded,setExpanded]=useState(false);
 const details=characterId?characterDetails[characterId]:undefined;
 const close=useRef<HTMLButtonElement>(null);
 useEffect(()=>{
  if(!expanded)return;
  const previous=document.activeElement as HTMLElement|null;
  close.current?.focus();
  const escape=(e:KeyboardEvent)=>{if(e.key==='Escape')setExpanded(false);};
  document.addEventListener('keydown',escape);
  return ()=>{document.removeEventListener('keydown',escape);previous?.focus();};
 },[expanded]);
 return <>
  <div className="bar-identity-row">
   <button className="bar-identity" aria-label={`О персонаже: ${profile.name}`} aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}>
    <span className="bar-identity__text"><span className="bar-identity__name" role="heading" aria-level={2}>{profile.name}</span>{profile.role&&<span className="bar-identity__role">{profile.role}</span>}</span>
   </button>
   <div className="bar-identity__icon-actions">
    <button className="icon-btn" aria-label="Подробнее" title="Подробнее" onClick={()=>setExpanded(true)}><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 8a4 4 0 0 1 8 0c0 3-4 3-4 6"/><path d="M12 18h.01"/></svg></button>
    {onTalk&&<button className="icon-btn" aria-label={conversationStarted?'Продолжить разговор':'Разговор'} title="Разговор" onClick={onTalk}><MessageCircle size={19} strokeWidth={1.5}/></button>}
    {actions.map(action=><button key={action} className="icon-btn" aria-label={action==='online'?'Найти соперников':action==='broadcasts'?'Смотреть трансляции':'Игры'} title={action==='broadcasts'?'Трансляции':'Игры'} onClick={()=>onAction(action)}>{action!=='online'&&action!=='broadcasts'?<Gamepad2 size={19} strokeWidth={1.5}/>:<Play size={19} strokeWidth={1.5}/>}</button>)}
   </div>
  </div>
  {expanded&&createPortal(<div className="modal-backdrop bar-detail-backdrop" onClick={()=>setExpanded(false)}>
    <section className="modal-card bar-detail-card" role="dialog" aria-modal="true" aria-labelledby="bar-detail-title" onClick={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==='Tab'){e.preventDefault();close.current?.focus();}}}>
     <div className="modal-header"><h2 id="bar-detail-title" className="modal-title">{profile.name}</h2><button ref={close} className="icon-btn" aria-label="Закрыть описание" onClick={()=>setExpanded(false)}><X size={19} strokeWidth={1.5}/></button></div>
     {isBarAssetPath(profile.avatar)&&<span className="bar-detail-portrait" data-character={characterId}><img src={profile.avatar} alt={profile.name}/></span>}
     <p className="bar-detail-meta">{[profile.role,details?formatRussianCount(details.age,'год','года','лет'):null].filter(Boolean).join(' · ')}</p>
     <p className="modal-copy">{details?.description??profile.description}</p>
    </section>
   </div>,document.body)}
 </>;
}
