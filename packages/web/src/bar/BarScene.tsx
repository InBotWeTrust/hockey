import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight, Monitor, Newspaper, Tv } from 'lucide-react';
import {
  barActionsFor,
  isBarAssetPath,
  type BarLayout,
  type BarOccupantId,
  type BarAction,
} from '@hockey/game-core';
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
}) {
  const index = Math.max(
    0,
    layout.slots.findIndex((s) => s.id === activeSlotId),
  );
  const slot = layout.slots[index]!;
  const profile = slot.occupantId ? layout.profiles[slot.occupantId] : null;
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const [previewSlot, setPreviewSlot] = useState<string | null>(null);
  const places = useRef<HTMLElement>(null);
  const scrubPointer = useRef<number | null>(null);
  const previewAt = (clientY: number) => {
    const bounds = places.current?.getBoundingClientRect();
    if (!bounds?.height) return;
    const row = Math.max(0, Math.min(layout.slots.length - 1,
      Math.floor((clientY - bounds.top) / bounds.height * layout.slots.length)));
    setPreviewSlot(layout.slots[row]!.id);
  };
  const previewCard = useRef<HTMLButtonElement>(null);
  const previewIndex = layout.slots.findIndex((s) => s.id === previewSlot);
  const previewPlace = layout.slots[previewIndex];
  useLayoutEffect(() => {
    const nav = places.current;
    const card = previewCard.current;
    if (!nav || !card || slot.occupantId !== 'online') return;
    const position = () => {
      const width = nav.clientWidth;
      const center = (previewIndex + 0.5) * width / layout.slots.length;
      card.style.left = `${Math.max(0, Math.min(center - card.offsetWidth / 2, width - card.offsetWidth))}px`;
    };
    position();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(position);
    observer.observe(nav);
    observer.observe(card);
    return () => observer.disconnect();
  }, [previewIndex, slot.occupantId, layout.slots.length]);

  const previewProfile = previewPlace?.occupantId && !isUnfinished(previewPlace.occupantId)
    ? layout.profiles[previewPlace.occupantId] : null;
  useEffect(() => {
    setPreviewSlot(null);
  }, [activeSlotId]);
  useEffect(() => {
    if (!previewSlot) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !places.current?.contains(event.target))
        setPreviewSlot(null);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [previewSlot]);

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
        if ((e.target as HTMLElement).closest('button')) return;
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
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse' && !(e.target as HTMLElement).closest('button')) {
          start.current = { x: e.clientX, y: e.clientY };
          e.currentTarget.setPointerCapture?.(e.pointerId);
        }
      }}
      onPointerUp={(e) => {
        if (e.pointerType === 'mouse') finish(e.clientX, e.clientY);
      }}
      onPointerCancel={() => {
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
                <img
                  src={composition}
                  alt=""
                  draggable={false}
                  onError={() =>
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
            </div>
          );
        })}
      </div>
      <header className="bar-space__header">
        {onBack && (
          <button className="icon-btn" aria-label="Назад" onClick={onBack}>
            <ChevronLeft />
          </button>
        )}
        <h1>Бар «4-й период»</h1>
      </header>
      <nav
        ref={places}
        className="bar-space__places"
        aria-label="Места в баре"
        onTouchStart={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse' ||
            (e.target as HTMLElement).closest('.bar-place-preview')) return;
          e.stopPropagation();
          e.preventDefault();
          scrubPointer.current = e.pointerId;
          e.currentTarget.setPointerCapture?.(e.pointerId);
          previewAt(e.clientY);
        }}
        onPointerMove={(e) => {
          if (scrubPointer.current === e.pointerId) previewAt(e.clientY);
        }}
        onPointerUp={(e) => {
          if (scrubPointer.current !== e.pointerId) return;
          e.stopPropagation();
          previewAt(e.clientY);
          scrubPointer.current = null;
          e.currentTarget.releasePointerCapture?.(e.pointerId);
        }}
        onPointerCancel={() => { scrubPointer.current = null; }}
        onLostPointerCapture={() => { scrubPointer.current = null; }}
        onPointerLeave={(e) => {
          if (e.pointerType === 'mouse') setPreviewSlot(null);
        }}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setPreviewSlot(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            setPreviewSlot(null);
          }
        }}
      >
        {layout.slots.map((s, i) => (
          <button
            key={s.id}
            aria-label={
              isUnfinished(s.occupantId) ? `Персонаж в разработке, страница ${i + 1}`
                : layout.profiles[s.occupantId!].name
            }
            aria-current={index === i ? 'page' : undefined}
            aria-expanded={previewSlot === s.id}
            aria-controls={previewSlot === s.id ? 'bar-place-preview' : undefined}
            onPointerEnter={(e) => {
              if (e.pointerType === 'mouse') setPreviewSlot(s.id);
            }}
            onFocus={() => setPreviewSlot(s.id)}
            onClick={() => {
              onSelectSlot(s.id);
              setPreviewSlot(null);
            }}
          />
        ))}
        {previewPlace && (
          <button
            ref={previewCard}
            id="bar-place-preview"
            className="bar-place-preview"
            style={{ top: `${previewIndex * 10}%` }}
            aria-label={`Перейти: ${previewProfile?.name ?? `Персонаж в разработке, страница ${previewIndex + 1}`}`}
            onClick={() => {
              onSelectSlot(previewPlace.id);
              setPreviewSlot(null);
            }}
          >
            <span className="bar-place-preview__avatar">
              {isBarAssetPath(previewProfile?.avatar ?? null) ? (
                <img src={previewProfile!.avatar!} alt="" />
              ) : previewPlace.occupantId === 'online' ? (
                <Monitor size={20} />
              ) : previewPlace.occupantId === 'news' ? (
                <Newspaper size={20} />
              ) : previewPlace.occupantId === 'broadcasts' ? (
                <Tv size={20} />
              ) : (
                (previewProfile?.name.slice(0, 1) ?? <CharacterSilhouette />)
              )}
            </span>
            <span className="bar-place-preview__text">
              <strong>{previewProfile?.name ?? 'Персонаж в разработке'}</strong>
              {previewProfile?.role && <span>{previewProfile.role}</span>}

            </span>
          </button>
        )}
      </nav>
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
      <section ref={panel} className={`bar-space__actions${slot.occupantId === 'online' ? ' bar-space__actions--terminal' : ''}`} aria-live="polite" hidden={hideIdentity}>
        {slot.occupantId === 'online' ? <OnlineDurakLobby embedded /> : isUnfinished(slot.occupantId) ? (
          <p className="bar-space__development">Персонаж в разработке</p>
        ) : profile ? (
          <BarIdentityPanel
            key={slot.occupantId}
            profile={profile}
            actions={barActionsFor(slot.occupantId)}
            conversationStarted={conversationStarted}
            {...(onTalk && barCharacters.includes(slot.occupantId as BarCharacter)
              ? { onTalk: () => onTalk(slot.occupantId as BarCharacter) }
              : {})}
            onAction={(action) => {
              if (slot.occupantId) onAction(action, slot.occupantId);
            }}
          />
        ) : (
          <h2>Свободное место</h2>
        )}
      </section>
    </main>
  );
}
