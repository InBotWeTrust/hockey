import { useEffect, useId, useRef } from 'react';

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

export function TelegramLoginButton({
  botUsername,
  onAuth,
  cornerRadius = 12,
  size = 'large',
}: TelegramLoginButtonProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rawId = useId();
  const callbackName = `onTelegramAuth_${rawId.replace(/[^a-zA-Z0-9_]/g, '_')}`;

  useEffect(() => {
    if (!botUsername) return;
    const container = containerRef.current;
    if (!container) return;

    const w = window as WindowWithCallbacks;
    w[callbackName] = (payload) => onAuth(payload);

    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.async = true;
    script.setAttribute('data-telegram-login', botUsername);
    script.setAttribute('data-size', size);
    script.setAttribute('data-radius', String(cornerRadius));
    script.setAttribute('data-onauth', `${callbackName}(user)`);
    script.setAttribute('data-request-access', 'write');
    container.appendChild(script);

    return () => {
      w[callbackName] = undefined;
      if (script.parentNode === container) {
        container.removeChild(script);
      }
    };
  }, [botUsername, onAuth, callbackName, cornerRadius, size]);

  if (!botUsername) {
    return <div role="alert">Telegram login is not configured.</div>;
  }

  return <div ref={containerRef} data-testid="telegram-login-container" />;
}
