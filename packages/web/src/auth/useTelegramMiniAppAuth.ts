import { useEffect, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '../api/apiFetch.js';
import { detectTimezone } from './timezone.js';
import { type AuthSession, useAuthStore } from './authStore.js';
import { getTelegramMiniApp } from './telegramMiniApp.js';

export function useTelegramMiniAppAuth(): {
  isTelegramMiniApp: boolean;
  isPending: boolean;
  isError: boolean;
  error: Error | null;
} {
  const setSession = useAuthStore((s) => s.setSession);
  const startedRef = useRef(false);
  const webApp = getTelegramMiniApp();
  const isTelegramMiniApp = webApp !== null;

  const mutation = useMutation<AuthSession, Error, string>({
    mutationFn: (initData) =>
      apiFetch<AuthSession>('/auth/telegram-mini-app', {
        method: 'POST',
        body: JSON.stringify({ initData, timezone: detectTimezone() }),
      }),
    onSuccess: (session) => {
      setSession(session);
    },
  });

  useEffect(() => {
    if (startedRef.current) return;
    if (!webApp?.initData) return;
    startedRef.current = true;
    webApp.ready?.();
    webApp.expand?.();
    mutation.mutate(webApp.initData);
  }, [mutation, webApp]);

  return {
    isTelegramMiniApp,
    isPending: isTelegramMiniApp && (mutation.isIdle || mutation.isPending),
    isError: mutation.isError,
    error: mutation.error,
  };
}
