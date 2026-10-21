import {
  lazy,
  Suspense,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type CSSProperties,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Minus, Move, Pin, PinOff, X, Maximize2 } from 'lucide-react';
import { ChatPresentationProvider } from './ChatPresentationContext.js';
import { clampChatRect, type ChatRect } from './chatWindowGeometry.js';
import { useChatWindowStore } from './chatWindowStore.js';
import { rememberChatReturn } from '../chatReturn.js';
import { AccessibleModal } from '../../components/AccessibleModal.js';
import type { ColumnLocation } from '../../layout/columnNavigationStore.js';
import './chat-window.css';
const ChatList = lazy(() =>
  import('../screens/ChatListScreen.js').then((m) => ({ default: m.ChatListScreen })),
);
const ChatRoom = lazy(() =>
  import('../screens/ChatRoomScreen.js').then((m) => ({ default: m.ChatRoomScreen })),
);
const ChatInfo = lazy(() =>
  import('../screens/ChatInfoScreen.js').then((m) => ({ default: m.ChatInfoScreen })),
);
const Comments = lazy(() =>
  import('../screens/ChannelPostCommentsScreen.js').then((m) => ({
    default: m.ChannelPostCommentsScreen,
  })),
);
const viewport = () => ({
  width: window.visualViewport?.width ?? window.innerWidth,
  height: window.visualViewport?.height ?? window.innerHeight,
});
export function ChatWindow({ owner, gameplay }: { owner: string; gameplay: boolean }) {
  const state = useChatWindowStore(),
    navigate = useNavigate(),
    mainLocation = useLocation();
  const [size, setSize] = useState(viewport),
    [confirm, setConfirm] = useState<(() => void) | null>(null);
  const frame = useRef<HTMLElement>(null),
    drag = useRef<{ x: number; y: number; rect: ChatRect; resize: boolean } | null>(null);
  const previousOpen = useRef(false),
    returnFocus = useRef<HTMLElement | null>(null);
  const fullPage = /^\/chat(?:\/|$)/.test(mainLocation.pathname);
  const visible =
    state.owner === owner &&
    size.width >= 832 &&
    !gameplay &&
    !fullPage &&
    ['floating', 'docked'].includes(state.mode);
  useEffect(() => {
    const update = () => setSize(viewport());
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
    };
  }, []);
  useLayoutEffect(() => {
    if (state.owner !== owner) return;
    const rect = clampChatRect(state.rect, size);
    if (
      Object.keys(rect).some(
        (key) => rect[key as keyof ChatRect] !== state.rect[key as keyof ChatRect],
      )
    )
      state.setRect(rect);
  }, [size, state.rect, owner, state]);
  useEffect(() => {
    if (
      size.width >= 832 ||
      state.owner !== owner ||
      !['floating', 'docked'].includes(state.mode) ||
      gameplay ||
      fullPage
    )
      return;
    rememberChatReturn(owner, mainLocation.pathname + mainLocation.search + mainLocation.hash);
    state.setMode('minimized');
    navigate(state.location);
  }, [size.width, state, owner, gameplay, fullPage, mainLocation, navigate]);
  useEffect(() => {
    if (visible && !previousOpen.current) {
      returnFocus.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      frame.current?.querySelector<HTMLButtonElement>('button')?.focus();
    }
    if (!visible && previousOpen.current && returnFocus.current?.isConnected)
      returnFocus.current.focus();
    previousOpen.current = visible;
  }, [visible]);
  const changeMode = (mode: 'closed' | 'minimized' | 'floating' | 'docked') => {
    const action = () => {
      window.dispatchEvent(
        new CustomEvent('hockey:chat-window-cancel-voice', {
          detail: { owner, chatId: state.location.pathname.split('/')[2] },
        }),
      );
      state.setMode(mode);
    };
    if (
      (mode === 'closed' || mode === 'minimized') &&
      frame.current?.querySelector('[data-voice-recording="true"]')
    )
      setConfirm(() => action);
    else action();
  };
  const pointerDown = (event: PointerEvent<HTMLElement>, resize = false) => {
    if (state.mode === 'docked' || event.button !== 0) return;
    event.preventDefault();
    drag.current = { x: event.clientX, y: event.clientY, rect: state.rect, resize };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const pointerMove = (event: PointerEvent<HTMLElement>) => {
    const start = drag.current;
    if (!start) return;
    const dx = event.clientX - start.x,
      dy = event.clientY - start.y;
    state.setRect(
      clampChatRect(
        start.resize
          ? { ...start.rect, width: start.rect.width + dx, height: start.rect.height + dy }
          : { ...start.rect, x: start.rect.x + dx, y: start.rect.y + dy },
        size,
      ),
    );
  };
  const keyboard = (event: KeyboardEvent<HTMLButtonElement>, resize = false) => {
    if (
      !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) ||
      state.mode === 'docked'
    )
      return;
    event.preventDefault();
    const dx = event.key === 'ArrowLeft' ? -16 : event.key === 'ArrowRight' ? 16 : 0,
      dy = event.key === 'ArrowUp' ? -16 : event.key === 'ArrowDown' ? 16 : 0;
    state.setRect(
      clampChatRect(
        resize
          ? { ...state.rect, width: state.rect.width + dx, height: state.rect.height + dy }
          : { ...state.rect, x: state.rect.x + dx, y: state.rect.y + dy },
        size,
      ),
    );
  };
  const outside = (location: ColumnLocation) => {
    state.setMode('minimized');
    navigate(location);
  };
  if (state.owner !== owner || !state.opened) return null;
  const style: CSSProperties =
    state.mode === 'docked'
      ? { right: 12, top: 12, bottom: 12, width: 360 }
      : {
          left: state.rect.x,
          top: state.rect.y,
          width: state.rect.width,
          height: state.rect.height,
        };
  return (
    <>
      <aside
        ref={frame}
        className={`chat-window${state.mode === 'docked' ? ' chat-window--docked' : ''}`}
        style={style}
        hidden={!visible}
        aria-label="Окно чата"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !(event.target as HTMLElement).closest('[role="dialog"]'))
            changeMode('minimized');
        }}
      >
        <header
          className="chat-window__header"
          onPointerDown={(event) => {
            if (!(event.target as HTMLElement).closest('button')) pointerDown(event);
          }}
          onPointerMove={pointerMove}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
        >
          <strong>Чат</strong>
          <div className="chat-window__controls">
            <button
              type="button"
              className="icon-btn"
              aria-label="Переместить окно чата"
              disabled={state.mode === 'docked'}
              onPointerDown={(event) => pointerDown(event)}
              onPointerMove={pointerMove}
              onPointerUp={() => {
                drag.current = null;
              }}
              onKeyDown={(event) => keyboard(event)}
            >
              <Move size={16} />
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label={state.mode === 'docked' ? 'Открепить чат' : 'Закрепить чат'}
              onClick={() => changeMode(state.mode === 'docked' ? 'floating' : 'docked')}
            >
              {state.mode === 'docked' ? <PinOff size={16} /> : <Pin size={16} />}
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label="Свернуть чат"
              onClick={() => changeMode('minimized')}
            >
              <Minus size={16} />
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label="Закрыть чат"
              onClick={() => changeMode('closed')}
            >
              <X size={16} />
            </button>
          </div>
        </header>
        <div className="chat-window__body">
          <ChatPresentationProvider
            owner={owner}
            location={state.location}
            visible={visible}
            onNavigate={state.setLocation}
            onOutside={outside}
          >
            <Suspense fallback={<p role="status">Загрузка…</p>}>
              {/\/posts\/[^/]+\/comments$/.test(state.location.pathname) ? (
                <Comments />
              ) : /\/info$/.test(state.location.pathname) ? (
                <ChatInfo />
              ) : state.location.pathname !== '/chat' ? (
                <ChatRoom />
              ) : (
                <ChatList />
              )}
            </Suspense>
          </ChatPresentationProvider>
        </div>
        {state.mode !== 'docked' && (
          <button
            type="button"
            className="icon-btn chat-window__resize"
            aria-label="Изменить размер чата"
            onPointerDown={(event) => pointerDown(event, true)}
            onPointerMove={pointerMove}
            onPointerUp={() => {
              drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
            onKeyDown={(event) => keyboard(event, true)}
          >
            <Maximize2 size={14} />
          </button>
        )}
      </aside>
      {confirm && (
        <AccessibleModal
          title="Отменить запись?"
          copy="При сворачивании запись будет остановлена."
          onClose={() => setConfirm(null)}
        >
          <div className="modal-actions">
            <button className="btn btn--ghost" onClick={() => setConfirm(null)}>
              Продолжить запись
            </button>
            <button
              className="modal-primary btn btn--cta"
              onClick={() => {
                confirm();
                setConfirm(null);
              }}
            >
              Свернуть чат
            </button>
          </div>
        </AccessibleModal>
      )}
    </>
  );
}
