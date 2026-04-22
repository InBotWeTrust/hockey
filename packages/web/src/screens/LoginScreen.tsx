import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { TelegramLoginButton, type TelegramAuthPayload } from '../auth/TelegramLoginButton.js';
import { apiFetch, ApiError } from '../api/apiFetch.js';
import { useAuthStore, type AuthSession } from '../auth/authStore.js';

const BG = '#f4f7fb';
const TEXT = '#0f172a';
const MUTED = '#64748b';
const ACCENT = '#0f172a';
const ERROR = '#dc2626';

export function LoginScreen(): JSX.Element {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const botUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME ?? '';

  const mutation = useMutation<AuthSession, Error, TelegramAuthPayload>({
    mutationFn: (payload) =>
      apiFetch<AuthSession>('/auth/telegram', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: (session) => {
      setSession(session);
      navigate('/', { replace: true });
    },
  });

  return (
    <main
      style={{
        minHeight: '100vh',
        background: BG,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 24px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        color: TEXT,
        textAlign: 'center',
      }}
    >
      <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: -0.5, margin: '0 0 12px' }}>
        Ultimate Hockey
      </h1>
      <div style={{ fontSize: 15, color: MUTED, marginBottom: 32, lineHeight: 1.5 }}>
        Войдите через Telegram, чтобы начать тренировку.
      </div>

      <TelegramLoginButton
        botUsername={botUsername}
        onAuth={(payload) => mutation.mutate(payload)}
      />

      {mutation.isPending && (
        <div style={{ marginTop: 16, fontSize: 14, color: MUTED }}>Проверяем профиль…</div>
      )}
      {mutation.isError && (
        <div role="alert" style={{ marginTop: 16, fontSize: 14, color: ERROR }}>
          {mutation.error instanceof ApiError ? mutation.error.message : 'Ошибка входа'}
        </div>
      )}

      {import.meta.env.DEV && (
        <button
          type="button"
          onClick={async () => {
            try {
              const session = await apiFetch<AuthSession>('/auth/dev', { method: 'POST' });
              setSession(session);
              navigate('/', { replace: true });
            } catch (err) {
              // eslint-disable-next-line no-console
              console.error('dev login failed', err);
            }
          }}
          style={{
            marginTop: 24,
            padding: '14px 24px',
            width: '100%',
            maxWidth: 320,
            background: ACCENT,
            color: '#ffffff',
            border: 'none',
            borderRadius: 14,
            fontSize: 15,
            fontWeight: 600,
            cursor: 'pointer',
            letterSpacing: 0.2,
          }}
        >
          Войти как Dev (только dev-режим)
        </button>
      )}
    </main>
  );
}
