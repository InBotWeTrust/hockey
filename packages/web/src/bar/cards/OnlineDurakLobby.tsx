import { AppToast } from '../../components/AppToast.js';
import { DuelKindPreferenceButton } from '../../components/DuelKindPreferenceButton.js';
import { joinRoom, roomInvite } from './roomApi.js';
import { AccessibleModal } from '../../components/AccessibleModal.js';
import { computerOpponents, type ComputerOpponentId } from './computerOpponents.js';
import { ComputerOpponentCarousel } from './ComputerOpponentCarousel.js';
import { DurakLaunchModal } from './DurakModals.js';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, Info, Search } from 'lucide-react';
import { SegmentedTabs } from '../../components/SegmentedTabs.js';
import { UserAvatar } from '../../chat/components/UserAvatar.js';
import { useAuthStore } from '../../auth/authStore.js';
import {
  lobby,
  queue,
  respond,
  searchPlayers,
  type Lobby,
  type PickerPlayer,
} from './onlineApi.js';
import '../bar.css';
import './durak.css';
export function OnlineDurakLobby({ embedded = false }: { embedded?: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const userId = useAuthStore((state) => state.user?.id);
  const [info, setInfo] = useState<'quick' | 'search' | null>(null);
  const [computerOpen, setComputerOpen] = useState<ComputerOpponentId | null>(null);
  const [mode, setMode] = useState<'computer' | 'online'>(embedded || location.state?.mode === 'online' ? 'online' : 'computer');
  const [heroIndex, setHeroIndex] = useState(0);
  const onlineSwipe = useRef<{ x: number; y: number } | null>(null);
  const initialLobby = useRef(true);
  const [clock, setClock] = useState(Date.now());
  const clockOffset = useRef(0);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const [developmentToast, setDevelopmentToast] = useState(false);
  const [capacity, setCapacity] = useState(2);
  const [formats, setFormats] = useState([2]);
  const [tab, setTab] = useState<'find' | 'challenge'>('find');
  const [state, setState] = useState<Lobby | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [quick, setQuick] = useState<PickerPlayer[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<PickerPlayer | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchingPlayers, setSearchingPlayers] = useState(false);
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
          if (initialLobby.current) {
            initialLobby.current = false;
            if (next.searching || next.invites.some((i) => i.status === 'pending'))
              setMode('online');
          }
          if (next.serverNow) clockOffset.current = next.serverNow - Date.now();
          setError(null);
          if (next.roomId) navigate(`/bar/cards/room/${next.roomId}`);
          else if (next.matchId) open(next.matchId);
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
    if (tab !== 'challenge') return;
    let alive = true;
    void searchPlayers('')
      .then((rows) => {
        if (alive) setQuick(rows.slice(0, 12));
      })
      .catch(() => {
        if (alive) setSearchError('Не удалось загрузить быстрый выбор.');
      });
    return () => {
      alive = false;
    };
  }, [tab]);
  useEffect(() => {
    const ticket = ++serial.current;
    setPlayers([]);
    setSearchError(null);
    setSearchingPlayers(!!q.trim());
    if (!q.trim()) return;
    let alive = true;
    const timer = setTimeout(() => {
      void searchPlayers(q.trim())
        .then((rows) => {
          if (alive && ticket === serial.current) setPlayers(rows);
        })
        .catch(() => {
          if (alive && ticket === serial.current)
            setSearchError('Не удалось найти игроков. Попробуй ещё раз.');
        })
        .finally(() => {
          if (alive && ticket === serial.current) setSearchingPlayers(false);
        });
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [q]);
  const run = async (task: () => Promise<unknown>) => {
    if (lock.current) return;
    lock.current = true;
    actionVersion.current++;
    setBusy(true);
    setError(null);
    try {
      const result = (await task()) as
        | { roomId?: string | null; matchId?: string | null }
        | undefined;
      if (result?.roomId) {
        navigate(`/bar/cards/room/${result.roomId}`);
        return;
      }
      const next = await lobby();
      setState(next);
      if (next.serverNow) clockOffset.current = next.serverNow - Date.now();
      if (next.roomId) navigate(`/bar/cards/room/${next.roomId}`);
      else if (next.matchId) open(next.matchId);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Не удалось выполнить действие.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const searchRemaining = state?.searchExpiresAt
    ? Math.max(
        0,
        Math.ceil((new Date(state.searchExpiresAt).getTime() - clock - clockOffset.current) / 1000),
      )
    : null;
  const searchActive = !!state?.searching && searchRemaining !== 0;
  const outgoing = state?.invites.some((i) => i.status === 'pending' && i.sender_id === userId);
  return (
    <main
      className={`screen bar-screen online-durak-lobby online-durak-lobby--panorama online-durak-lobby--${mode}${embedded ? ' online-durak-lobby--embedded' : ''}`}
      onTouchStart={(event) => {
        if (embedded || mode !== 'online') return;
        const touch = event.touches[0];
        onlineSwipe.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
      }}
      onTouchEnd={(event) => {
        const origin = onlineSwipe.current;
        onlineSwipe.current = null;
        const touch = event.changedTouches[0];
        if (origin && touch && touch.clientX - origin.x > 50 &&
            touch.clientX - origin.x > Math.abs(touch.clientY - origin.y) * 1.3) {
          setHeroIndex(3);
          setMode('computer');
        }
      }}
      data-scene={mode === 'online' ? 4 : heroIndex}
      style={{ '--durak-scene-index': mode === 'online' ? 4 : heroIndex } as CSSProperties}
    >
      {!embedded && <div className="durak-panorama-view">
        <div className="durak-panorama-track">
          <img className="durak-panorama-background" src="/bar/cards/bar-populated-panorama-v2.webp"
            alt="Панорама бара «4-й период»" draggable={false} />
          {computerOpponents.map((hero, page) => (
            <div className="durak-panorama-seat" key={hero.id} style={{ left: `${page * 20}%` }}>
              <img src={`/bar/cards/${hero.id}-composition-v1.webp`} alt={hero.name} draggable={false} />
            </div>
          ))}
          <div className="durak-panorama-seat" style={{ left: '80%' }}>
            <img src="/bar/cards/online-terminal-v1.webp" alt="Терминал онлайн-игры" draggable={false} />
          </div>
        </div>
      </div>
      }
      {developmentToast && <AppToast message="Раздел в разработке" onDismiss={() => setDevelopmentToast(false)} />}
      {info && (
        <AccessibleModal
          title={info === 'quick' ? 'Быстрый выбор' : 'Поиск соперника'}
          onRequestClose={() => setInfo(null)}
          cardClassName="durak-info-modal"
          cardStyle={{ borderRadius: 24, padding: '22px 22px 18px', maxWidth: 320 }}
        >
          <p className="modal-copy durak-rules-copy">
            {info === 'quick'
              ? 'Здесь показаны последние активные игроки. Нажмите на аватар, чтобы выбрать соперника для прямого вызова.'
              : 'Введите имя или фамилию игрока и выберите соперника из списка.'}
          </p>
          <div className="modal-actions">
            <button className="btn btn--cta" onClick={() => setInfo(null)}>
              Понятно
            </button>
          </div>
        </AccessibleModal>
      )}
      {!embedded && <header className="bar-header">
        <button className="icon-btn" aria-label="Назад" onClick={() => navigate('/bar')}>
          <ChevronLeft size={22} />
        </button>
        <h1>Дурак</h1>
      </header>}
      {computerOpen && (
        <DurakLaunchModal
          opponentId={computerOpen}
          onClose={() => setComputerOpen(null)}
          onPlay={() => navigate(`/bar/cards/computer/${computerOpen}`)}
        />
      )}
      <section className="bar-content">
        {embedded ? <>
        <div className="durak-mode-tabs">
          <SegmentedTabs items={[{ id: 'durak', label: 'Дурак' }, { id: 'billiards', label: 'Бильярд' }, { id: 'darts', label: 'Дартс' }]} activeTab="durak" onChange={() => setDevelopmentToast(true)} ariaLabel="Игра" />
        </div>
        </> : <>
        <div className="durak-mode-tabs">
          <SegmentedTabs
            items={[
              { id: 'computer', label: 'Игра с персонажем' },
              {
                id: 'online',
                label: 'Игра онлайн',
                attention: !!state?.invites.some((i) => i.status === 'pending'),
              },
            ]}
            activeTab={mode}
            onChange={setMode}
            ariaLabel="Режим игры"
          />
        </div>
        </>}
        {error && (
          <p role="alert" className="bar-connection">
            {error}
          </p>
        )}
        <div className="durak-character-panel" hidden={mode !== 'computer'}>
          <ComputerOpponentCarousel
            index={heroIndex}
            onSelect={(page) => {
              if (page === 4) setMode('online');
              else setHeroIndex(page);
            }}
            disabled={
              busy || !state || searchActive || !!state?.invites.some((i) => i.status === 'pending')
            }
            onPlay={setComputerOpen}
          />
        </div>
        {mode === 'online' && (
          <>
            {!embedded && <button type="button" className="icon-btn durak-terminal-back"
              aria-label="Предыдущий персонаж"
              onClick={() => { setHeroIndex(3); setMode('computer'); }}>
              <ChevronLeft aria-hidden="true" />
            </button>}
            <div className="section-label duel-section-title">Текущие партии</div>
            {!state?.invites.some((i) => i.status === 'pending') && (
              <div role="status" className="duel-empty-current">
                {state ? 'Активных партий пока нет' : 'Загружаем партии…'}
              </div>
            )}
            {state?.invites
              .filter((i) => i.status === 'pending')
              .map((i) => (
                <div className="glass online-durak-invite" key={i.id}>
                  <UserAvatar
                    avatarUrl={null}
                    name={i.sender_id === userId ? i.receiver_name : i.sender_name}
                    size={42}
                    fontSize={16}
                  />
                  <div className="online-durak-invite__identity">
                    <div className="duel-card-opponent-name">
                      {i.sender_id === userId ? i.receiver_name : i.sender_name}
                    </div>
                    <div className="duel-card-meta">
                      Подкидной дурак · 36 карт{i.capacity ? ` · ${i.capacity} игроков` : ''}
                    </div>
                    {i.sender_id === userId && <span className="duel-card-status">Ждём ответ</span>}
                  </div>
                  <div className="online-durak-invite__actions">
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
                          className="btn duel-invite-action duel-invite-action--decline"
                          disabled={busy}
                          onClick={() => void run(() => respond(i.id, 'decline'))}
                        >
                          Отклонить
                        </button>
                        <button
                          className="btn duel-invite-action duel-invite-action--accept"
                          disabled={busy}
                          onClick={() => void run(() => respond(i.id, 'accept'))}
                        >
                          Принять
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            <SegmentedTabs
              items={[
                { id: 'find', label: 'Найти' },
                { id: 'challenge', label: 'Вызвать' },
              ]}
              activeTab={tab}
              onChange={setTab}
              ariaLabel="Способ встречи"
            />
            <div
              className="glass duel-kind-picker"
              style={{ borderRadius: 16, padding: '10px 10px 12px', marginTop: 14 }}
            >
              <div className="section-label" style={{ margin: '0 0 8px', padding: '2px 0' }}>
                Количество игроков
              </div>
              <div
                style={{ display: 'grid', gridTemplateColumns: 'repeat(5,minmax(0,1fr))', gap: 6 }}
              >
                {[2, 3, 4, 5, 6].map((n) => (
                  <DuelKindPreferenceButton
                    key={n}
                    label={String(n)}
                    checked={tab === 'find' ? formats.includes(n) : capacity === n}
                    active={tab === 'find' ? formats.includes(n) : capacity === n}
                    disabled={busy || searchActive}
                    onClick={() => {
                      if (tab === 'challenge') setCapacity(n);
                      else
                        setFormats((current) =>
                          current.includes(n)
                            ? current.length > 1
                              ? current.filter((format) => format !== n)
                              : current
                            : [...current, n].sort((a, b) => a - b),
                        );
                    }}
                  />
                ))}
              </div>
            </div>
            {tab === 'find' ? (
              <section className="online-durak-search">
                {searchActive && (
                  <p role="status" className="bar-empty">
                    Ищем соперника…{' '}
                    {searchRemaining !== null &&
                      `${Math.floor(searchRemaining / 60)}:${String(searchRemaining % 60).padStart(2, '0')}`}
                  </p>
                )}
                {state?.searchExpiresAt && searchRemaining === 0 && (
                  <p className="duel-empty-current">
                    Соперник не найден. Можно начать поиск снова.
                  </p>
                )}
                <button
                  className="btn btn--cta"
                  disabled={
                    busy ||
                    !state ||
                    (!searchActive && !!state.invites.some((i) => i.status === 'pending'))
                  }
                  onClick={() => void run(() => (searchActive ? queue(true) : joinRoom(formats)))}
                >
                  {searchActive ? 'Отменить поиск' : 'Начать поиск'}
                </button>
              </section>
            ) : (
              <section className="online-durak-search">
                <div className="section-label duel-form-section-title">
                  <span>Быстрый выбор</span>
                  <button
                    className="section-info-btn duel-form-section-info-btn"
                    aria-label="Что такое быстрый выбор"
                    onClick={() => setInfo('quick')}
                  >
                    <Info size={12} color="#fff" />
                  </button>
                </div>
                <div className="glass duel-quick-pick" style={{ borderRadius: 18, padding: 12 }}>
                  <div
                    className="no-scrollbar"
                    aria-label="Быстрый выбор соперника"
                    style={{ display: 'flex', gap: 10, overflowX: 'auto' }}
                  >
                    {quick.map((player) => (
                      <button
                        type="button"
                        key={player.userId}
                        aria-label={`Выбрать соперника ${player.displayName}`}
                        className={`duel-quick-pick__opponent${selectedPlayer?.userId === player.userId ? ' duel-quick-pick__opponent--active' : ''}`}
                        onClick={() => {
                          setSelectedPlayer(player);
                          setQ('');
                        }}
                        style={{
                          width: 58,
                          flex: '0 0 auto',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: 10,
                          fontWeight: 900,
                          lineHeight: 1.05,
                          textAlign: 'center',
                          background: 'transparent',
                          border: 'none',
                          padding: 0,
                        }}
                      >
                        <span style={{ position: 'relative', display: 'inline-flex' }}>
                          <UserAvatar
                            name={player.displayName}
                            avatarUrl={player.avatarUrl}
                            size={44}
                            fontSize={16}
                          />
                          <span
                            aria-hidden="true"
                            style={{
                              position: 'absolute',
                              right: 1,
                              bottom: 1,
                              width: 11,
                              height: 11,
                              borderRadius: 999,
                              background:
                                player.lastSeenAt &&
                                Date.now() - new Date(player.lastSeenAt).getTime() < 90000
                                  ? '#22c55e'
                                  : '#94a3b8',
                              border: '2px solid rgba(226,240,252,0.98)',
                            }}
                          />
                        </span>
                        <span
                          className="duel-quick-pick__name"
                          style={{
                            width: '100%',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {player.displayName}
                        </span>
                      </button>
                    ))}
                    {quick.length === 0 && !searchError && (
                      <span className="bar-empty">Нет игроков для быстрого выбора</span>
                    )}
                  </div>
                </div>
                <div className="section-label duel-form-section-title">
                  <span>Поиск</span>
                  <button
                    className="section-info-btn duel-form-section-info-btn"
                    aria-label="Как работает поиск соперника"
                    onClick={() => setInfo('search')}
                  >
                    <Info size={12} color="#fff" />
                  </button>
                </div>
                <div className="glass-dock-field duel-opponent-search" style={{ minHeight: 48 }}>
                  <Search className="duel-opponent-search__icon" size={14} aria-hidden />
                  <input
                    className="duel-opponent-search__input"
                    type="search"
                    style={{
                      flex: 1,
                      border: 'none',
                      outline: 'none',
                      background: 'transparent',
                      fontSize: 14,
                      fontWeight: 800,
                      fontFamily: 'inherit',
                    }}
                    aria-label="Имя соперника"
                    placeholder="Имя или фамилия"
                    value={q}
                    onChange={(event) => {
                      setQ(event.target.value);
                      setSelectedPlayer(null);
                    }}
                  />
                </div>
                {searchError && (
                  <p role="alert" className="bar-connection">
                    {searchError}
                  </p>
                )}
                {searchingPlayers && (
                  <p role="status" className="bar-empty">
                    Ищем игроков…
                  </p>
                )}
                {q.trim() && !searchingPlayers && !searchError && players.length === 0 && (
                  <p className="bar-empty">Игроки не найдены</p>
                )}
                {players.map((player) => (
                  <button
                    type="button"
                    className="glass online-durak-player"
                    key={player.userId}
                    onClick={() => setSelectedPlayer(player)}
                    aria-label={`Выбрать соперника ${player.displayName}`}
                  >
                    <UserAvatar avatarUrl={player.avatarUrl} name={player.displayName} size={40} />
                    <strong>{player.displayName}</strong>
                  </button>
                ))}
                <button
                  className="btn btn--cta"
                  disabled={busy || !selectedPlayer || !!outgoing || !!state?.searching}
                  onClick={() =>
                    selectedPlayer &&
                    void run(async () => {
                      const result = await joinRoom(capacity, false);
                      await roomInvite(result.roomId, selectedPlayer.userId);
                      return result;
                    })
                  }
                >
                  {selectedPlayer ? `Вызвать: ${selectedPlayer.displayName}` : 'Выберите соперника'}
                </button>
              </section>
            )}
          </>
        )}
      </section>
    </main>
  );
}
