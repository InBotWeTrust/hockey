import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DurakTable } from './DurakScreen.js';
import { activePlayer, type Action } from './rules.js';
import { snapshot, move, tableState, type OnlineSnapshot } from './onlineApi.js';
export function OnlineDurakScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [view, setView] = useState<OnlineSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [now, setNow] = useState(Date.now());
  const offset = useRef(0);
  const sending = useRef(false);
  const current = useRef<OnlineSnapshot | null>(null);
  const generation = useRef(0);
  const receive = (next: OnlineSnapshot) => {
    if (
      current.current &&
      next.id === current.current.id &&
      next.revision < current.current.revision
    )
      return;
    current.current = next;
    offset.current = next.serverNow - Date.now();
    setView(next);
    setError(null);
  };
  useEffect(() => {
    current.current = null;
    setView(null);
    setError(null);
    const ticket = ++generation.current;
    let reading = false;
    const load = async () => {
      if (reading || document.hidden) return;
      reading = true;
      try {
        const next = await snapshot(id!);
        if (generation.current === ticket) receive(next);
      } catch {
        if (generation.current === ticket) setError('Связь потеряна. Восстанавливаем…');
      } finally {
        reading = false;
      }
    };
    void load();
    const poll = setInterval(() => void load(), 1500);
    const tick = setInterval(() => setNow(Date.now()), 100);
    document.addEventListener('visibilitychange', load);
    return () => {
      generation.current++;
      clearInterval(poll);
      clearInterval(tick);
      document.removeEventListener('visibilitychange', load);
    };
  }, [id]);
  const send = async (action: Action | 'surrender') => {
    if (sending.current || !current.current) return;
    sending.current = true;
    setPending(true);
    const ticket = generation.current;
    try {
      const next = await move(id!, current.current.revision, action);
      if (generation.current === ticket) receive(next);
    } catch {
      if (generation.current === ticket) setError('Ход не подтверждён. Обновляем состояние…');
      try {
        const next = await snapshot(id!);
        if (generation.current === ticket) receive(next);
      } catch {
        /* Polling retries. */
      }
    } finally {
      sending.current = false;
      if (generation.current === ticket) setPending(false);
    }
  };
  if (!view)
    return (
      <main className="screen bar-screen">
        <p role="status">{error ?? 'Загружаем партию…'}</p>
        <button className="btn btn--ghost" onClick={() => navigate('/bar/cards/online')}>
          Вернуться
        </button>
      </main>
    );
  const game = tableState(view);
  return (
    <DurakTable
      online
      opponent={view.opponent}
      error={error}
      controller={{
        game,
        dispatch: (action) => void send(action),
        surrender: () => void send('surrender'),
        restart: () => navigate('/bar/cards/online'),
        remainingSeconds:
          view.deadline === null
            ? null
            : Math.max(0, Math.ceil((view.deadline - now - offset.current) / 1000)),
        thinking: pending || (game.result === null && activePlayer(game) === 1),
      }}
    />
  );
}
