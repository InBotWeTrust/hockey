import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '../api/apiFetch.js';
import { detectTimezone } from './timezone.js';
import { type AuthSession, useAuthStore } from './authStore.js';
import {
  getTelegramMiniApp,
  isTelegramMiniAppLaunch,
  loadTelegramMiniAppScript,
  type TelegramMiniAppWebApp,
} from './telegramMiniApp.js';

export function useTelegramMiniAppAuth(): {
  isTelegramMiniApp: boolean;
  isPending: boolean;
  isError: boolean;
  error: Error | null;
} {
  const setSession = useAuthStore((s) => s.setSession);
  const startedRef = useRef(false);
  const [webApp, setWebApp] = useState<TelegramMiniAppWebApp | null>(() =>
    getTelegramMiniApp(),
  );
  const [loadError, setLoadError] = useState<Error | null>(null);
  const isTelegramMiniApp = webApp !== null || isTelegramMiniAppLaunch();

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
    if (!isTelegramMiniApp || webApp || loadError) return;

    let active = true;
    void loadTelegramMiniAppScript().then((loadedWebApp) => {
      if (!active) return;
      if (loadedWebApp) {
        setWebApp(loadedWebApp);
        return;
      }
      setLoadError(new Error('telegram_mini_app_script_failed'));
    });

    return () => {
      active = false;
    };
  }, [isTelegramMiniApp, loadError, webApp]);

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
    isPending:
      isTelegramMiniApp && !loadError && (!webApp || mutation.isIdle || mutation.isPending),
    isError: Boolean(loadError) || mutation.isError,
    error: loadError ?? mutation.error,
  };
}
