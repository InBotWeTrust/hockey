import { MapExitLink } from '../components/MapExitLink.js';
import '../components/navigation-geometry.css';
import {useHorizontalPan} from './useHorizontalPan.js';
import {useEffect,useRef,useState} from 'react';
import {Gamepad2,Newspaper,Tv,ArrowLeft} from 'lucide-react';
import {isBarAssetPath,type BarLayout,type BarOccupantId} from '@hockey/game-core';
import './bar-panorama.css';
export function BarAvatarDock({layout,activeSlotId,activityCounts={},onSelectSlot}:{layout:BarLayout;activeSlotId?:string;activityCounts?:Partial<Record<BarOccupantId,number>>;onSelectSlot:(id:string)=>void}) {
  const [dockFocus, setDockFocus] = useState<string | null>(null);
  const dock = useRef<HTMLDivElement>(null);
  const pan=useHorizontalPan(dock);
  const centerActive = (id=activeSlotId) => {
    const el=dock.current,active=Array.from(el?.querySelectorAll<HTMLElement>('[data-slot]')??[]).find(button=>button.dataset.slot===id);
    if(el&&active)el.scrollTo?.({left:active.offsetLeft-el.clientWidth/2+active.offsetWidth/2,behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  };
  useEffect(()=>centerActive(),[activeSlotId]);
  return <nav className="bar-avatar-dock" aria-label="Места в баре">
        <MapExitLink className="bar-avatar-dock__exit"><span><ArrowLeft size={22} aria-hidden="true"/></span><small>Назад</small></MapExitLink>
        <div ref={dock} className="bar-avatar-dock__slots"
        {...pan}
        onPointerLeave={()=>setDockFocus(null)}>
        {layout.slots.map((s,i)=>{
          const p=s.occupantId?layout.profiles[s.occupantId]:null;
          const focused=dockFocus===s.id;
          return <button key={s.id} data-slot={s.id} className={`bar-avatar-dock__item${focused?' is-focused':''}`}
            title={p?.name??'В разработке'} aria-label={p?.name??`Персонаж в разработке, страница ${i+1}`} aria-current={activeSlotId===s.id?'page':undefined}
            onMouseEnter={()=>setDockFocus(s.id)} onMouseLeave={()=>setDockFocus(null)} onFocus={()=>setDockFocus(s.id)} onBlur={()=>setDockFocus(null)}
            onClick={()=>{centerActive(s.id);onSelectSlot(s.id);}}>
            <span className="bar-avatar-dock__portrait" data-character={s.occupantId??undefined}>
              {isBarAssetPath(p?.avatar??null)?<img src={p!.avatar!} alt="" draggable={false}/>:s.occupantId==='online'?<Gamepad2 size={20} strokeWidth={1.5}/>:s.occupantId==='broadcasts'?<Tv size={20} strokeWidth={1.5}/>:s.occupantId==='news'?<Newspaper/>:<span>{p?.name.slice(0,1)??'?'}</span>}
            </span>
            {s.occupantId && (activityCounts[s.occupantId] ?? 0) > 0 && <small className="bar-avatar-dock__badge" aria-label={`Ожидающие игры: ${activityCounts[s.occupantId]}`}>{activityCounts[s.occupantId]! > 99 ? '99+' : activityCounts[s.occupantId]}</small>}
            <span className="bar-avatar-dock__label">{p?.name??'В разработке'}</span>
          </button>;
        })}
        </div>
      </nav>;
}
