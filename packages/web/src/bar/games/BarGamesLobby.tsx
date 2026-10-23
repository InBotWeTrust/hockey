import {BarPlayerAvatar} from '../BarPlayerAvatar.js';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { BarGameId, BarGameLobby, BarGameSnapshot } from '@hockey/game-core';
import { OnlineDurakLobby } from '../cards/OnlineDurakLobby.js';
import { SegmentedTabs } from '../../components/SegmentedTabs.js';
import { ChevronRight, Search, X } from 'lucide-react';
import { UserAvatar } from '../../chat/components/UserAvatar.js';
import { useAuthStore } from '../../auth/authStore.js';
import { gameApi, type GamePickerPlayer } from './api.js';
import { gameNames } from './content.js';
import './games.css';
import {useBarInvitation} from '../useBarInvitation.js';
const GAME_CHOICES = [
  { id: 'cards', label: 'Карты' },
  { id: 'darts', label: 'Дартс' },
  { id: 'billiards', label: 'Бильярд' },
  { id: 'checkers', label: 'Шашки' },
  { id: 'ochko', label: 'Очко' },
  { id: 'armwrestling', label: 'Армрестлинг' },
  { id: 'battleship', label: 'Морской бой' },
] satisfies Array<{id:BarGameId|'cards';label:string}>;

