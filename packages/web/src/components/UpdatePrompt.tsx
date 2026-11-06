import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useRegisterSW } from 'virtual:pwa-register/react';

const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000;
const UPDATE_ACTIVATION_TIMEOUT_MS = 5_000;

let updateCheckTimer: number | null = null;
let activeRegistration: ServiceWorkerRegistration | null = null;
let updateCheckListenersAttached = false;

function checkForAppUpdate(): void {
  if (!activeRegistration) return;
  void activeRegistration.update().catch((error: unknown) => {
    console.warn('Service worker update check failed', error);
  });
}

function setupUpdateChecks(registration: ServiceWorkerRegistration): void {
  activeRegistration = registration;
  checkForAppUpdate();

  if (updateCheckTimer !== null) {
    window.clearInterval(updateCheckTimer);
  }
  updateCheckTimer = window.setInterval(checkForAppUpdate, UPDATE_CHECK_INTERVAL_MS);

  if (!updateCheckListenersAttached) {
    window.addEventListener('focus', checkForAppUpdate);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') checkForAppUpdate();
    });
    updateCheckListenersAttached = true;
  }
}

export function UpdatePrompt(): JSX.Element | null {
  const fallbackTimerRef = useRef<number | null>(null);
  const updateButtonRef = useRef<HTMLButtonElement | null>(null);
  const notesId = useId();
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState<string[] | null>(null);
  const [notesError, setNotesError] = useState(false);
  const [notesAttempt, setNotesAttempt] = useState(0);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onNeedRefresh() {
      setNotesAttempt(value => value + 1);
    },
    onRegisteredSW(_swUrl, registration) {
      if (registration) setupUpdateChecks(registration);
    },
    onRegisterError(error) {
      console.warn('Service worker registration failed', error);
    },
  });

  useEffect(() => () => {
    if (fallbackTimerRef.current !== null) window.clearTimeout(fallbackTimerRef.current);
  }, []);

  useEffect(() => {
    if (needRefresh) updateButtonRef.current?.focus();
  }, [needRefresh]);

  useEffect(() => {
    if (!needRefresh || !expanded) return;
    setNotes(null);
    setNotesError(false);
    const worker = activeRegistration?.waiting;
    if (!worker) {
      setNotesError(true);
      return;
    }
    const channel = new MessageChannel();
    const timeout = window.setTimeout(() => {
      channel.port1.close();
      setNotesError(true);
    }, UPDATE_ACTIVATION_TIMEOUT_MS);
    channel.port1.onmessage = (event: MessageEvent<unknown>) => {
      window.clearTimeout(timeout);
      channel.port1.close();
      const items = (event.data as { items?: unknown } | null)?.items;
      if (Array.isArray(items) && items.length && items.every(item => typeof item === 'string' && item.trim())) {
        setNotes(items);
      } else setNotesError(true);
    };
    try {
      worker.postMessage({ type: 'HOCKEY_RELEASE_NOTES' }, [channel.port2]);
    } catch {
      window.clearTimeout(timeout);
      channel.port1.close();
      setNotesError(true);
    }
    return () => {
      window.clearTimeout(timeout);
      channel.port1.close();
      channel.port2.close();
    };
  }, [needRefresh, expanded, notesAttempt]);

  const applyUpdate = (): void => {
    if (fallbackTimerRef.current !== null) window.clearTimeout(fallbackTimerRef.current);
    let reloadRequested = false;
    const reload = (): void => {
      if (reloadRequested) return;
      reloadRequested = true;
      if (fallbackTimerRef.current !== null) window.clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
      window.location.reload();
    };

    if (!activeRegistration?.waiting) {
      reload();
      return;
    }

    fallbackTimerRef.current = window.setTimeout(reload, UPDATE_ACTIVATION_TIMEOUT_MS);
    void updateServiceWorker(true).catch(reload);
  };

  if (!needRefresh) return null;

  return createPortal(
    <div
      data-pwa-update-root=""
      role="dialog"
      aria-modal="true"
      aria-label="Доступно обновление"
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        event.preventDefault();
        event.stopPropagation();
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = (current + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 900,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        background: 'var(--liquid-inset-bg)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <div
        className="glass"
        style={{
          borderRadius: 24,
          padding: '22px 22px 18px',
          maxWidth: 320,
          width: '100%',
          maxHeight: 'calc(100dvh - 40px)',
          overflowY: 'auto',
          color: 'var(--ink)',
          boxShadow: '0 24px 70px rgba(15, 23, 42, 0.22)',
        }}
      >
        <div
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: 'var(--ink)',
            marginBottom: 10,
          }}
        >
          Доступно обновление
        </div>
        <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
          Перезагрузим приложение, чтобы открыть свежую версию.
        </div>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={notesId}
          onClick={() => setExpanded(value => !value)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            width: '100%',
            marginTop: 14,
            padding: '10px 0',
            border: 0,
            background: 'transparent',
            color: 'var(--ink)',
            font: 'inherit',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Что нового
          <ChevronDown size={16} strokeWidth={1.5} aria-hidden="true" style={{ transform: expanded ? 'rotate(180deg)' : undefined }} />
        </button>
        {expanded && (
          <div id={notesId} role="region" aria-label="Что нового" style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--ink)' }}>
            {notes && (
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                {notes.map((item, index) => <li key={index} style={{ marginBottom: 8 }}>{item}</li>)}
              </ul>
            )}
            {notesError ? (
              <>
                <p role="status" style={{ margin: '4px 0 8px', color: 'var(--muted)' }}>Описание обновления недоступно.</p>
                <button type="button" className="btn btn--ghost" onClick={() => setNotesAttempt(value => value + 1)}>Повторить</button>
              </>
            ) : !notes && (
              <p role="status" style={{ margin: '4px 0', color: 'var(--muted)' }}>Загружаем описание…</p>
            )}
          </div>
        )}
        <button
          ref={updateButtonRef}
          type="button"
          className="btn btn--cta"
          onClick={applyUpdate}
          style={{
            marginTop: 18,
            width: '100%',
            padding: '12px 0',
            fontSize: 14,
            letterSpacing: 0,
          }}
        >
          Обновить приложение
        </button>
      </div>
    </div>,
    document.body,
  );
}
