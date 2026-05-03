import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw } from 'lucide-react';

const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000;

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

  if (!needRefresh) return null;

  return (
    <div
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 900,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        background: 'rgba(15, 23, 42, 0.28)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-update-title"
        className="glass"
        style={{
          width: 'min(390px, 100%)',
          borderRadius: 24,
          padding: 18,
          display: 'grid',
          gap: 14,
          color: 'var(--ink)',
          boxShadow: '0 24px 70px rgba(15, 23, 42, 0.22)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            aria-hidden="true"
            style={{
              width: 46,
              height: 46,
              borderRadius: 16,
              background: 'rgba(15, 23, 42, 0.92)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <RefreshCw size={22} />
          </div>
          <div style={{ minWidth: 0 }}>
            <h2
              id="app-update-title"
              style={{
                margin: 0,
                color: 'var(--ink)',
                fontSize: 20,
                fontWeight: 900,
                lineHeight: 1.12,
                letterSpacing: 0,
              }}
            >
              Доступно обновление
            </h2>
            <p
              style={{
                margin: '5px 0 0',
                color: 'var(--muted)',
                fontSize: 13,
                fontWeight: 750,
                lineHeight: 1.35,
              }}
            >
              Перезагрузим приложение, чтобы открыть свежую версию.
            </p>
          </div>
        </div>
        <button
          type="button"
          className="btn btn--cta"
          onClick={() => {
            void updateServiceWorker(true);
          }}
          style={{
            minHeight: 52,
            borderRadius: 18,
            fontSize: 15,
            letterSpacing: 0,
            width: '100%',
          }}
        >
          <RefreshCw size={18} />
          Обновить приложение
        </button>
      </section>
    </div>
  );
}
