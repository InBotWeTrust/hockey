import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight, Gamepad2, Newspaper, Tv, X } from 'lucide-react';
import {
  barActionsFor,
  isBarAssetPath,
  type BarLayout,
  type BarOccupantId,
  type BarAction,
} from '@hockey/game-core';
import { CharacterEmotionFigure } from './CharacterEmotionFigure.js';
import type {CharacterExpression} from './characterEmotion.js';
import { CharacterGesture } from './characterGesture.js';
import { CharacterHitArea } from './CharacterHitArea.js';
import { OnlineDurakLobby } from './cards/OnlineDurakLobby.js';
import { BarIdentityPanel } from './BarIdentityPanel.js';
import './bar-panorama.css';
import { barCharacters, type BarCharacter } from './conversationApi.js';
const isUnfinished = (id: BarOccupantId | null | undefined) =>
  !id;
function CharacterSilhouette() {
  return <svg className="bar-space__silhouette" viewBox="0 0 240 480" aria-hidden="true">
    <circle cx="120" cy="65" r="38" />
    <path d="M87 110 Q120 99 153 110 Q180 119 188 155 L211 274 Q213 291 198 294 Q184 296 180 280 L159 190 L160 299 L153 449 Q152 468 136 468 Q121 468 122 450 L120 320 L118 450 Q119 468 104 468 Q88 468 87 449 L80 299 L81 190 L60 280 Q56 296 42 294 Q27 291 29 274 L52 155 Q60 119 87 110 Z" />
  </svg>;
}
export function BarScene({
  layout,
  activeSlotId,
  onSelectSlot,
  onAction,
  onBack,
  preview = false,
  notice,
  onTalk,
  conversationStarted = false,
  hideIdentity = false,
  onPhysicalIncident,
  characterEmotions = {},
}: {
  layout: BarLayout;
  activeSlotId: string;
  onSelectSlot: (id: string) => void;
  onAction: (action: BarAction, id: BarOccupantId) => void;
  onBack?: () => void;
  preview?: boolean;
  notice?: React.ReactNode;
  onTalk?: (character: BarCharacter) => void;
  conversationStarted?: boolean;
  hideIdentity?: boolean;
  onPhysicalIncident?: (character: BarCharacter) => void;
  characterEmotions?:Partial<Record<BarCharacter,CharacterExpression>>;
}) {
  const incident = useRef(onPhysicalIncident);
  incident.current = onPhysicalIncident;
  const target = useRef<BarCharacter | null>(null);
  const [gesture] = useState(() => new CharacterGesture(() => { if (target.current) incident.current?.(target.current); }));
  useEffect(() => { gesture.cancel(); target.current=null; return () => gesture.cancel(); }, [gesture,activeSlotId,hideIdentity]);
  const index = Math.max(
    0,
    layout.slots.findIndex((s) => s.id === activeSlotId),
  );
  const slot = layout.slots[index]!;
  const profile = slot.occupantId ? layout.profiles[slot.occupantId] : null;
  const [terminalOpen, setTerminalOpen] = useState(false);
  useEffect(()=>setTerminalOpen(false),[activeSlotId]);
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const [dockFocus, setDockFocus] = useState<string | null>(null);
  const dockStart = useRef<{x:number;y:number;dragged:boolean}|null>(null);
  const dock = useRef<HTMLElement>(null);
  useEffect(() => {
    dock.current?.querySelector('[aria-current="page"]')?.scrollIntoView?.({block:'nearest',inline:'nearest',behavior:'smooth'});
  }, [activeSlotId]);
  const start = useRef<{ x: number; y: number } | null>(null);
  const panel = useRef<HTMLElement>(null);
  const [panelHeight, setPanelHeight] = useState(190);
  useEffect(() => {
    const el = panel.current;
    if (!el) return;
    const update = () => setPanelHeight(el.getBoundingClientRect().height);
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [profile]);
  const move = (delta: number) =>
    onSelectSlot(layout.slots[Math.max(0, Math.min(9, index + delta))]!.id);
  const finish = (x: number, y: number) => {
    const origin = start.current;
    start.current = null;
    if (!origin) return;
    const dx = x - origin.x;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(y - origin.y) * 1.3) move(dx < 0 ? 1 : -1);
  };
  return (
    <main
      className={`bar-space${preview ? ' bar-space--preview' : ''}`}
      style={{ '--bar-page': index, '--bar-panel-height': `${panelHeight}px` } as CSSProperties}
      onTouchStart={(e) => {
        if ((e.target as HTMLElement).closest('button, .bar-avatar-dock')) return;
        const t = e.touches[0];
        if (t) start.current = { x: t.clientX, y: t.clientY };
      }}
      onTouchEnd={(e) => {
        const t = e.changedTouches[0];
        if (t) finish(t.clientX, t.clientY);
      }}
      onTouchCancel={() => {
        start.current = null;
      }}
      onPointerMove={(e) => gesture.move(e.pointerId,e.clientX,e.clientY)}
      onContextMenu={(e) => { if ((e.target as Element).closest('[data-bar-character]')) e.preventDefault(); }}
      onPointerDown={(e) => {
        const hit=(e.target as Element).closest('[data-bar-character]')?.getAttribute('data-bar-character') as BarCharacter | null;
        if (hit && !hideIdentity) { target.current=hit; gesture.down(e.pointerId,e.clientX,e.clientY); e.currentTarget.setPointerCapture?.(e.pointerId); } else gesture.cancel();
        if (e.pointerType === 'mouse' && !(e.target as HTMLElement).closest('button')) {
          start.current = { x: e.clientX, y: e.clientY };
          e.currentTarget.setPointerCapture?.(e.pointerId);
        }
      }}
      onPointerUp={(e) => {
        gesture.up(e.pointerId);
        if (e.pointerType === 'mouse') finish(e.clientX, e.clientY);
      }}
      onPointerCancel={() => {
        gesture.cancel();
        start.current = null;
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          move(-1);
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          move(1);
        }
      }}
    >
      <div className="bar-space__track" aria-hidden="true">
        {['west', 'middle', 'east'].map((part, i) => (
          <img
            key={part}
            className={`bar-space__background bar-space__background--${part}`}
            src={`/bar/bar-${part}-v1.webp`}
            alt=""
            draggable={false}
            style={{ left: `${i * 40}%` }}
          />
        ))}
        {layout.slots.map((s, i) => {
          const composition = s.occupantId ? layout.profiles[s.occupantId].composition : null;
          return (
            <div key={s.id} className="bar-space__figure" style={{ left: `${i * 10}%` }}>
              {isUnfinished(s.occupantId) ? <CharacterSilhouette /> : isBarAssetPath(composition) && (
                <CharacterEmotionFigure
                  key={s.occupantId}
                  character={preview ? '' : s.occupantId??''}
                  emotion={characterEmotions[s.occupantId as BarCharacter]??'neutral'}
                  fallback={composition}
                  onFallbackError={() =>
                    setFailedImages((current) =>
                      current.includes(composition) ? current : [...current, composition],
                    )
                  }
                  style={{
                    visibility: failedImages.includes(composition) ? 'hidden' : 'visible',
                    objectPosition: `${s.x}% ${s.y}%`,
                    width: `${s.scale * 100}%`,
                    height: `${s.scale * 100}%`,
                    left: `${s.x}%`,
                    top: `${s.y}%`,
                    transform: `translate(-${s.x}%,-${s.y}%)`,
                  }}
                />
              )}

              {onPhysicalIncident && !hideIdentity && s.id===activeSlotId && s.occupantId && barCharacters.includes(s.occupantId as BarCharacter) && isBarAssetPath(composition) && !failedImages.includes(composition) && (
                <CharacterHitArea character={s.occupantId as BarCharacter} x={s.x} y={s.y} style={{width:`${s.scale*100}%`,height:`${s.scale*100}%`,left:`${s.x}%`,top:`${s.y}%`,transform:`translate(-${s.x}%,-${s.y}%)`}}/>
              )}
            </div>
          );
        })}
      </div>
      {!hideIdentity && (slot.occupantId==='online'||slot.occupantId==='broadcasts') && <button className="bar-space__object-hit" aria-label={slot.occupantId==='online'?'Открыть терминал':'Открыть трансляции'} onClick={()=>{if(slot.occupantId==='online')setTerminalOpen(true);else onAction('broadcasts','broadcasts');}}/>}
      <header className="bar-space__header">
        {onBack && (
          <button className="icon-btn" aria-label="Назад" onClick={onBack}>
            <ChevronLeft />
          </button>
        )}
        <h1>Бар «4-й период»</h1>
      </header>
      {notice && <div className="bar-space__notice">{notice}</div>}
      {preview && profile?.composition && failedImages.includes(profile.composition) && (
        <div className="bar-space__notice" role="alert">
          Изображение не загрузилось. Проверь путь к файлу.
        </div>
      )}
      <button
        className="icon-btn bar-space__arrow bar-space__arrow--left"
        aria-label="Предыдущая страница"
        disabled={index === 0}
        onClick={() => move(-1)}
      >
        <ChevronLeft />
      </button>
      <button
        className="icon-btn bar-space__arrow bar-space__arrow--right"
        aria-label="Следующая страница"
        disabled={index === 9}
        onClick={() => move(1)}
      >
        <ChevronRight />
      </button>
      <div className={`bar-bottom-chrome${terminalOpen ? ' bar-bottom-chrome--terminal-open' : ''}`} hidden={hideIdentity}>
      <section ref={panel} className={`bar-space__actions${slot.occupantId === 'online' && terminalOpen ? ' bar-space__actions--terminal' : ''}`} aria-live="polite" hidden={hideIdentity}>
        {slot.occupantId === 'online' && terminalOpen ? <><div className="bar-terminal-header"><span>Играть онлайн</span><button className="icon-btn" aria-label="Закрыть терминал" onClick={()=>setTerminalOpen(false)}><X size={19} strokeWidth={1.5}/></button></div><OnlineDurakLobby embedded /></> : isUnfinished(slot.occupantId) ? (
          <p className="bar-space__development">Персонаж в разработке</p>
        ) : profile ? (
          <BarIdentityPanel
            key={slot.occupantId}
            profile={profile}
            {...(slot.occupantId ? {characterId:slot.occupantId}: {})}
            actions={barActionsFor(slot.occupantId)}
            conversationStarted={conversationStarted}
            {...(onTalk && barCharacters.includes(slot.occupantId as BarCharacter)
              ? { onTalk: () => onTalk(slot.occupantId as BarCharacter) }
              : {})}
            onAction={(action) => {
              if (slot.occupantId==='online') setTerminalOpen(true);
              else if (slot.occupantId) onAction(action, slot.occupantId);
            }}
          />
        ) : (
          <h2>Свободное место</h2>
        )}
      </section>
      {!hideIdentity && <nav ref={dock} className="bar-avatar-dock" aria-label="Места в баре"
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
            aria-label={p?.name??`Персонаж в разработке, страница ${i+1}`} aria-current={index===i?'page':undefined}
            onFocus={()=>setDockFocus(s.id)} onBlur={()=>setDockFocus(null)}
            onClick={()=>{const dragged=dockStart.current?.dragged;dockStart.current=null;if(!dragged)onSelectSlot(s.id);}}>
            <span className="bar-avatar-dock__portrait" data-character={s.occupantId??undefined}>
              {isBarAssetPath(p?.avatar??null)?<img src={p!.avatar!} alt="" draggable={false}/>:s.occupantId==='online'?<Gamepad2 size={20} strokeWidth={1.5}/>:s.occupantId==='broadcasts'?<Tv size={20} strokeWidth={1.5}/>:s.occupantId==='news'?<Newspaper/>:<span>{p?.name.slice(0,1)??'?'}</span>}
            </span>
            <span className="bar-avatar-dock__label">{p?.name??'В разработке'}</span>
          </button>;
        })}
      </nav>}
      </div>
    </main>
  );
}
