import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from './authStore.js';
import { getApiBaseUrl } from '../platform/runtime.js';
import { sessionStorage } from './sessionStorage.js';

export function useLogout(): () => Promise<void> {
  const navigate = useNavigate();
  return useCallback(async () => {
    const { refreshToken, clearSession } = useAuthStore.getState();
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
