import {useBarInvitation, type PendingBarInvitation} from './useBarInvitation.js';
import {BarAvatarDock} from './BarAvatarDock.js';
import { BarObjectGlow } from './BarObjectGlow.js';
import { BarGameHotspots } from './BarGameHotspots.js';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, X } from 'lucide-react';
import {
  barActionsFor,
  isBarAssetPath,
  type BarLayout,
  type BarOccupantId,
  type BarAction,
} from '@hockey/game-core';
import { CharacterEmotionFigure } from './CharacterEmotionFigure.js';
import {barParts, barInterior} from './barArtwork.js';
import {useBarLighting} from './barLighting.js';
import type {CharacterExpression} from './characterEmotion.js';
import { CharacterGesture } from './characterGesture.js';
import { CharacterHitArea } from './CharacterHitArea.js';
import { BarGamesLobby } from './games/BarGamesLobby.js';
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
  onStaffRoom,
  activityCounts = {},
}: {
  activityCounts?: Partial<Record<BarOccupantId, number>>;
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
  onStaffRoom?: (slotId: string) => void;
}) {
  const incident = useRef(onPhysicalIncident);
  const lighting = useBarLighting('interior');
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
  const incomingInvitation=useBarInvitation(slot.occupantId==='online'&&!hideIdentity);
  const [terminalInvitation,setTerminalInvitation]=useState<PendingBarInvitation|null>(null);
  const openedInvitation=useRef<string|null>(null);
  const terminalDismissed=useRef(false);
  useEffect(()=>{setTerminalOpen(false);setTerminalInvitation(null);openedInvitation.current=null;terminalDismissed.current=false;},[activeSlotId]);
  useEffect(()=>{
    if(slot.occupantId!=='online'||!incomingInvitation||openedInvitation.current===incomingInvitation.id)return;
    openedInvitation.current=incomingInvitation.id;
    setTerminalInvitation(incomingInvitation);
    if(!terminalDismissed.current)setTerminalOpen(true);
  },[slot.occupantId,incomingInvitation]);
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const start = useRef<{ x: number; y: number } | null>(null);
  const doorPointer = useRef<{x: number; y: number; moved: boolean} | null>(null);
  const suppressDoorClick = useRef(false);
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
      <div className="bar-space__track">
        {lighting.previous && barParts.map((part, i) => <img key={`previous-${part}`} className={`bar-space__background bar-space__background--${part}`} src={barInterior(part, lighting.previous!)} alt="" draggable={false} style={{left: `${i * 40}%`}}/>)}
        {barParts.map((part, i) => (
          <img
            key={`${part}-${lighting.phase}`}
            className={`bar-space__background bar-space__background--${part}${lighting.previous ? ' bar-space__background--enter' : ''}`}
            src={barInterior(part, lighting.phase)}
            alt=""
            draggable={false}
            style={{ left: `${i * 40}%` }}
          />
        ))}
        {layout.slots.map((s, i) => {
          const composition = s.occupantId ? layout.profiles[s.occupantId].composition : null;
          const shrinkCharacter = barCharacters.includes(s.occupantId as BarCharacter);
          const figureScale = s.scale * (s.occupantId === 'broadcasts' || shrinkCharacter ? 0.9 : 1);
          const figureTop = s.y + (shrinkCharacter ? s.scale * 10 * (1 - s.y / 100) : 0);
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
                    width: `${figureScale * 100}%`,
                    height: `${figureScale * 100}%`,
                    left: `${s.x}%`,
                    top: `${figureTop}%`,
                    transform: `translate(-${s.x}%,-${s.y}%)`,
                  }}
                />
              )}

              {onPhysicalIncident && !hideIdentity && s.id===activeSlotId && s.occupantId && barCharacters.includes(s.occupantId as BarCharacter) && isBarAssetPath(composition) && !failedImages.includes(composition) && (
                <CharacterHitArea onGame={s.occupantId === 'oleg' ? () => onAction('armwrestling','oleg') : undefined} onSwipe={move} character={s.occupantId as BarCharacter} x={s.x} y={s.y} style={{width:`${figureScale*100}%`,height:`${figureScale*100}%`,left:`${s.x}%`,top:`${figureTop}%`,transform:`translate(-${s.x}%,-${s.y}%)`}}/>
              )}
            </div>
          );
        })}
        {!hideIdentity && <BarObjectGlow character={slot.occupantId} />}
        {!hideIdentity && <BarGameHotspots onAction={onAction} onSwipe={move} />}
      {index === layout.slots.length - 1 && !hideIdentity && onStaffRoom && <button className="bar-space__service-door-hit" type="button" aria-label="Открыть служебную дверь"
        onPointerDown={e => {e.stopPropagation(); suppressDoorClick.current = false; doorPointer.current = {x: e.clientX, y: e.clientY, moved: false}; e.currentTarget.setPointerCapture?.(e.pointerId);}}
        onPointerMove={e => {e.stopPropagation(); const p = doorPointer.current; if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 12) p.moved = true;}}
        onPointerUp={e => {e.stopPropagation(); const p = doorPointer.current; doorPointer.current = null; if (!p) return; suppressDoorClick.current = p.moved || Math.hypot(e.clientX - p.x, e.clientY - p.y) > 12; const dx = e.clientX - p.x; if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(e.clientY - p.y) * 1.3) move(dx < 0 ? 1 : -1);}}
        onPointerCancel={() => {doorPointer.current = null; suppressDoorClick.current = true;}}
        onTouchStart={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()}
        onClick={() => {if (suppressDoorClick.current) {suppressDoorClick.current = false; return;} onStaffRoom(slot.id);}}/>}

      </div>
      {!hideIdentity && (slot.occupantId==='online'||slot.occupantId==='broadcasts') && <button className="bar-space__object-hit" aria-label={slot.occupantId==='online'?'Открыть терминал':'Открыть трансляции'} onClick={()=>{if(slot.occupantId==='online')setTerminalOpen(true);else onAction('broadcasts','broadcasts');}}/>}
      <header className="bar-space__header bonus-games-catalog__header">
        {onBack && (
          <button className="icon-btn catalog-header-back" aria-label="Назад" onClick={onBack}>
            <ArrowLeft size={16} />
          </button>
        )}
        <h1 className="bonus-games-catalog__title screen-title-on-arena">Бар «4-й период»</h1>
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
      {!hideIdentity && slot.occupantId === 'online' && terminalOpen && <section className="bar-space__actions bar-space__actions--terminal" aria-label="Играть онлайн">
        <div className="bar-terminal-header"><span>Играть онлайн</span><button className="icon-btn" aria-label="Закрыть терминал" onClick={()=>{terminalDismissed.current=true;setTerminalOpen(false);}}><X size={19} strokeWidth={1.5}/></button></div>
        <BarGamesLobby key={terminalInvitation?.id ?? 'manual'} initial={terminalInvitation?.kind ?? 'cards'} embedded />
      </section>}
      <div className={`bar-bottom-chrome${terminalOpen ? ' bar-bottom-chrome--terminal-open' : ''}`} hidden={hideIdentity}>
      <section ref={panel} className="bar-space__actions" aria-live="polite" hidden={hideIdentity || terminalOpen}>
        {isUnfinished(slot.occupantId) ? (
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
      {!hideIdentity && <BarAvatarDock layout={layout} activeSlotId={activeSlotId} activityCounts={activityCounts} onSelectSlot={onSelectSlot}/>}
      </div>
    </main>
  );
}
