import '../components/navigation-geometry.css';
import { useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { BarGameId } from '@hockey/game-core';
import { AccessibleModal } from '../components/AccessibleModal.js';
import { gameApi } from './games/api.js';
import { apiFetch } from '../api/apiFetch.js';
import { UserAvatar } from '../chat/components/UserAvatar.js';
import { AppToast } from '../components/AppToast.js';
export const BAR_CHALLENGE_GAMES = [ ['darts','Дартс'], ['checkers','Шашки'], ['billiards','Бильярд'], ['ochko','Очко'], ['armwrestling','Армрестлинг'], ['battleship','Морской бой'], ['cards','Карты'] ] as const;
const gamePictures = Object.fromEntries(BAR_CHALLENGE_GAMES.map(([id]) => [id, `/bar/game-thumbnails/${id}-v1.webp`]));
export function BarChallengeButton({ userId, name, avatarUrl }: { userId: string; name: string; avatarUrl: string | null }) {
  const [open,setOpen] = useState(false);
  const [selected,setSelected] = useState<BarGameId | 'cards' | null>(null);
  const [capacities,setCapacities] = useState<number[]>([]);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState<string|null>(null);
  const [sent,setSent] = useState(false);
  const pending = useRef(false);
  const navigate = useNavigate();
  const send = async (kind: BarGameId | 'cards') => {
    if (pending.current || !selected || (kind === 'cards' && !capacities.length)) return;
    pending.current=true;setBusy(true);setError(null);
    try {
      if (kind === 'cards') {
        const result = await apiFetch<{roomId:string}>('/bar/cards/profile-invites', {method:'POST',body:JSON.stringify({userId,capacity:capacities})});
        setOpen(false);navigate(`/bar/cards/room/${encodeURIComponent(result.roomId)}`);
      } else {
        await gameApi.invite(kind,userId);setOpen(false);setSent(true);
      }
    } catch(e) { setError(e instanceof Error?e.message:'Не удалось отправить приглашение.'); }
    finally { pending.current=false;setBusy(false); }
  };
  const close=()=>{if(!pending.current)setOpen(false);};
  return <>
    <button type="button" className="btn btn--ghost" style={{width:'100%',marginTop:8,fontSize:14,letterSpacing:0}} onClick={()=>{setError(null);setSelected(null);setCapacities([]);setOpen(true);}}>Предложить сыграть в баре</button>
    {open && <AccessibleModal title="Игры бара" onClose={close} closeBlocked={busy} cardStyle={{maxHeight:'90dvh'}} headerAction={<button className="icon-btn" aria-label="Закрыть" disabled={busy} onClick={close}><X size={16}/></button>}>
      <div style={{display:'flex',gap:10,alignItems:'center',marginBottom:16}}><UserAvatar avatarUrl={avatarUrl} name={name} size={42} style={{border:'var(--navigation-selected-border)',boxShadow:'var(--navigation-selected-shadow)'}}/><strong>{name}</strong></div>
      <div role="group" aria-label="Игра" style={{display:'grid',gap:8,maxHeight:'48dvh',overflowY:'auto',padding:3,margin:-3}}>
        {BAR_CHALLENGE_GAMES.map(([id,label])=><div key={id} style={{display:'grid',gap:8}}>
          <button className="glass" type="button" aria-pressed={selected===id} disabled={busy} onClick={()=>{setSelected(current=>current===id?null:id);setError(null);}}
            style={{display:'grid',gridTemplateColumns:'40px minmax(0, 1fr) 20px',gap:10,alignItems:'center',borderRadius:18,padding:'10px 12px',textAlign:'left',cursor:'pointer',color:'var(--ink)',boxShadow:selected===id?'inset 0 0 0 2px #1f2a3d':undefined}}>
            <img src={gamePictures[id]} alt="" width={40} height={40} style={{borderRadius:10,objectFit:'cover',border:'1px solid var(--liquid-border)',boxSizing:'border-box'}}/>
            <span style={{fontSize:14,fontWeight:700,whiteSpace:'nowrap'}}>{label}</span>
            <span aria-hidden="true" className={`duel-equipment-option__check${selected===id?' duel-equipment-option__check--selected':''}`}>
              {selected===id&&<Check size={11} strokeWidth={3}/>}
            </span>
          </button>
          {id==='cards' && selected==='cards' && <div style={{padding:'4px 3px 8px'}}>
            <p className="modal-copy" style={{margin:'0 0 8px'}}>Игроков за столом · можно несколько</p>
            <div role="group" aria-label="Размер стола" style={{display:'grid',gridTemplateColumns:'repeat(5, minmax(0, 1fr))',gap:6}}>
              {[2,3,4,5,6].map(n=><button type="button" className="glass" key={n} aria-label={`${n} ${n<5?'игрока':'игроков'}`} aria-pressed={capacities.includes(n)} disabled={busy}
                onClick={()=>setCapacities(current=>current.includes(n)?current.filter(value=>value!==n):[...current,n].sort((a,b)=>a-b))}
                style={{display:'grid',gridTemplateColumns:'minmax(0, 1fr) 20px',alignItems:'center',minHeight:44,minWidth:0,padding:'8px 6px',borderRadius:12,fontSize:13,fontWeight:800,color:'var(--ink)',cursor:'pointer',boxShadow:capacities.includes(n)?'inset 0 0 0 2px #1f2a3d':'none',backdropFilter:'none',WebkitBackdropFilter:'none'}}>
                <span>{n}</span><span aria-hidden="true" className={`duel-equipment-option__check${capacities.includes(n)?' duel-equipment-option__check--selected':''}`}>{capacities.includes(n)&&<Check size={11} strokeWidth={3}/>}</span>
              </button>)}
            </div>
          </div>}
        </div>)}
      </div>
      <p className="modal-copy" style={{marginTop:16}}>Приглашение появится в личном чате.</p>
      {error && <p role="alert" className="modal-copy">{error}</p>}
      <div className="modal-actions"><button className="modal-primary btn btn--cta" style={{fontSize:14,letterSpacing:0}} disabled={busy||!selected||(selected==='cards'&&!capacities.length)} onClick={()=>{if(selected)void send(selected);}}>{busy?'Отправляем…':'Предложить'}</button></div>
    </AccessibleModal>}
    {sent && <AppToast message="Приглашение отправлено" onDismiss={()=>setSent(false)} variant="reward"/>}
  </>;
}
