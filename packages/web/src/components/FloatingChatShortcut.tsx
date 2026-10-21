import { useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { isOpenRinkRoute } from './BottomNav.js';
import { useMapChatPosition } from '../app/mapChatPosition.js';
import { rememberChatReturn } from '../chat/chatReturn.js';
import { useChatOverlayOpen } from '../chat/ChatOverlayContext.js';
import './navigation-geometry.css';
import './floating-chat.css';

type Point = { x: number; y: number };
const keyFor = (owner?: string) => `floating-chat-position-v2:${owner ?? 'anonymous'}`;
function readPosition(owner?: string): Point | null {
  try {
    const p = JSON.parse(localStorage.getItem(keyFor(owner)) ?? 'null');
    return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? p : null;
  } catch {
    return null;
  }
}
export function isChatShortcutVisible(location: { pathname: string; search: string }): boolean {
  if (location.pathname === '/chat' && new URLSearchParams(location.search).get('view') === 'feed')
    return true;
  return !/^\/(?:chat|login|auth|mobile-auth)(?:\/|$)/.test(location.pathname);
}
export function FloatingChatShortcut({
  owner,
  unreadCount,
}: {
  owner?: string;
  unreadCount: number;
}): JSX.Element | null {
  const location = useLocation(),
    navigate = useNavigate();
  const side = useMapChatPosition(owner),
    overlayOpen = useChatOverlayOpen();
  const visible = isChatShortcutVisible(location) && !overlayOpen;
  const playing = isOpenRinkRoute(location) || location.pathname.startsWith('/duel/');
  const button = useRef<HTMLButtonElement>(null);
  const [point, setPoint] = useState<Point | null>(() => readPosition(owner));
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
      localStorage.setItem(keyFor(owner), JSON.stringify(p));
    } catch {
      /* Optional persistence. */
    }
  };
  useLayoutEffect(() => {
    const saved = readPosition(owner);
    position.current = saved;
    previousSide.current = side;
    setPoint(saved);
  }, [owner]);
  useLayoutEffect(() => {
    if (!visible) return;
    const update = () => {
      const r = bounds();
      if (!r) return;
      const sideChanged = previousSide.current !== side;
      previousSide.current = side;
      const next = clamp(
        sideChanged
          ? { x: side === 'left' ? 12 : r.width - 56, y: position.current?.y ?? r.height - 160 }
          : (position.current ?? { x: side === 'left' ? 12 : r.width - 56, y: r.height - 160 }),
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
  }, [visible, side, owner]);
  if (!visible) return null;
  return (
    <button
      ref={button}
      type="button"
      className={`icon-btn floating-chat${playing ? ' floating-chat--playing' : ''}`}
      aria-label="Открыть чат"
      title="Чат"
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
        rememberChatReturn(owner, location.pathname + location.search + location.hash);
        navigate('/chat');
      }}
    >
      <MessageCircle aria-hidden="true" />
      {unreadCount > 0 && (
        <small className="floating-chat__badge" aria-label={`Непрочитанные: ${unreadCount}`}>
          {unreadCount > 99 ? '99+' : unreadCount}
        </small>
      )}
    </button>
  );
}
