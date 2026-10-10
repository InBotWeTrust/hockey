import { DurakLaunchModal } from './cards/DurakModals.js';
import './cards/durak.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { SegmentedTabs } from '../components/SegmentedTabs.js';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuthStore } from '../auth/authStore.js';
import { refreshAccessToken } from '../api/apiFetch.js';
import { BarSocket, type BarSocketStatus } from './BarSocket.js';
import { ReplayBuffer } from './replay.js';
import { playerStatus, SpectatorRink } from './SpectatorRink.js';
import type { BarBoard, BarLive, BarMatch } from './types.js';
import './bar.css';
import { MatchChat } from './MatchChat.js';

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
  const [cardsOpen, setCardsOpen] = useState(false);
  return (
    <main className="screen bar-screen">
      <BarHeader title="Бар" onBack={() => navigate('/sections')} />
      <section className="bar-content bar-entries" aria-label="Разделы бара">
        <BarEntryCard
          title="Трансляции"
          description="Онлайн и предстоящие матчи"
          artwork="/bar/bar-card-v2.webp"
          onClick={() => navigate('/bar/broadcasts')}
        />
        <BarEntryCard
          title="Дурак с Марией"
          description="Подкидной дурак · 36 карт"
          artwork="/bar/cards/maria-entry-v1.webp"
          onClick={() => setCardsOpen(true)}
        />
      </section>
      {cardsOpen && (
        <DurakLaunchModal
          onClose={() => setCardsOpen(false)}
          onPlay={() => navigate('/bar/cards/maria')}
        />
      )}
    </main>
  );
}

function BarEntryCard({
  title,
  description,
  artwork,
  onClick,
}: {
  title: string;
  description: string;
  artwork: string;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className="section-card-surface sections-quick-card sections-quick-card--active sections-quick-card--wide"
      aria-label={title}
      onClick={onClick}
    >
      <span className="sections-quick-card__art" aria-hidden="true">
        <img src={artwork} alt="" draggable={false} />
      </span>
      <span className="sections-quick-card__content">
        <span className="sections-quick-card__title-row">
          <span className="sections-quick-card__title">{title}</span>
        </span>
        <span className="sections-quick-card__meta">
          <span>{description}</span>
        </span>
      </span>
      <ChevronRight className="card-chevron" aria-hidden="true" size={19} strokeWidth={2.7} />
    </button>
  );
}

export function BarBroadcastsScreen(): JSX.Element {
  const navigate = useNavigate();
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState<'online' | 'upcoming'>('online');
  const { data, status } = useBarSnapshot(`page=${page}`);
  const board = data && 'online' in data ? data : null;
  return (
    <main className="screen bar-screen">
      <BarHeader title="Трансляции" onBack={() => navigate('/bar')} />
      <section className="bar-content">
        <h2 className="section-label bar-section-label">Выбери события</h2>
        <div className="bar-filters">
          <SegmentedTabs
            items={[
              { id: 'online', label: 'Онлайн' },
              { id: 'upcoming', label: 'Предстоящие' },
            ]}
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
            className="game-scoreboard game-scoreboard--stable-surface bar-match-card"
            disabled={match.group !== 'online'}
            onClick={() => navigate(`/bar/${match.kind}/${match.id}`)}
          >
            <span className="bar-match-heading">
              <span className="game-scoreboard__label bar-match-kind">
                {match.kind === 'duel' ? 'Дуэль' : 'Турнир'}
                {match.format
                  ? ` · ${{ express: 'Экспресс', express_plus: 'Микс', classic: 'Классика' }[match.format]}`
                  : ''}
                {match.title ? ` · ${match.title}` : ''}
              </span>
              {match.group === 'upcoming' && match.kind === 'tournament' && match.startsAt ? (
                <time className="game-scoreboard__label bar-match-start" dateTime={match.startsAt}>
                  Начало:{' '}
                  {new Date(match.startsAt).toLocaleString('ru-RU', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
              ) : null}
              {match.group === 'online' &&
              match.players.every((p) => p.state === 'break_active') ? (
                <span className="game-scoreboard__label bar-match-status">Перерыв</span>
              ) : match.group !== 'online' && match.status === 'invited' ? (
                <span className="game-scoreboard__label bar-match-status">Ожидает ответа</span>
              ) : match.group !== 'online' && !match.startsAt ? (
                <span className="game-scoreboard__label bar-match-status">Ожидает начала</span>
              ) : null}
            </span>
            <span className="bar-match-players">
              <PlayerBadge
                player={match.players[0]}
                showState={match.group === 'online'}
                totalPeriods={match.totalPeriods}
              />
              <strong className="game-scoreboard__value bar-score">
                {match.group === 'online'
                  ? `${match.players[0].goals} : ${match.players[1].goals}`
                  : '—'}
              </strong>
              <PlayerBadge
                player={match.players[1]}
                showState={match.group === 'online'}
                totalPeriods={match.totalPeriods}
              />
            </span>
          </button>
        ))
      )}
    </section>
  );
}
function PlayerBadge({
  player,
  showState,
  totalPeriods,
}: {
  player: BarMatch['players'][number];
  showState: boolean;
  totalPeriods: number | null | undefined;
}): JSX.Element {
  return (
    <span className="bar-player">
      {player.avatarUrl ? (
        <img src={player.avatarUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
      ) : (
        <span className="bar-avatar-fallback" aria-hidden="true">
          {player.name.slice(0, 1)}
        </span>
      )}
      <span className="bar-player-copy">
        <span>{player.name}</span>
        {showState && (
          <small>
            {player.state === 'period_active' && totalPeriods
              ? `Период ${player.period}/${totalPeriods}`
              : playerStatus(player)}
          </small>
        )}
      </span>
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
export function BarMatchScreen({ viewerId }: { viewerId?: string } = {}): JSX.Element {
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
      <BarHeader title="Трансляция" onBack={() => navigate('/bar/broadcasts')} />
      <section className="game-scoreboard game-scoreboard--stable-surface bar-board">
        {status !== 'ready' && (
          <p role="status" className="bar-connection">
            {statusText[status]}
          </p>
        )}
        {live?.match === null && <p className="bar-empty">Матч больше недоступен</p>}
        {live?.match && (
          <>
            <p className="section-label bar-match-title">
              {live.match.kind === 'duel' ? 'Дуэль' : (live.match.title ?? 'Турнир')}
            </p>
            <p className="game-scoreboard__value bar-live-score">
              {live.match.players[0].goals} : {live.match.players[1].goals}
            </p>
            {live.match.group === 'finished' && (
              <p role="status" className="bar-final">
                Матч завершён
              </p>
            )}
            <div className="bar-rinks">
              {live.match.players.map((player) => (
                <SpectatorRink
                  key={`${live.playbackId}:${player.userId}`}
                  player={player}
                  kind={live.match!.kind}
                  totalPeriods={live.match!.totalPeriods}
                  buffer={buffer}
                  motion={live.motion?.find((track) => track.userId === player.userId)}
                />
              ))}
            </div>
          </>
        )}
      </section>
      {live?.match && live.match.group !== 'upcoming' && kind && id && (
        <MatchChat key={resource} kind={kind} id={id} {...(viewerId ? { viewerId } : {})} />
      )}
    </main>
  );
}
