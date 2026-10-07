import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { SegmentedTabs } from '../components/SegmentedTabs.js';
import { ChevronLeft } from 'lucide-react';
import { useAuthStore } from '../auth/authStore.js';
import { refreshAccessToken } from '../api/apiFetch.js';
import { BarSocket, type BarSocketStatus } from './BarSocket.js';
import { ReplayBuffer } from './replay.js';
import { SpectatorRink } from './SpectatorRink.js';
import type { BarBoard, BarLive, BarMatch } from './types.js';
import './bar.css';

function useBarSnapshot(resource: string) {
  const [data, setData] = useState<BarBoard | BarLive | null>(null);
  const [status, setStatus] = useState<BarSocketStatus>('connecting');
  useEffect(() => {
    setData(null);
    const socket = new BarSocket({
      resource,
      getToken: () => useAuthStore.getState().accessToken,
      refresh: refreshAccessToken,
      onSnapshot: setData,
      onStatus: setStatus,
    });
    const visibility = () => {
      if (document.hidden) socket.disconnect();
      else socket.connect();
    };
    visibility();
    document.addEventListener('visibilitychange', visibility);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      socket.disconnect();
    };
  }, [resource]);
  return { data, status };
}
const statusText: Record<BarSocketStatus, string> = {
  connecting: 'Подключаем трансляцию…',
  ready: '',
  reconnecting: 'Восстанавливаем связь…',
  closed: 'Связь с трансляцией остановлена',
};

export function BarScreen(): JSX.Element {
  const navigate = useNavigate();
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState<'online' | 'upcoming'>('online');
  const { data, status } = useBarSnapshot(`page=${page}`);
  const board = data && 'online' in data ? data : null;
  return (
    <main className="screen bar-screen">
      <BarHeader title="Бар" onBack={() => navigate('/sections')} />
      <section className="bar-content">
        <h2 className="section-label bar-section-label">Выбери события</h2>
        <div className="bar-filters">
          <SegmentedTabs
            items={[{ id: 'online', label: 'Онлайн' }, { id: 'upcoming', label: 'Предстоящие' }]}
            activeTab={filter}
            ariaLabel="Матчи в баре"
            onChange={(next) => {
              setFilter(next);
              setPage(0);
            }}
          />
        </div>
        {status !== 'ready' && (
          <p role="status" className="bar-connection">
            {statusText[status]}
          </p>
        )}
        {board && (
          <>
            <MatchGroup
              title={filter === 'online' ? 'Онлайн' : 'Предстоящие'}
              matches={board[filter]}
              total={board.totals?.[filter]}
              empty={filter === 'online' ? 'Сейчас никто не играет' : 'Пока нет предстоящих матчей'}
            />
            {(page > 0 || board.hasMore) && (
              <div className="bar-pagination">
                <button
                  className="btn btn--ghost"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Назад
                </button>
                <span>Страница {page + 1}</span>
                <button
                  className="btn btn--ghost"
                  disabled={!board.hasMore}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Дальше
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
function MatchGroup({
  title,
  matches,
  total,
  empty,
}: {
  title: string;
  matches: BarMatch[];
  total?: number | undefined;
  empty: string;
}): JSX.Element {
  const navigate = useNavigate();
  return (
    <section className="bar-match-group" aria-label={title}>
      <h2 className="section-label bar-section-label">
        Текущие встречи{total === undefined ? '' : ` (${total})`}
      </h2>
      {matches.length === 0 ? (
        <p className="bar-empty">{empty}</p>
      ) : (
        matches.map((match) => (
          <button
            key={`${match.kind}:${match.id}`}
            type="button"
            className="bar-match-card"
            disabled={match.group !== 'online'}
            onClick={() => navigate(`/bar/${match.kind}/${match.id}`)}
          >
            <span className="bar-match-heading">
              <span className="bar-match-kind">
                {match.kind === 'duel' ? 'Дуэль' : 'Турнир'}
                {match.title ? ` · ${match.title}` : ''}
              </span>
              {match.kind === 'tournament' && match.startsAt ? (
                <time className="bar-match-start" dateTime={match.startsAt}>
                  Начало: {new Date(match.startsAt).toLocaleString('ru-RU', {
                    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                  })}
                </time>
              ) : null}
              {match.group === 'online' && match.players.every((p) => p.state === 'break_active') ? (
                <span className="bar-match-status">Перерыв</span>
              ) : match.group !== 'online' && match.status === 'invited' ? (
                <span className="bar-match-status">Ожидает ответа</span>
              ) : match.group !== 'online' && !match.startsAt ? (
                <span className="bar-match-status">Ожидает начала</span>
              ) : null}
            </span>
            <span className="bar-match-players">
              <PlayerBadge player={match.players[0]} />
              <strong className="bar-score">
                {match.group === 'online'
                  ? `${match.players[0].goals} : ${match.players[1].goals}`
                  : '—'}
              </strong>
              <PlayerBadge player={match.players[1]} />
            </span>
          </button>
        ))
      )}
    </section>
  );
}
function PlayerBadge({ player }: { player: BarMatch['players'][number] }): JSX.Element {
  return (
    <span className="bar-player">
      {player.avatarUrl ? (
        <img src={player.avatarUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
      ) : (
        <span className="bar-avatar-fallback" aria-hidden="true">
          {player.name.slice(0, 1)}
        </span>
      )}
      <span>{player.name}</span>
    </span>
  );
}
function BarHeader({ title, onBack }: { title: string; onBack: () => void }): JSX.Element {
  return (
    <header className="bar-header">
      <button type="button" className="icon-btn" aria-label="Назад" onClick={onBack}>
        <ChevronLeft size={22} />
      </button>
      <h1>{title}</h1>
    </header>
  );
}
export function BarMatchScreen(): JSX.Element {
  const navigate = useNavigate();
  const { kind, id } = useParams();
  const resource = `kind=${encodeURIComponent(kind ?? '')}&id=${encodeURIComponent(id ?? '')}`;
  const { data, status } = useBarSnapshot(resource);
  const live = data && 'match' in data ? data : null;
  const buffer = useMemo(() => new ReplayBuffer(), [resource, live?.playbackId]);
  const initialized = useRef(false);
  useEffect(() => {
    initialized.current = false;
  }, [buffer]);
  useEffect(() => {
    if (live === null) return;
    buffer.push(live.shots, !initialized.current);
    initialized.current = true;
  }, [live, buffer]);
  return (
    <main className="screen bar-screen bar-screen--match">
      <BarHeader title="Трансляция" onBack={() => navigate('/bar')} />
      <section className="bar-board">
        {status !== 'ready' && (
          <p role="status" className="bar-connection">
            {statusText[status]}
          </p>
        )}
        {live?.match === null && <p className="bar-empty">Матч больше недоступен</p>}
        {live?.match && (
          <>
            <p className="bar-intro">
              {live.match.kind === 'duel' ? 'Дуэль' : (live.match.title ?? 'Турнир')}
            </p>
            <p className="bar-live-score">
              {live.match.players[0].goals} : {live.match.players[1].goals}
            </p>
            {live.match.group === 'finished' && (
              <p role="status" className="bar-final">
                Матч завершён
              </p>
            )}
            <div className="bar-rinks">
              {live.match.players.map((player) => (
                <SpectatorRink key={player.userId} player={player} buffer={buffer} />
              ))}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
