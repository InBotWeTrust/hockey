import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from './authStore.js';
import { getApiBaseUrl, isNativeAndroid } from '../platform/runtime.js';
import { sessionStorage } from './sessionStorage.js';
import { nativePush } from '../platform/push.js';

async function removeNativePushRegistration(): Promise<void> {
  if (!isNativeAndroid()) return;
  await Promise.race([
    nativePush.unsubscribe(),
    new Promise<void>((resolve) => window.setTimeout(resolve, 1500)),
  ]);
}

export function useLogout(): () => Promise<void> {
  const navigate = useNavigate();
  return useCallback(async () => {
    const { refreshToken, clearSession } = useAuthStore.getState();
    await removeNativePushRegistration().catch(() => undefined);
    try {
      await fetch(`${getApiBaseUrl()}/auth/logout`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      // fire-and-forget
    }
    clearSession();
    await sessionStorage.clear().catch(() => undefined);
    navigate('/login', { replace: true });
  }, [navigate]);
}
