import { useAuthStore } from '../../auth/authStore.js';
import { VisitorGameGate } from '../VisitorGameGate.js';
import { visitorChanged } from '../visitorApi.js';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { gameApi } from './api.js';
interface Lease {
  reserve: (newParty?: boolean) => Promise<void>;
  release: (finish?: boolean) => Promise<void>;
}
const LeaseContext = createContext<Lease | null>(null);
export const useLocalCardLease = () => useContext(LeaseContext);
export function LocalCardAdmission({ children }: { children: ReactNode }) {
  const owner = useAuthStore((state) => state.user?.id) ?? 'preview';
  const storageKey = `bar-maria-admission:${owner}`;
  const [restored] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem(`bar-maria-game:${owner}`) ?? 'null') as {
        result: number | string | null;
        hands: unknown[];
      } | null;
    } catch {
      return null;
    }
  });
  const id = useRef(
    (restored && Array.isArray(restored.hands) ? sessionStorage.getItem(storageKey) : null) ??
      crypto.randomUUID(),
  );
  const [ready, setReady] = useState(!!restored && restored.result !== null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const mounted = useRef(false),
    active = useRef(!ready);
  const inFlight = useRef<Promise<void> | null>(null),
    leaving = useRef<Promise<void> | null>(null);
  const nextParty = useRef<Promise<void> | null>(null),
    nextId = useRef<string | null>(null);
  const reserve = (newParty = false): Promise<void> => {
    if (newParty && nextParty.current) return nextParty.current;
    if (!newParty && inFlight.current) return inFlight.current;
    const prior = inFlight.current;
    const release = leaving.current;
    const request = Promise.all([prior?.catch(() => {}), release?.catch(() => {})])
      .then(async () => {
        if (newParty) {
          if (!nextId.current) {
            await gameApi.localCards(id.current, true, true);
            nextId.current = crypto.randomUUID();
          }
          id.current = nextId.current;
        }
        sessionStorage.setItem(storageKey, id.current);
        active.current = true;
        await gameApi.localCards(id.current);
        if (newParty) nextId.current = null;
        if (mounted.current) {
          setReady(true);
          setError(null);
          visitorChanged();
        }
      })
      .catch((e) => {
        if (newParty) active.current = false;
        if (mounted.current) {
          visitorChanged();
          setError(e instanceof Error ? e.message : 'Не удалось подтвердить карточную партию.');
        }
        throw e;
      })
      .finally(() => {
        if (inFlight.current === request) inFlight.current = null;
        if (nextParty.current === request) nextParty.current = null;
      });
    inFlight.current = request;
    if (newParty) nextParty.current = request;
    return request;
  };
  const release = (finish = false) => {
    active.current = false;
    const captured = id.current;
    const pending = inFlight.current;
    const request = (pending?.catch(() => {}) ?? Promise.resolve())
      .then(() => gameApi.localCards(captured, true, finish))
      .then(() => {});
    leaving.current = request;
    return request;
  };
  const lease = useRef<Lease>({ reserve, release });
  lease.current = { reserve, release };
  useEffect(() => {
    mounted.current = true;
    if (!ready) void lease.current.reserve().catch(() => {});
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
        <VisitorGameGate character="maria">
          <p role={error ? 'alert' : 'status'}>{error ?? 'Готовим карточный стол…'}</p>
        </VisitorGameGate>
        <button className="btn btn--ghost" onClick={() => navigate('/bar')}>
          Вернуться в бар
        </button>
      </main>
    );
  return (
    <LeaseContext.Provider value={lease.current}>
      {error && (
        <VisitorGameGate character="maria">
          <p role="alert">{error}</p>
        </VisitorGameGate>
      )}
      {children}
    </LeaseContext.Provider>
  );
}
