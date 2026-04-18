import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
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
    <main style={{ padding: '2rem', textAlign: 'center' }}>
      <h1>Ultimate Hockey</h1>
      <p>Войдите через Telegram, чтобы начать тренировку.</p>
      <TelegramLoginButton
        botUsername={botUsername}
        onAuth={(payload) => mutation.mutate(payload)}
      />
      {mutation.isPending && <p>Проверяем профиль…</p>}
      {mutation.isError && (
        <p role="alert" style={{ color: '#b00020' }}>
          {mutation.error instanceof ApiError
            ? mutation.error.message
            : 'Login failed'}
        </p>
      )}
    </main>
  );
}
