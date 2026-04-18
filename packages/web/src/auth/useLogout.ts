import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from './authStore.js';

export function useLogout(): () => Promise<void> {
  const navigate = useNavigate();
  return useCallback(async () => {
    const { refreshToken, clearSession } = useAuthStore.getState();
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      // fire-and-forget
    }
    clearSession();
    navigate('/login', { replace: true });
  }, [navigate]);
}
