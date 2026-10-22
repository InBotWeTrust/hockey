import {chatBackdropStyle} from '../components/chatBackdrop.js';
import { lazy, Suspense, useRef, useState, useEffect, type ReactNode } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate, type Location } from 'react-router-dom';
import { Expand, Minimize2, X } from 'lucide-react';
import { AccessibleModal } from '../components/AccessibleModal.js';
import { ChatOverlayContext } from './ChatOverlayContext.js';
import {
  readChatSheetHeight,
  saveChatSheetHeight,
  withChatSheetHeight,
  type ChatSheetHeight,
} from './chatSheetHeight.js';
import './chat-overlay.css';
const ChatList = lazy(() =>
  import('./screens/ChatListScreen.js').then((m) => ({ default: m.ChatListScreen })),
);
const ChatRoom = lazy(() =>
  import('./screens/ChatRoomScreen.js').then((m) => ({ default: m.ChatRoomScreen })),
);
const ChatInfo = lazy(() =>
  import('./screens/ChatInfoScreen.js').then((m) => ({ default: m.ChatInfoScreen })),
);
const Comments = lazy(() =>
  import('./screens/ChannelPostCommentsScreen.js').then((m) => ({
    default: m.ChannelPostCommentsScreen,
  })),
);

/** Scope the background location to keep its route, game and scene alive. */
export function ChatOverlay({
  children,
  enabled = true,
  owner,
}: {
  children: ReactNode;
  enabled?: boolean;
  owner?: string | undefined;
}): JSX.Element {
  const location = useLocation(),
    navigate = useNavigate();
  const background = useRef<Location>({
    ...location,
    pathname: '/sections',
    search: '',
    hash: '',
    state: null,
    key: 'chat-background',
  });
  const isChat =
    /^\/chat(?:\/|$)/.test(location.pathname) &&
    new URLSearchParams(location.search).get('view') !== 'feed';
  const open = enabled && isChat;
  const backgroundIndex = useRef<number | null>(null);
  if (!isChat) {
    background.current = location;
    backgroundIndex.current =
      typeof window.history.state?.idx === 'number' ? window.history.state.idx : null;
  }
  const source = background.current;
  const close = () => {
    const index = window.history.state?.idx;
    if (
      backgroundIndex.current !== null &&
      typeof index === 'number' &&
      index > backgroundIndex.current
    )
      navigate(backgroundIndex.current - index);
    else
      navigate(source.pathname + source.search + source.hash, {
        replace: true,
        state: source.state,
      });
  };
  return (
    <ChatOverlayContext.Provider value={open}>
      <Routes location={open ? source : location}>
        <Route path="*" element={<>{children}</>} />
      </Routes>
      {open && (
        <ChatSheet key={owner} owner={owner} onClose={close}>
          <Suspense fallback={<p role="status">Загрузка чата…</p>}>
            <Routes>
              <Route path="/chat" element={<ChatList embedded />} />
              <Route path="/chat/new" element={<Navigate to="/chat?new=1" replace />} />
              <Route path="/chat/:chatId" element={<ChatRoom />} />
              <Route path="/chat/:chatId/info" element={<ChatInfo />} />
              <Route path="/chat/:chatId/posts/:postId/comments" element={<Comments />} />
            </Routes>
          </Suspense>
        </ChatSheet>
      )}
    </ChatOverlayContext.Provider>
  );
}
function ChatSheet({
  children,
  onClose,
  owner,
}: {
  children: ReactNode;
  onClose: () => void;
  owner?: string | undefined;
}): JSX.Element {
  const [selection, setSelection] = useState(() => readChatSheetHeight(owner));
  const current = useRef(selection);
  current.current = selection;
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const start = useRef<{
    id: number;
    y: number;
    height: number;
    viewport: number;
    moved: boolean;
  } | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const expanded = selection.height === 1;
  const choose = (next: ChatSheetHeight, persist = true) => {
    current.current = next;
    setSelection(next);
    if (persist) saveChatSheetHeight(owner, next);
  };
  const change = (height: number, persist = true) =>
    choose(withChatSheetHeight(current.current, height), persist);
  useEffect(() => {
    const update = () =>
      setKeyboardOpen(
        Boolean(window.visualViewport && window.innerHeight - window.visualViewport.height > 120),
      );
    update();
    window.visualViewport?.addEventListener('resize', update);
    return () => window.visualViewport?.removeEventListener('resize', update);
  }, []);
  return (
    <AccessibleModal
      title="Чат"
      ariaLabel="Чат"
      presentation="sheet"
      smoothSheet
      dragListener={false}
      onClose={onClose}
      initialFocusRef={closeButton}
      cardClassName={`sheet-card game-scoreboard game-scoreboard--stable-surface chat-overlay${expanded ? ' chat-overlay--expanded' : ''}`}
      cardStyle={{ height: `${Math.round((keyboardOpen ? 1 : selection.height) * 10000) / 100}%` }}
      backdropStyle={chatBackdropStyle}
      beforeHeader={
        <div
          role="slider"
          tabIndex={0}
          className="chat-overlay__grabber"
          aria-label="Высота чата"
          aria-orientation="vertical"
          aria-valuemin={33}
          aria-valuemax={100}
          aria-valuenow={Math.round(selection.height * 100)}
          aria-valuetext={`${Math.round(selection.height * 100)}% экрана`}
          onKeyDown={(e) => {
            const heights: Record<string, number> = {
              ArrowUp: selection.height + 0.05,
              ArrowDown: selection.height - 0.05,
              Home: 1 / 3,
              End: 1,
            };
            const next = heights[e.key];
            if (next === undefined) return;
            e.preventDefault();
            change(next);
          }}
          onPointerDown={(e) => {
            if (e.button !== 0 || e.isPrimary === false || start.current) return;
            const dialog = e.currentTarget.closest('[role="dialog"]');
            const viewport =
              e.currentTarget.closest('[role="presentation"]')?.getBoundingClientRect().height ||
              window.innerHeight;
            start.current = {
              id: e.pointerId,
              y: e.clientY,
              height: dialog?.getBoundingClientRect().height || viewport * selection.height,
              viewport,
              moved: false,
            };
            e.currentTarget.setPointerCapture?.(e.pointerId);
          }}
          onPointerMove={(e) => {
            const d = start.current;
            if (!d || d.id !== e.pointerId) return;
            const dy = d.y - e.clientY;
            if (Math.abs(dy) > 2) d.moved = true;
            if (!d.moved) return;
            e.preventDefault();
            change((d.height + dy) / d.viewport, false);
          }}
          onPointerUp={(e) => {
            const d = start.current;
            if (!d || d.id !== e.pointerId) return;
            if (d.moved) saveChatSheetHeight(owner, current.current);
            start.current = null;
          }}
          onPointerCancel={() => {
            if (start.current?.moved) saveChatSheetHeight(owner, current.current);
            start.current = null;
          }}
          onLostPointerCapture={() => {
            if (start.current?.moved) saveChatSheetHeight(owner, current.current);
            start.current = null;
          }}
        >
          <span />
        </div>
      }
      headerAction={
        <div className="chat-overlay__controls">
          <button
            className="icon-btn"
            aria-label={expanded ? 'Свернуть чат' : 'Развернуть чат'}
            onClick={() => change(expanded ? selection.compactHeight : 1)}
          >
            {expanded ? <Minimize2 size={18} /> : <Expand size={18} />}
          </button>
          <button ref={closeButton} className="icon-btn" aria-label="Закрыть чат" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
      }
    >
      <div className="chat-overlay__body">{children}</div>
    </AccessibleModal>
  );
}
