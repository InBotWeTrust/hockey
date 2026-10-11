import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchBarAccess, type BarAccess } from './olegFightApi.js';
import { OlegFightPanel } from './OlegFightPanel.js';
export function BarAccessGate({ children }: { children: ReactNode }) {
  const [access, setAccess] = useState<BarAccess | null>(null),
    [error, setError] = useState(false),
    [retry, setRetry] = useState(0);
  const navigate = useNavigate();
  useEffect(() => {
    let cancelled = false,
      pending = false,
      requested = false;
    const read = async () => {
      if (pending) {
        requested = true;
        return;
      }
      pending = true;
      try {
        const next = await fetchBarAccess();
        if (!cancelled) {
          setAccess(next);
          setError(false);
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        pending = false;
        if (requested && !cancelled) {
          requested = false;
          void read();
        }
      }
    };
    void read();
    const timer = setInterval(() => void read(), 5000);
    const changed = () => void read();
    window.addEventListener('bar-access-changed', changed);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener('bar-access-changed', changed);
    };
  }, [retry]);
  if (access?.fightId)
    return (
      <main className="screen bar-oleg-screen">
        <OlegFightPanel id={access.fightId} onDone={setAccess} />
      </main>
    );
  if (access?.blockedUntil)
    return (
      <main className="screen bar-oleg-status">
        <h1>«4-й период» закрыт для тебя</h1>
        <p>Олег сегодня тебя больше не пустит.</p>
        <p>
          Можно вернуться{' '}
          {new Date(access.blockedUntil).toLocaleString('ru-RU', {
            day: 'numeric',
            month: 'long',
            hour: '2-digit',
            minute: '2-digit',
          })}
          .
        </p>
        <button className="btn btn--cta" onClick={() => navigate('/')}>
          На карту
        </button>
      </main>
    );
  if (error)
    return (
      <main className="screen bar-oleg-status">
        <p role="alert">Не удалось проверить доступ в бар.</p>
        <button className="btn btn--cta" onClick={() => setRetry((n) => n + 1)}>
          Повторить
        </button>
      </main>
    );
  if (!access)
    return (
      <main className="screen bar-oleg-status">
        <p role="status">Открываем бар…</p>
      </main>
    );
  return <>{children}</>;
}
