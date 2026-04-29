import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch, ApiError } from '../api/apiFetch.js';
import { useAuthStore, type AuthSession } from '../auth/authStore.js';
import {
  cleanupOAuthState,
  extractCodeFromUrl,
  extractDeviceIdFromUrl,
  extractErrorFromUrl,
  extractStateFromUrl,
  getCodeVerifier,
  getRedirectUri,
  getStoredState,
} from '../auth/vkAuth.js';

function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function VkAuthCallbackScreen(): JSX.Element {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const calledRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;

    void (async () => {
      const oauthError = extractErrorFromUrl();
      if (oauthError) {
        cleanupOAuthState();
        setError(oauthError);
        return;
      }

      const code = extractCodeFromUrl();
      if (!code) {
        cleanupOAuthState();
        setError('Отсутствует код авторизации');
        return;
      }

      const state = extractStateFromUrl();
      if (!state || state !== getStoredState()) {
        cleanupOAuthState();
        setError('Не удалось проверить state авторизации');
        return;
      }

      try {
        const session = await apiFetch<AuthSession>('/auth/vk', {
          method: 'POST',
          body: JSON.stringify({
            code,
            codeVerifier: getCodeVerifier(),
            deviceId: extractDeviceIdFromUrl(),
            redirectUri: getRedirectUri(),
            timezone: detectTimezone(),
          }),
        });
        cleanupOAuthState();
        setSession(session);
        navigate('/', { replace: true });
      } catch (err) {
        cleanupOAuthState();
        setError(err instanceof ApiError ? err.message : 'Ошибка авторизации');
      }
    })();
  }, [navigate, setSession]);

  return (
    <main
      className="screen"
      style={{ alignItems: 'center', justifyContent: 'center', padding: 20, textAlign: 'center' }}
    >
      {error ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' }}>
          <h1 style={{ fontSize: 22, margin: 0 }}>Ошибка входа</h1>
          <div role="alert" style={{ color: 'var(--red-deep)', fontSize: 14 }}>
            {error}
          </div>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => navigate('/login', { replace: true })}
          >
            Вернуться ко входу
          </button>
        </div>
      ) : (
        <div style={{ fontSize: 14, color: 'var(--muted)' }}>Авторизация через ВКонтакте…</div>
      )}
    </main>
  );
}
