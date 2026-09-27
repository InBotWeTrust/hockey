import { useEffect, useRef } from 'react';
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
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
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
        updateButtonRef.current?.focus();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 900,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        background: 'rgba(15, 23, 42, 0.35)',
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