export function BarGamesLobby({
  initial = 'cards',
  embedded = false,
}: {
  initial?: BarGameId | 'cards';
  embedded?: boolean;
}) {
  const [kind, setKind] = useState<BarGameId | 'cards'>(initial);
  const [meetingTab,setMeetingTab]=useState<'find'|'challenge'>('find');
  const invitation=useBarInvitation(!embedded);
  const openedInvitation=useRef<string|null>(null);
  useEffect(()=>{
    if(invitation&&openedInvitation.current!==invitation.id){openedInvitation.current=invitation.id;setKind(invitation.kind);}
  },[invitation]);
  return (
    <section className="bar-games-lobby">
      <div className="bar-game-selection">
      <div className="section-label">Выбор игры · {GAME_CHOICES.length}</div>
      <SegmentedTabs
        scrollable
        items={GAME_CHOICES}
        activeTab={kind}
        onChange={(id) => setKind(id as typeof kind)}
        ariaLabel="Игра"
      />
      </div>
      {kind === 'cards' ? (
        <OnlineDurakLobby embedded={embedded} meetingTab={meetingTab} onMeetingTabChange={setMeetingTab} />
      ) : (
        <NewGameLobby key={kind} kind={kind} meetingTab={meetingTab} onMeetingTabChange={setMeetingTab} />
      )}
    </section>
  );
}
export function NewGameLobby({ kind, meetingTab, onMeetingTabChange }: { kind: BarGameId; meetingTab?:'find'|'challenge'; onMeetingTabChange?:(tab:'find'|'challenge')=>void }) {
  const navigate = useNavigate();
  const userId = useAuthStore((s) => s.user?.id);
  const [state, setState] = useState<BarGameLobby | null>(null);
  const [activeMatch, setActiveMatch] = useState<BarGameSnapshot | null>(null);
  const previousLobby = useRef<BarGameLobby | null>(null);
  const [localTab,setLocalTab]=useState<'find'|'challenge'>('find');
  const tab=meetingTab??localTab;
  const setTab=(value:'find'|'challenge')=>{setLocalTab(value);onMeetingTabChange?.(value);};
  const [q, setQ] = useState('');
  const [players, setPlayers] = useState<GamePickerPlayer[]>([]);
  const [selected, setSelected] = useState<GamePickerPlayer | null>(null);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false),
    generation = useRef(0);
  const open = (id: string) => navigate(`/bar/games/match/${id}`);
  const invites = state?.invites.filter((i) => i.kind === kind && i.status === 'pending') ?? [];
  const searchActive = !!state?.searching;
  useEffect(() => {
    const token = ++generation.current;
    let reading = false;
    const refresh = async () => {
      if (reading || document.hidden) return;
      reading = true;
      try {
        const s = await gameApi.lobby();
        if (token !== generation.current) return;
        const previous = previousLobby.current;
        previousLobby.current = s;
        setState(s);
        if (
          s.matchId &&
          s.matchId !== previous?.matchId &&
          (previous?.searching || previous?.invites.some((i) => i.status === 'pending'))
        )
          open(s.matchId);
      } catch {
        if (token === generation.current) setError('Не удалось обновить лобби. Пробуем снова…');
      } finally {
        reading = false;
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 2000);
    return () => {
      generation.current++;
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    setActiveMatch(null);
    if (!state?.matchId) return;
    let alive = true;
    void gameApi
      .read(state.matchId)
      .then((match) => {
        if (alive) setActiveMatch(match);
      })
      .catch(() => {
        if (alive) setError('Не удалось загрузить данные партии.');
      });
    return () => {
      alive = false;
    };
  }, [state?.matchId]);
  const opponent = activeMatch?.participants[activeMatch.player === 0 ? 1 : 0];
  useEffect(() => {
    if (tab !== 'challenge') return;
    let alive = true;
    setLoadingPlayers(true);
    const timer = setTimeout(
      () =>
        void gameApi
          .players(q)
          .then((rows) => {
            if (alive) setPlayers(rows);
          })
          .catch(() => {
            if (alive) setError('Не удалось загрузить игроков.');
          })
          .finally(() => {
            if (alive) setLoadingPlayers(false);
          }),
      200,
    );
    const presenceTimer=setInterval(()=>{if(!q.trim())void gameApi.players('').then(rows=>{if(alive)setPlayers(rows);}).catch(()=>{/* Keep the last known picker state. */});},30_000);
    return () => {
      alive = false;
      clearTimeout(timer);
      clearInterval(presenceTimer);
    };
  }, [tab, q]);
  const run = async (task: () => Promise<unknown>) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      await task();
      setState(await gameApi.lobby());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось выполнить действие.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <div className="online-durak-lobby online-durak-lobby--embedded bar-online-game-lobby">
      <section className="bar-content">
        {error && (
          <p role="alert" className="bar-connection">
            {error}
          </p>
        )}
        <div className="section-label duel-section-title">Текущие партии</div>
        {state?.matchId && (
          <button
            className="glass online-durak-invite bar-game-active-match"
            aria-label={`Продолжить партию · ${opponent?.displayName ?? 'Соперник'}`}
            onClick={() => open(state.matchId!)}
          >
            <UserAvatar
              avatarUrl={opponent?.avatarUrl ?? null}
              name={opponent?.displayName ?? 'Соперник'}
              size={42}
            />
            <div className="online-durak-invite__identity">
              <div className="duel-card-opponent-name">
                {opponent?.displayName ?? 'Загружаем соперника…'}
              </div>
              <span className="bar-game-active-match__status">Партия идёт</span>
            </div>
            <ChevronRight size={20} aria-hidden="true" />
          </button>
        )}
        {!state?.matchId && !invites.length && (
          <div role="status" className="duel-empty-current">
            {state ? 'Активных партий пока нет' : 'Загружаем партии…'}
          </div>
        )}
        {invites.map((i) => {
          const outgoing = i.senderId === userId;
          const name = outgoing ? i.receiverName : i.senderName;
          return (
            <div className={`glass online-durak-invite${outgoing?' bar-invite--outgoing':''}`} key={i.id}>
              <UserAvatar avatarUrl={null} name={name} size={42} fontSize={16} />
              <div className="online-durak-invite__identity">
                <div className="duel-card-heading"><div className="duel-card-opponent-name">{name}</div>{outgoing && <span className="duel-card-status">Ждём ответ</span>}</div>
                <div className="duel-card-meta">{gameNames[kind]}</div>

              </div>
              <div className="online-durak-invite__actions">
                {outgoing ? (
                  <button
                    className="icon-btn bar-invite-cancel"
                    aria-label="Отменить приглашение" title="Отменить приглашение"
                    disabled={busy}
                    onClick={() => void run(() => gameApi.respond(i.id, 'cancel'))}
                  >
                    <X size={18} aria-hidden="true"/>
                  </button>
                ) : (
                  <>
                    <button
                      className="btn duel-invite-action duel-invite-action--decline"
                      disabled={busy}
                      onClick={() => void run(() => gameApi.respond(i.id, 'decline'))}
                    >
                      Отклонить
                    </button>
                    <button
                      className="btn duel-invite-action duel-invite-action--accept"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          const r = await gameApi.respond(i.id, 'accept');
                          if (r.matchId) open(r.matchId);
                        })
                      }
                    >
                      Принять
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
        <SegmentedTabs
          items={[
            { id: 'find', label: 'Найти' },
            { id: 'challenge', label: 'Вызвать' },
          ]}
          activeTab={tab}
          onChange={(id) => setTab(id as typeof tab)}
          ariaLabel="Способ встречи"
        />
        {tab === 'find' ? (
          <section className="online-durak-search">
            {searchActive && (
              <p role="status" className="bar-empty">
                Ищем соперника…
                {state?.searching !== kind ? ` · ${gameNames[state!.searching!]}` : ''}
              </p>
            )}
            <button
              className="btn btn--cta"
              disabled={
                busy ||
                !state ||
                (!searchActive &&
                  (!!state.matchId || !!state.invites.some((i) => i.status === 'pending')))
              }
              onClick={() =>
                void run(async () => {
                  const r = await gameApi.queue(kind, searchActive);
                  if (r.matchId) open(r.matchId);
                })
              }
            >
              {searchActive ? 'Отменить поиск' : 'Начать поиск'}
            </button>
          </section>
        ) : (
          <section className="online-durak-search">
            {!q.trim() && (
              <>
                <div className="section-label duel-form-section-title">Быстрый выбор</div>
                <div className="glass duel-quick-pick" style={{ borderRadius: 18, padding: 12 }}>
                  <div
                    className="no-scrollbar"
                    style={{ display: 'flex', gap: 12, overflowX: 'auto' }}
                  >
                    {players.slice(0, 8).map((player) => (
                      <button
                        type="button"
                        key={player.userId}
                        style={{width:58,flex:'0 0 58px'}}
                        className={`duel-quick-pick__opponent${selected?.userId === player.userId ? ' duel-quick-pick__opponent--active' : ''}`}
                        onClick={() => setSelected(player)}
                        aria-label={`Выбрать соперника ${player.displayName}`}
                        aria-pressed={selected?.userId === player.userId}
                      >
                        <BarPlayerAvatar player={player}/>
                        <span className="duel-quick-pick__name">{player.displayName}</span>
                      </button>
                    ))}
                    {!loadingPlayers && !players.length && (
                      <span className="bar-empty">Нет игроков для быстрого выбора</span>
                    )}
                  </div>
                </div>
              </>
            )}
            <div className="section-label duel-form-section-title">Поиск</div>
            <div className="glass-dock-field duel-opponent-search" style={{ minHeight: 48 }}>
              <Search className="duel-opponent-search__icon" size={14} aria-hidden />
              <input
                className="duel-opponent-search__input"
                aria-label="Имя игрока"
                placeholder="Имя или фамилия"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setSelected(null);
                }}
              />
            </div>
            {loadingPlayers && (
              <p role="status" className="bar-empty">
                Ищем игроков…
              </p>
            )}
            {!loadingPlayers && !players.length && (
              <p className="bar-empty">
                {q.trim() ? 'Игроки не найдены' : 'Доступных игроков пока нет'}
              </p>
            )}
            {q.trim() &&
              players.map((player) => (
                <button
                  type="button"
                  className="glass online-durak-player"
                  key={player.userId}
                  onClick={() => setSelected(player)}
                  aria-label={`Выбрать соперника ${player.displayName}`}
                  aria-pressed={selected?.userId === player.userId}
                >
                  <UserAvatar avatarUrl={player.avatarUrl} name={player.displayName} size={40} />
                  <strong>{player.displayName}</strong>
                </button>
              ))}
            <button
              className="btn btn--cta"
              disabled={
                busy ||
                !state ||
                !selected ||
                searchActive ||
                !!state.matchId ||
                !!state.invites.some((i) => i.status === 'pending')
              }
              onClick={() => selected && void run(() => gameApi.invite(kind, selected.userId))}
            >
              {selected ? `Вызвать: ${selected.displayName}` : 'Выберите соперника'}
            </button>
          </section>
        )}
      </section>
    </div>
  );
}
