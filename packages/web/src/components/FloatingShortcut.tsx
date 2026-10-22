import {useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import './navigation-geometry.css';
import './floating-chat.css';
type Point = { x: number; y: number };
const keyFor = (prefix:string,owner?: string) => `${prefix}:${owner ?? 'anonymous'}`;
function readPosition(prefix:string,owner?: string): Point | null {
  try {
    const p = JSON.parse(localStorage.getItem(keyFor(prefix,owner)) ?? 'null');
    return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? p : null;
  } catch {
    return null;
  }
}
export function FloatingShortcut({owner,storagePrefix,visible=true,playing=false,side='right',initialTop,label,count,badgeLabel,neutralBadge=false,className='',icon,onOpen}:{owner?:string|undefined;storagePrefix:string;visible?:boolean;playing?:boolean;side?:'left'|'right';initialTop?:number;label:string;count:number;badgeLabel:string;neutralBadge?:boolean;className?:string;icon:ReactNode;onOpen:()=>void}):JSX.Element|null {
  const button = useRef<HTMLButtonElement>(null);
  const [point, setPoint] = useState<Point | null>(() => readPosition(storagePrefix,owner));
  const previousSide = useRef(side);
  const position = useRef(point);
  position.current = point;
  const drag = useRef<{ id: number; x: number; y: number; start: Point; moved: boolean } | null>(
    null,
  );
  const suppressClick = useRef(false);
  const bounds = () => button.current?.closest<HTMLElement>('.app-shell')?.getBoundingClientRect();
  const clamp = (p: Point): Point => {
    const r = bounds();
    const style = button.current ? getComputedStyle(button.current) : null;
    const safeTop = parseFloat(style?.scrollMarginTop ?? '') || 8;
    const safeBottom = parseFloat(style?.scrollMarginBottom ?? '') || 8;
    return {
      x: Math.max(8, Math.min(p.x, (r?.width || window.innerWidth) - 52)),
      y: Math.max(safeTop, Math.min(p.y, (r?.height || window.innerHeight) - 44 - safeBottom)),
    };
  };
  const save = (p: Point) => {
    try {
      localStorage.setItem(keyFor(storagePrefix,owner), JSON.stringify(p));
    } catch {
      /* Optional persistence. */
    }
  };
  useLayoutEffect(() => {
    const saved = readPosition(storagePrefix,owner);
    position.current = saved;
    previousSide.current = side;
    setPoint(saved);
  }, [owner,storagePrefix]);
  useLayoutEffect(() => {
    if (!visible) return;
    const update = () => {
      const r = bounds();
      if (!r) return;
      const sideChanged = previousSide.current !== side;
      previousSide.current = side;
      const next = clamp(
        sideChanged
          ? { x: side === 'left' ? 12 : r.width - 56, y: position.current?.y ?? initialTop ?? r.height - 160 }
          : (position.current ?? { x: side === 'left' ? 12 : r.width - 56, y: initialTop ?? r.height - 160 }),
      );
      if (sideChanged) save(next);
      setPoint(next);
    };
    update();
    const root = button.current?.closest<HTMLElement>('.app-shell');
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(update);
    if (root) observer?.observe(root);
    window.addEventListener('resize', update);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [visible, side, owner,storagePrefix,initialTop]);
  if (!visible) return null;
  return (
    <button
      ref={button}
      type="button"
      className={`icon-btn floating-shortcut ${className}${playing ? ' floating-shortcut--playing' : ''}`}
      aria-label={label}
      title={label}
      style={point ? { left: point.x, top: point.y, right: 'auto', bottom: 'auto' } : undefined}
      onPointerDown={(e) => {
        if (e.button !== 0 || e.isPrimary === false || drag.current) return;
        suppressClick.current = false;
        drag.current = {
          id: e.pointerId,
          x: e.clientX,
          y: e.clientY,
          start: point ?? { x: 12, y: 12 },
          moved: false,
        };
        e.currentTarget.setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d || d.id !== e.pointerId) return;
        const dx = e.clientX - d.x,
          dy = e.clientY - d.y;
        if (Math.hypot(dx, dy) > 6) d.moved = true;
        if (d.moved) {
          e.preventDefault();
          setPoint(clamp({ x: d.start.x + dx, y: d.start.y + dy }));
        }
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        if (!d || d.id !== e.pointerId) return;
        suppressClick.current = d.moved;
        if (d.moved)
          save(clamp({ x: d.start.x + e.clientX - d.x, y: d.start.y + e.clientY - d.y }));
        drag.current = null;
      }}
      onPointerCancel={() => {
        suppressClick.current = true;
        drag.current = null;
      }}
      onLostPointerCapture={() => {
        if (drag.current) {
          suppressClick.current = drag.current.moved;
          drag.current = null;
        }
      }}
      onClick={(e) => {
        if (suppressClick.current && e.detail !== 0) {
          suppressClick.current = false;
          return;
        }
        onOpen();
      }}
    >
      {icon}
      {count > 0 && (
        <small className={`floating-shortcut__badge${neutralBadge?' floating-shortcut__badge--neutral':''}`} aria-label={`${badgeLabel}: ${count}`}>
          {count > 99 ? '99+' : count}
        </small>
      )}
    </button>
  );
}
