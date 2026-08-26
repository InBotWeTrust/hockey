import { useCallback, useEffect, useId, useRef, useState } from 'react';

export interface TelegramAuthPayload {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
  [key: string]: unknown;
}

export interface TelegramLoginButtonProps {
  botUsername: string;
  onAuth: (payload: TelegramAuthPayload) => void;
  cornerRadius?: number;
  size?: 'small' | 'medium' | 'large';
}

type AuthCallback = (payload: TelegramAuthPayload) => void;
type WindowWithCallbacks = typeof window & Record<string, AuthCallback | undefined>;

const TELEGRAM_WIDGET_TIMEOUT_MS = 4000;
const TELEGRAM_VPN_MESSAGE = 'Вход через Telegram доступен с VPN. Включите и обновите страницу.';

export function TelegramLoginButton({
  botUsername,
  onAuth,
  cornerRadius = 12,
  size = 'large',
}: TelegramLoginButtonProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [widgetUnavailable, setWidgetUnavailable] = useState(false);
  const [widgetReady, setWidgetReady] = useState(false);
  const rawId = useId();
  const callbackName = `onTelegramAuth_${rawId.replace(/[^a-zA-Z0-9_]/g, '_')}`;
  const fallbackHeight = size === 'large' ? 40 : size === 'medium' ? 36 : 32;
  const fallbackWidth = size === 'large' ? 242 : size === 'medium' ? 218 : 190;
  const reloadPage = useCallback(() => {
    window.location.reload();
  }, []);

  useEffect(() => {
    if (!botUsername) return;
    const container = containerRef.current;
    if (!container) return;

    setWidgetReady(false);
    setWidgetUnavailable(false);
    const w = window as WindowWithCallbacks;
    w[callbackName] = (payload) => onAuth(payload);

    const script = document.createElement('script');
    let timeoutId: number | undefined;
    let observer: MutationObserver | undefined;
    let isReady = false;
    const watchedFrames = new Set<HTMLIFrameElement>();

    const markReady = () => {
      isReady = true;
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
        timeoutId = undefined;
      }
      setWidgetReady(true);
      setWidgetUnavailable(false);
    };
    const markUnavailable = () => {
      if (isReady) return;
      setWidgetReady(false);
      setWidgetUnavailable(true);
    };

    const watchFrames = () => {
      const frames = container.querySelectorAll('iframe');
      frames.forEach((frame) => {
        if (watchedFrames.has(frame)) return;
        watchedFrames.add(frame);
        frame.addEventListener('load', markReady, { once: true });
        frame.addEventListener('error', markUnavailable, { once: true });
      });
    };

    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.async = true;
    script.setAttribute('data-telegram-login', botUsername);
    script.setAttribute('data-size', size);
    script.setAttribute('data-radius', String(cornerRadius));
    script.setAttribute('data-onauth', `${callbackName}(user)`);
    script.setAttribute('data-request-access', 'write');
    script.onerror = markUnavailable;

    if ('MutationObserver' in window) {
      observer = new MutationObserver(watchFrames);
      observer.observe(container, { childList: true, subtree: true });
    }

    timeoutId = window.setTimeout(() => {
      markUnavailable();
    }, TELEGRAM_WIDGET_TIMEOUT_MS);

    container.appendChild(script);
    watchFrames();

    return () => {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
      observer?.disconnect();
      watchedFrames.forEach((frame) => {
        frame.removeEventListener('load', markReady);
        frame.removeEventListener('error', markUnavailable);
      });
      script.onerror = null;
      w[callbackName] = undefined;
      if (script.parentNode === container) {
        container.removeChild(script);
      }
    };
  }, [botUsername, onAuth, callbackName, cornerRadius, size]);

  if (!botUsername) {
    return <div role="alert">Вход через Telegram не настроен.</div>;
  }

  return (
    <div
      style={{
        alignSelf: 'center',
        width: fallbackWidth,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <div
        ref={containerRef}
        data-testid="telegram-login-container"
        aria-hidden={!widgetReady}
        style={{
          display: widgetUnavailable ? 'none' : 'block',
          minHeight: widgetReady ? undefined : fallbackHeight,
          visibility: widgetReady ? 'visible' : 'hidden',
        }}
      />
      {widgetUnavailable && (
        <div
          role="alert"
          data-testid="telegram-login-fallback"
          style={{
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <div
            style={{
              color: 'var(--muted)',
              fontSize: size === 'large' ? 13 : 12,
              fontWeight: 700,
              lineHeight: 1.35,
              textAlign: 'center',
            }}
          >
            {TELEGRAM_VPN_MESSAGE}
          </div>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={reloadPage}
            style={{
              width: '100%',
              height: fallbackHeight,
              padding: '0 14px',
              borderRadius: cornerRadius,
              justifyContent: 'center',
              fontSize: size === 'large' ? 14 : 13,
              fontWeight: 800,
              letterSpacing: 0,
              whiteSpace: 'nowrap',
            }}
          >
            Обновить страницу
          </button>
        </div>
      )}
    </div>
  );
}
