import { DurakLaunchModal } from './DurakModals.js';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { SegmentedTabs } from '../../components/SegmentedTabs.js';
import { UserAvatar } from '../../chat/components/UserAvatar.js';
import { useAuthStore } from '../../auth/authStore.js';
import {
  lobby,
  queue,
  invite,
  respond,
  searchPlayers,
  type Lobby,
  type PickerPlayer,
} from './onlineApi.js';
import '../bar.css';
import './durak.css';
export function OnlineDurakLobby() {
  const navigate = useNavigate();
  const userId = useAuthStore((state) => state.user?.id);
  const [mariaOpen, setMariaOpen] = useState(false);
  const [tab, setTab] = useState<'find' | 'challenge'>('find');
  const [state, setState] = useState<Lobby | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [q, setQ] = useState('');
  const [players, setPlayers] = useState<PickerPlayer[]>([]);
  const serial = useRef(0);
  const actionVersion = useRef(0);
  const open = (id: string) => navigate(`/bar/cards/match/${id}`);
  useEffect(() => {
    let alive = true;
    let reading = false;
    const refresh = async () => {
      if (reading || lock.current || document.hidden) return;
      const version = actionVersion.current;
      reading = true;
      try {
        const next = await lobby();
        if (alive && version === actionVersion.current) {
          setState(next);
          setError(null);
          if (next.matchId) open(next.matchId);
        }
      } catch {
        if (alive && version === actionVersion.current)
          setError('Не удалось обновить список. Повторяем…');
      } finally {
        reading = false;
      }
    };
    void refresh();
    const interval = setInterval(() => void refresh(), 2000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      alive = false;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  useEffect(() => {
    const ticket = ++serial.current;
    setPlayers([]);
    if (!q.trim()) return;
    const timer = setTimeout(() => {
      void searchPlayers(q.trim())
        .then((rows) => {
          if (ticket === serial.current) setPlayers(rows);
        })
        .catch(() => {
          if (ticket === serial.current) setError('Не удалось найти игроков.');
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);
  const run = async (task: () => Promise<unknown>) => {
    if (lock.current) return;
    lock.current = true;
    actionVersion.current++;
    setBusy(true);
    setError(null);
    try {
      await task();
      const next = await lobby();
      setState(next);
      if (next.matchId) open(next.matchId);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Не удалось выполнить действие.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const outgoing = state?.invites.some((i) => i.status === 'pending' && i.sender_id === userId);
  return (
    <main className="screen bar-screen online-durak-lobby">
      <header className="bar-header">
        <button className="icon-btn" aria-label="Назад" onClick={() => navigate('/bar')}>
          <ChevronLeft size={22} />
        </button>
        <h1>Дурак</h1>
      </header>
      {mariaOpen && (
        <DurakLaunchModal
          onClose={() => setMariaOpen(false)}
          onPlay={() => navigate('/bar/cards/maria')}
        />
      )}
      <section className="bar-content">
        <button
          type="button"
          className="section-card-surface sections-quick-card sections-quick-card--active sections-quick-card--wide online-durak-maria"
          aria-label="Сыграть с Марией"
          disabled={
            busy ||
            !!state?.searching ||
            !!outgoing ||
            !!state?.invites.some((i) => i.status === 'pending')
          }
          onClick={() => setMariaOpen(true)}
        >
          <span className="sections-quick-card__art" aria-hidden="true">
            <img src="/bar/cards/maria-entry-v1.webp" alt="" />
          </span>
          <span className="sections-quick-card__content">
            <span className="sections-quick-card__title">Сыграть с Марией</span>
            <span className="sections-quick-card__meta">Подкидной дурак · 36 карт</span>
          </span>
          <ChevronRight className="card-chevron" aria-hidden="true" size={19} strokeWidth={2.7} />
        </button>
        <h2 className="section-label">Текущие партии</h2>
        <p className="bar-empty">{state ? 'Активных партий пока нет' : 'Загружаем партии…'}</p>
        {error && (
          <p role="alert" className="bar-connection">
            {error}
          </p>
        )}
        {state?.invites
          .filter((i) => i.status === 'pending')
          .map((i) => (
            <div className="glass online-durak-invite" key={i.id}>
              <strong>
                {i.sender_id === userId
                  ? `Вызов: ${i.receiver_name}`
                  : `${i.sender_name} приглашает сыграть`}
              </strong>
              <div className="modal-actions">
                {i.sender_id === userId ? (
                  <button
                    className="btn btn--ghost"
                    disabled={busy}
                    onClick={() => void run(() => respond(i.id, 'cancel'))}
                  >
                    Отменить
                  </button>
                ) : (
                  <>
                    <button
                      className="btn btn--ghost"
                      disabled={busy}
                      onClick={() => void run(() => respond(i.id, 'decline'))}
                    >
                      Отказаться
                    </button>
                    <button
                      className="btn btn--cta"
                      disabled={busy}
                      onClick={() => void run(() => respond(i.id, 'accept'))}
                    >
                      Играть
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        <h2 className="section-label">Новая партия</h2>
        <SegmentedTabs
          items={[
            { id: 'find', label: 'Найти' },
            { id: 'challenge', label: 'Вызвать' },
          ]}
          activeTab={tab}
          onChange={setTab}
          ariaLabel="Способ встречи"
        />
        {tab === 'find' ? (
          <section className="online-durak-search">
            {state?.searching && (
              <p role="status" className="bar-empty">
                Ищем соперника…
              </p>
            )}
            <button
              className="btn btn--cta"
              disabled={busy || !state || (!state.searching && !!outgoing)}
              onClick={() => void run(() => queue(!!state?.searching))}
            >
              {state?.searching ? 'Отменить поиск' : 'Начать поиск'}
            </button>
          </section>
        ) : (
          <section className="online-durak-search">
            <input
              className="chat-create-field"
              aria-label="Имя соперника"
              placeholder="Имя соперника"
              value={q}
              onChange={(event) => setQ(event.target.value)}
            />
            {players.map((player) => (
              <div className="glass online-durak-player" key={player.userId}>
                <UserAvatar
                  avatarUrl={player.avatarUrl ?? undefined}
                  name={player.displayName}
                  size={40}
                />
                <strong>{player.displayName}</strong>
                <button
                  className="btn btn--cta"
                  disabled={busy || !!outgoing || !!state?.searching}
                  onClick={() => void run(() => invite(player.userId))}
                >
                  Вызвать
                </button>
              </div>
            ))}
          </section>
        )}
      </section>
    </main>
  );
}
