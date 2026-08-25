import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { TelegramLoginButton, type TelegramAuthPayload } from '../auth/TelegramLoginButton.js';
import { apiFetch, ApiError } from '../api/apiFetch.js';
import { useAuthStore, type AuthSession } from '../auth/authStore.js';
import { startVkOAuth } from '../auth/vkAuth.js';
import { detectTimezone } from '../auth/timezone.js';
import { useTelegramMiniAppAuth } from '../auth/useTelegramMiniAppAuth.js';

export function LoginScreen(): JSX.Element {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const accessToken = useAuthStore((s) => s.accessToken);
  const botUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME ?? '';
  const devCodeLoginEnabled = import.meta.env.VITE_DEV_ACCESS_CODE_LOGIN_ENABLED === 'true';
  const [devCode, setDevCode] = useState('');
  const [devCodeError, setDevCodeError] = useState<string | null>(null);
  const [devCodePending, setDevCodePending] = useState(false);
  const [devError, setDevError] = useState<string | null>(null);
  const [devPending, setDevPending] = useState(false);
  const [vkError, setVkError] = useState<string | null>(null);
  const [vkPending, setVkPending] = useState(false);
  const miniAppAuth = useTelegramMiniAppAuth();

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

  useEffect(() => {
    if (miniAppAuth.isTelegramMiniApp && accessToken) {
      navigate('/', { replace: true });
    }
  }, [accessToken, miniAppAuth.isTelegramMiniApp, navigate]);

  if (miniAppAuth.isTelegramMiniApp) {
    return (
      <main className="screen" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--muted)', fontSize: 14 }}>
          {miniAppAuth.isError ? 'Не удалось войти через Telegram' : 'Входим через Telegram...'}
        </div>
      </main>
    );
  }

  const submitDevCode = async (): Promise<void> => {
    const normalized = devCode.trim();
    if (!normalized) {
      setDevCodeError('Введите код доступа');
      return;
    }
    setDevCodeError(null);
    setDevCodePending(true);
    try {
      const session = await apiFetch<AuthSession>('/auth/dev-code', {
        method: 'POST',
        body: JSON.stringify({ code: normalized, timezone: detectTimezone() }),
      });
      setSession(session);
      navigate('/', { replace: true });
    } catch (err) {
      setDevCodeError(
        err instanceof ApiError && err.status === 401
          ? 'Код не найден или уже отключён'
          : err instanceof ApiError
            ? err.message
            : 'Не удалось войти по коду',
      );
    } finally {
      setDevCodePending(false);
    }
  };

  return (
    <main
      className="screen login-screen"
      style={{
        textAlign: 'center',
        height: '100dvh',
        minHeight: 0,
        overflow: 'hidden',
        paddingTop: 'var(--app-safe-top)',
        paddingBottom: 'max(12px, var(--app-safe-bottom))',
      }}
    >
      <div className="login-screen__brand">
        <img
          src="/icons/app-logo.webp"
          alt="Ультимейт Хоккей"
          className="login-screen__logo"
        />
        <h1 className="login-screen__title">Ультимейт Хоккей</h1>
        <div className="login-screen__tagline">Живи жизнью профессионального хоккеиста</div>
        <div className="login-screen__benefits" aria-label="Возможности игры">
          {['тренировки', 'игры', 'соревнования', 'призы'].map((benefit) => (
            <span key={benefit} className="login-screen__benefit">
              {benefit}
            </span>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 8 }} />

      <div className="login-screen__actions">
        {devCodeLoginEnabled ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submitDevCode();
            }}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              alignItems: 'stretch',
              maxWidth: 360,
              width: '100%',
              margin: '0 auto',
            }}
          >
            <input
              value={devCode}
              onChange={(event) => setDevCode(event.target.value)}
              autoCapitalize="characters"
              autoComplete="one-time-code"
              inputMode="text"
              placeholder="Код доступа"
              aria-label="Код доступа"
              style={{
                width: '100%',
                height: 58,
                borderRadius: 24,
                border: '1px solid rgba(255,255,255,0.82)',
                background: 'rgba(246, 250, 255, 0.82)',
                color: 'var(--ink)',
                padding: '0 20px',
                fontSize: 22,
                fontWeight: 800,
                letterSpacing: 1.8,
                textAlign: 'center',
                outline: 'none',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.74)',
              }}
            />
            <button
              type="submit"
              className="btn btn--cta login-screen__auth-button"
              disabled={devCodePending}
              style={{ justifyContent: 'center' }}
            >
              {devCodePending ? 'Проверяем…' : 'Войти в dev'}
            </button>
          </form>
        ) : (
          <>
            <TelegramLoginButton
              botUsername={botUsername}
              onAuth={(payload) => mutation.mutate(payload)}
            />

            <button
              type="button"
              className="btn login-screen__auth-button"
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
                padding: '0 14px',
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
          </>
        )}

        <button
          type="button"
          className="btn btn--ghost login-screen__auth-button"
          onClick={() => navigate('/demo')}
          style={{
            alignSelf: 'center',
            padding: '0 14px',
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
        {devCodeError && (
          <div role="alert" style={{ fontSize: 13, color: 'var(--red-deep)' }}>
            {devCodeError}
          </div>
        )}

        {import.meta.env.DEV && !devCodeLoginEnabled && (
          <>
            <button
              type="button"
              className="btn btn--ghost login-screen__auth-button"
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
          className="login-screen__terms"
          style={{
            paddingBottom: 'max(2px, var(--app-safe-bottom))',
          }}
        >
          Нажимая «Войти», вы соглашаетесь
          <br />с условиями использования
        </div>
      </div>
    </main>
  );
}
