import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiFetch } from '../api/apiFetch.js';
import { TelegramLoginButton, type TelegramAuthPayload } from '../auth/TelegramLoginButton.js';

export interface MobileTelegramAuthScreenProps {
  navigateTo?: (url: string) => void;
}

function isCompletionUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return (
      url.origin === 'https://ultimatehockey.ru' &&
      url.pathname === '/mobile/auth/complete' &&
      url.searchParams.getAll('code').length === 1 &&
      /^[A-Za-z0-9_-]{43}$/.test(url.searchParams.get('code') ?? '')
    );
  } catch {
    return false;
  }
}

export function MobileTelegramAuthScreen({
  navigateTo = (url) => window.location.assign(url),
}: MobileTelegramAuthScreenProps): JSX.Element {
  const [searchParams] = useSearchParams();
  const attemptId = searchParams.get('attempt') ?? '';
  const validAttempt = /^[A-Za-z0-9_-]{43}$/.test(attemptId);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const botUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME ?? '';

  const complete = useCallback(
    async (payload: TelegramAuthPayload) => {
      if (!validAttempt || pending) return;
      setPending(true);
      setError(null);
      try {
        const response = await apiFetch<{ redirectUrl: string }>('/mobile/auth/telegram/complete', {
          method: 'POST',
          body: JSON.stringify({ attemptId, ...payload }),
        });
        if (!isCompletionUrl(response.redirectUrl)) throw new Error('invalid completion URL');
        navigateTo(response.redirectUrl);
      } catch {
        setError('Не удалось завершить вход через Telegram. Попробуйте ещё раз.');
        setPending(false);
      }
    },
    [attemptId, navigateTo, pending, validAttempt],
  );

  return (
    <main
      className="screen login-screen mobile-telegram-auth-screen"
    >
      <h1 className="login-screen__title">Вход через Telegram</h1>
      {!validAttempt ? (
        <div role="alert">Ссылка для входа устарела. Вернитесь в приложение.</div>
      ) : pending ? (
        <div role="status">Возвращаемся в приложение…</div>
      ) : (
        <TelegramLoginButton
          botUsername={botUsername}
          onAuth={(payload) => void complete(payload)}
        />
      )}
      {error && <div role="alert">{error}</div>}
    </main>
  );
}
