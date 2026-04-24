import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Send } from 'lucide-react';
import { TelegramLoginButton, type TelegramAuthPayload } from '../auth/TelegramLoginButton.js';
import { apiFetch, ApiError } from '../api/apiFetch.js';
import { useAuthStore, type AuthSession } from '../auth/authStore.js';

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
      className="screen"
      style={{ textAlign: 'center', paddingBottom: 20 }}
    >
      <div style={{ padding: '40px 20px 10px' }}>
        <div
          className="glass-dark"
          style={{
            width: 82,
            height: 82,
            borderRadius: 'var(--r-pill)',
            fontSize: 28,
            fontWeight: 900,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 18,
            boxShadow: '0 12px 30px rgba(15, 23, 42, 0.35)',
            letterSpacing: 1,
          }}
        >
          UH
        </div>
        <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.03em', margin: '0 0 10px' }}>
          Ultimate Hockey
        </h1>
        <div style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.5 }}>
          Поймай окно между движущимся
          <br />
          вратарём и воротами.
          <br />
          Пройди лестницу из 10 боссов.
        </div>
      </div>

      <div
        style={{
          padding: '18px 20px',
          display: 'flex',
          justifyContent: 'center',
          gap: 6,
          flexWrap: 'wrap',
        }}
      >
        <span className="pill" style={{ fontSize: 11, padding: '5px 12px' }}>Тайминг</span>
        <span className="pill" style={{ fontSize: 11, padding: '5px 12px' }}>Рейтинг</span>
        <span className="pill" style={{ fontSize: 11, padding: '5px 12px' }}>10 вратарей</span>
        <span className="pill" style={{ fontSize: 11, padding: '5px 12px' }}>PWA</span>
      </div>

      <div style={{ flex: 1 }} />

      <div style={{ padding: '24px 20px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <TelegramLoginButton
          botUsername={botUsername}
          onAuth={(payload) => mutation.mutate(payload)}
        />

        {mutation.isPending && (
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>Проверяем профиль…</div>
        )}
        {mutation.isError && (
          <div role="alert" style={{ fontSize: 13, color: 'var(--red-deep)' }}>
            {mutation.error instanceof ApiError ? mutation.error.message : 'Ошибка входа'}
          </div>
        )}

        {import.meta.env.DEV && (
          <button
            type="button"
            className="btn btn--ghost"
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
            style={{ justifyContent: 'center' }}
          >
            <Send size={16} />
            Войти как Dev
          </button>
        )}

        <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--muted)', marginTop: 4, lineHeight: 1.5 }}>
          Нажимая «Войти», вы соглашаетесь
          <br />
          с условиями использования
        </div>
      </div>
    </main>
  );
}
