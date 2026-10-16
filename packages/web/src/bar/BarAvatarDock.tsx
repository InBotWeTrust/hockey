import {useEffect,useRef,useState} from 'react';
import {Gamepad2,Newspaper,Tv} from 'lucide-react';
import {isBarAssetPath,type BarLayout,type BarOccupantId} from '@hockey/game-core';
import './bar-panorama.css';
export function BarAvatarDock({layout,activeSlotId,activityCounts={},onSelectSlot}:{layout:BarLayout;activeSlotId?:string;activityCounts?:Partial<Record<BarOccupantId,number>>;onSelectSlot:(id:string)=>void}) {
  const [dockFocus, setDockFocus] = useState<string | null>(null);
  const dockStart = useRef<{x:number;y:number;dragged:boolean}|null>(null);
  const dock = useRef<HTMLElement>(null);
  useEffect(() => {
    dock.current?.querySelector('[aria-current="page"]')?.scrollIntoView?.({block:'nearest',inline:'nearest',behavior:'smooth'});
  }, [activeSlotId]);
  return <nav ref={dock} className="bar-avatar-dock" aria-label="Места в баре"
        onTouchStart={e=>e.stopPropagation()} onTouchEnd={e=>e.stopPropagation()}
        onPointerDown={e=>{e.stopPropagation();dockStart.current={x:e.clientX,y:e.clientY,dragged:false};}}
        onPointerMove={e=>{
          e.stopPropagation();
          const start=dockStart.current;
          if(start && Math.hypot(e.clientX-start.x,e.clientY-start.y)>10) start.dragged=true;
          const buttons=Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button[data-slot]'));
          const closest=buttons.reduce<HTMLButtonElement|null>((best,button)=>{
            const box=button.getBoundingClientRect(), old=best?.getBoundingClientRect();
            return !old || Math.abs(e.clientX-(box.left+box.width/2))<Math.abs(e.clientX-(old.left+old.width/2))?button:best;
          },null);
          if(e.pointerType==='mouse'||start)setDockFocus(closest?.dataset.slot??null);
        }}
        onPointerUp={e=>{e.stopPropagation();setDockFocus(null);}}
        onPointerCancel={()=>{dockStart.current=null;setDockFocus(null);}}
        onPointerLeave={()=>setDockFocus(null)}>
        {layout.slots.map((s,i)=>{
          const p=s.occupantId?layout.profiles[s.occupantId]:null;
          const focused=dockFocus===s.id;
          return <button key={s.id} data-slot={s.id} className={`bar-avatar-dock__item${focused?' is-focused':''}`}
            aria-label={p?.name??`Персонаж в разработке, страница ${i+1}`} aria-current={activeSlotId===s.id?'page':undefined}
            onFocus={()=>setDockFocus(s.id)} onBlur={()=>setDockFocus(null)}
            onClick={()=>{const dragged=dockStart.current?.dragged;dockStart.current=null;if(!dragged)onSelectSlot(s.id);}}>
            <span className="bar-avatar-dock__portrait" data-character={s.occupantId??undefined}>
              {isBarAssetPath(p?.avatar??null)?<img src={p!.avatar!} alt="" draggable={false}/>:s.occupantId==='online'?<Gamepad2 size={20} strokeWidth={1.5}/>:s.occupantId==='broadcasts'?<Tv size={20} strokeWidth={1.5}/>:s.occupantId==='news'?<Newspaper/>:<span>{p?.name.slice(0,1)??'?'}</span>}
            </span>
            {s.occupantId && (activityCounts[s.occupantId] ?? 0) > 0 && <small className="bar-avatar-dock__badge" aria-label={`Ожидающие игры: ${activityCounts[s.occupantId]}`}>{activityCounts[s.occupantId]! > 99 ? '99+' : activityCounts[s.occupantId]}</small>}
            <span className="bar-avatar-dock__label">{p?.name??'В разработке'}</span>
          </button>;
        })}
      </nav>;
}
