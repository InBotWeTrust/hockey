import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { TelegramLoginButton, type TelegramAuthPayload } from '../auth/TelegramLoginButton.js';
import { apiFetch, ApiError } from '../api/apiFetch.js';
import { useAuthStore, type AuthSession } from '../auth/authStore.js';
import { startVkOAuth } from '../auth/vkAuth.js';
import { detectTimezone } from '../auth/timezone.js';

export function LoginScreen(): JSX.Element {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const botUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME ?? '';
  const [devError, setDevError] = useState<string | null>(null);
  const [devPending, setDevPending] = useState(false);
  const [vkError, setVkError] = useState<string | null>(null);
  const [vkPending, setVkPending] = useState(false);

  const mutation = useMutation<AuthSession, Error, TelegramAuthPayload>({
    mutationFn: (payload) =>
      apiFetch<AuthSession>('/auth/telegram', {
        method: 'POST',
        body: JSON.stringify({ ...payload, timezone: detectTimezone() }),
      }),
    onSuccess: (session) => {
      setSession(session);
      navigate('/', { replace: true });
    },
  });

  return (
    <main
      className="screen"
      style={{
        textAlign: 'center',
        height: '100dvh',
        minHeight: 0,
        overflow: 'hidden',
        paddingTop: 'var(--app-safe-top)',
        paddingBottom: 'max(12px, var(--app-safe-bottom))',
      }}
    >
      <div style={{ padding: 'clamp(24px, 5dvh, 40px) 20px 8px' }}>
        <img
          src="/icons/app-logo.webp"
          alt="Ultimate Hockey"
          style={{
            width: 'clamp(94px, 22dvh, 128px)',
            height: 'clamp(94px, 22dvh, 128px)',
            borderRadius: 28,
            objectFit: 'cover',
            display: 'inline-block',
            marginBottom: 12,
            boxShadow:
              '0 18px 44px rgba(15, 23, 42, 0.24), 0 0 0 1px rgba(255,255,255,0.72)',
          }}
        />
        <h1 style={{ fontSize: 29, fontWeight: 800, letterSpacing: 0, margin: '0 0 8px' }}>
          Ultimate Hockey
        </h1>
        <div style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.42 }}>
          Живи жизнью профессионального хоккеиста
        </div>
      </div>

      <div
        style={{
          padding: 'clamp(10px, 2.5dvh, 16px) 20px',
          display: 'flex',
          justifyContent: 'center',
          gap: 6,
          flexWrap: 'wrap',
        }}
      >
        <span className="pill" style={{ fontSize: 11, padding: '5px 12px' }}>
          тренировки
        </span>
        <span className="pill" style={{ fontSize: 11, padding: '5px 12px' }}>
          игры
        </span>
        <span className="pill" style={{ fontSize: 11, padding: '5px 12px' }}>
          соревнования
        </span>
        <span className="pill" style={{ fontSize: 11, padding: '5px 12px' }}>
          призы
        </span>
      </div>

      <div style={{ flex: 1, minHeight: 8 }} />

      <div
        style={{
          padding: 'clamp(12px, 3dvh, 22px) 20px 0',
          display: 'flex',
          flexDirection: 'column',
          gap: 9,
        }}
      >
        <TelegramLoginButton
          botUsername={botUsername}
          onAuth={(payload) => mutation.mutate(payload)}
        />

        <button
          type="button"
          className="btn"
          disabled={vkPending}
          onClick={async () => {
            setVkError(null);
            setVkPending(true);
            try {
              await startVkOAuth();
            } catch (err) {
              setVkPending(false);
              setVkError(err instanceof Error ? err.message : 'Ошибка входа через ВКонтакте');
            }
          }}
          style={{
            alignSelf: 'center',
            width: 242,
            height: 40,
            padding: '0 14px',
            borderRadius: 12,
            background: '#0077ff',
            color: '#ffffff',
            justifyContent: 'center',
            fontSize: 16,
            fontWeight: 700,
            letterSpacing: 0,
            boxShadow: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          Войти через ВКонтакте
        </button>

        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => navigate('/demo')}
          style={{
            alignSelf: 'center',
            width: 242,
            height: 40,
            padding: '0 14px',
            borderRadius: 12,
            justifyContent: 'center',
            fontSize: 15,
            fontWeight: 800,
            letterSpacing: 0,
            whiteSpace: 'nowrap',
          }}
        >
          Демо-режим
        </button>

        {mutation.isPending && (
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>Проверяем профиль…</div>
        )}
        {mutation.isError && (
          <div role="alert" style={{ fontSize: 13, color: 'var(--red-deep)' }}>
            {mutation.error instanceof ApiError ? mutation.error.message : 'Ошибка входа'}
          </div>
        )}
        {vkError && (
          <div role="alert" style={{ fontSize: 13, color: 'var(--red-deep)' }}>
            {vkError}
          </div>
        )}

        {import.meta.env.DEV && (
          <>
            <button
              type="button"
              className="btn btn--ghost"
              disabled={devPending}
              onClick={async () => {
                setDevError(null);
                setDevPending(true);
                try {
                  const session = await apiFetch<AuthSession>('/auth/dev', {
                    method: 'POST',
                    body: JSON.stringify({ timezone: detectTimezone() }),
                  });
                  setSession(session);
                  navigate('/', { replace: true });
                } catch (err) {
                  // eslint-disable-next-line no-console
                  console.error('dev login failed', err);
                  const msg =
                    err instanceof ApiError
                      ? `${err.status} ${err.code}: ${err.message}`
                      : err instanceof Error
                        ? err.message
                        : 'Ошибка входа (см. console)';
                  setDevError(msg);
                } finally {
                  setDevPending(false);
                }
              }}
              style={{ justifyContent: 'center' }}
            >
              Войти как Dev
            </button>
            {devError && (
              <div
                role="alert"
                style={{ fontSize: 13, color: 'var(--red-deep, #b91c1c)', textAlign: 'center' }}
              >
                {devError}
              </div>
            )}
          </>
        )}

        <div
          style={{
            textAlign: 'center',
            fontSize: 11,
            color: 'var(--muted)',
            marginTop: 4,
            lineHeight: 1.5,
          }}
        >
          Нажимая «Войти», вы соглашаетесь
          <br />с условиями использования
        </div>
      </div>
    </main>
  );
}
