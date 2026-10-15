import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { gameApi } from './api.js';
interface Lease {
  reserve: () => Promise<void>;
  release: () => Promise<void>;
}
const LeaseContext = createContext<Lease | null>(null);
export const useLocalCardLease = () => useContext(LeaseContext);
export function LocalCardAdmission({ children }: { children: ReactNode }) {
  const id = useRef(crypto.randomUUID()),
    [ready, setReady] = useState(false),
    [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const mounted = useRef(false),
    active = useRef(true),
    inFlight = useRef<Promise<void> | null>(null);
  const reserve = (): Promise<void> => {
    active.current = true;
    if (inFlight.current) return inFlight.current;
    const request = gameApi
      .localCards(id.current)
      .then(() => {
        if (mounted.current) {
          setReady(true);
          setError(null);
        }
      })
      .catch((e) => {
        if (mounted.current)
          setError(e instanceof Error ? e.message : 'Не удалось подтвердить карточную партию.');
        throw e;
      })
      .finally(() => {
        inFlight.current = null;
      });
    inFlight.current = request;
    return request;
  };
  const release = async () => {
    active.current = false;
    await inFlight.current?.catch(() => {});
    await gameApi.localCards(id.current, true);
  };
  const lease = useRef<Lease>({ reserve, release });
  lease.current = { reserve, release };
  useEffect(() => {
    mounted.current = true;
    void lease.current.reserve().catch(() => {});
    const timer = setInterval(() => {
      if (active.current) void lease.current.reserve().catch(() => {});
    }, 20000);
    return () => {
      mounted.current = false;
      clearInterval(timer);
      void lease.current.release().catch(() => {});
    };
  }, []);
  if (!ready)
    return (
      <main className="bar-game-screen">
        <p role={error ? 'alert' : 'status'}>{error ?? 'Готовим карточный стол…'}</p>
        <button className="btn btn--ghost" onClick={() => navigate('/bar')}>
          Вернуться в бар
        </button>
      </main>
    );
  return (
    <LeaseContext.Provider value={lease.current}>
      {error && (
        <p role="alert">Связь с сервером прервалась. Карты сохранены; повторяем подключение.</p>
      )}
      {children}
    </LeaseContext.Provider>
  );
}
