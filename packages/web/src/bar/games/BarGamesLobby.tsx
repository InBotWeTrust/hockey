import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { BarGameId, BarGameLobby, GameParticipant } from '@hockey/game-core';
import { OnlineDurakLobby } from '../cards/OnlineDurakLobby.js';
import { SegmentedTabs } from '../../components/SegmentedTabs.js';
import { AccessibleModal } from '../../components/AccessibleModal.js';
import { gameApi } from './api.js';
import { gameArt, gameNames, gameCharacters, characterNames, gameCopy } from './content.js';
import { gameClose, GameHelp } from './GameModals.js';
import './games.css';
export function BarGamesLobby({
  initial = 'cards',
  embedded = false,
}: {
  initial?: BarGameId | 'cards';
  embedded?: boolean;
}) {
  const [kind, setKind] = useState<BarGameId | 'cards'>(initial);
  return (
    <section className="bar-games-lobby">
      <SegmentedTabs
        items={[
          { id: 'cards', label: 'Карты' },
          { id: 'darts', label: 'Дартс' },
          { id: 'billiards', label: 'Бильярд' },
          { id: 'checkers', label: 'Шашки' },
        ]}
        activeTab={kind}
        onChange={(id) => setKind(id as typeof kind)}
        ariaLabel="Игра"
      />
      {kind === 'cards' ? (
        <OnlineDurakLobby embedded={embedded} />
      ) : (
        <NewGameLobby key={kind} kind={kind} />
      )}
    </section>
  );
}
export function NewGameLobby({ kind }: { kind: BarGameId }) {
  const navigate = useNavigate();
  const [state, setState] = useState<BarGameLobby | null>(null),
    [mode, setMode] = useState<'computer' | 'online'>('computer'),
    [tab, setTab] = useState<'find' | 'challenge'>('find'),
    [q, setQ] = useState(''),
    [players, setPlayers] = useState<GameParticipant[]>([]),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [invite, setInvite] = useState(false),
    [help, setHelp] = useState(false);
  const pending = useRef(false),
    generation = useRef(0);
  const startId = useRef(crypto.randomUUID());
  const character = gameCharacters[kind];
  const open = (id: string) => navigate(`/bar/games/match/${id}`);
  useEffect(() => {
    const token = ++generation.current;
    let reading = false;
    const refresh = async () => {
      if (reading || document.hidden) return;
      reading = true;
      try {
        const s = await gameApi.lobby();
        if (token !== generation.current) return;
        setState(s);
        if (s.matchId) open(s.matchId);
        if (s.searching) setMode('online');
      } catch {
        if (token === generation.current) setError('Не удалось обновить лобби. Пробуем снова…');
      } finally {
        reading = false;
      }
    };
    void refresh();
    const t = setInterval(() => void refresh(), 2000);
    return () => {
      generation.current++;
      clearInterval(t);
    };
  }, []);
  useEffect(() => {
    if (mode !== 'online' || tab !== 'challenge') return;
    let alive = true;
    const t = setTimeout(
      () =>
        void gameApi
          .players(q)
          .then((rows) => {
            if (alive) setPlayers(rows);
          })
          .catch(() => {
            if (alive) setError('Не удалось загрузить игроков.');
          }),
      200,
    );
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [mode, tab, q]);
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
    <div className="bar-new-lobby">
      <div className="bar-game-lobby-heading">
        <h2>{gameNames[kind]}</h2>
        <button className="icon-btn" aria-label="Правила игры" onClick={() => setHelp(true)}>
          ?
        </button>
      </div>
      <SegmentedTabs
        items={[
          { id: 'computer', label: 'С персонажем' },
          { id: 'online', label: 'С игроком' },
        ]}
        activeTab={mode}
        onChange={(id) => setMode(id as typeof mode)}
        ariaLabel="Соперник"
      />
      {state?.matchId && (
        <button className="btn btn--cta" onClick={() => open(state.matchId!)}>
          Продолжить партию
        </button>
      )}
      {mode === 'computer' ? (
        <>
          <img
            className="bar-game-invite-art"
            src={gameArt(kind, 'invite')}
            alt={`${characterNames[character]} приглашает сыграть`}
          />
          <h3>{characterNames[character]}</h3>
          <p>{gameCopy[kind].invite}</p>
          <button
            className="btn btn--cta"
            disabled={busy || !!state?.searching}
            onClick={() => setInvite(true)}
          >
            Играть
          </button>
        </>
      ) : (
        <>
          <SegmentedTabs
            items={[
              { id: 'find', label: 'Найти соперника' },
              { id: 'challenge', label: 'Вызвать игрока' },
            ]}
            activeTab={tab}
            onChange={(id) => setTab(id as typeof tab)}
            ariaLabel="Способ игры"
          />
          {tab === 'find' ? (
            <>
              <p>Бесплатная партия один на один.</p>
              <button
                className="btn btn--cta"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const r = await gameApi.queue(kind, !!state?.searching);
                    if (r.matchId) open(r.matchId);
                  })
                }
              >
                {state?.searching ? 'Отменить поиск' : 'Найти соперника'}
              </button>
              {state?.searching && <p role="status">Ищем соперника…</p>}
            </>
          ) : (
            <>
              <label>
                Имя игрока
                <input
                  className="bar-game-search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Начни вводить имя"
                />
              </label>
              <div className="bar-game-player-list">
                {players.map((p) => (
                  <div key={p.userId}>
                    <span>{p.displayName}</span>
                    <button
                      className="btn btn--ghost"
                      disabled={busy}
                      onClick={() => void run(() => gameApi.invite(kind, p.userId))}
                    >
                      Вызвать
                    </button>
                  </div>
                ))}
              </div>
              {!players.length && <p>Доступных игроков пока нет.</p>}
            </>
          )}
        </>
      )}
      {state?.invites
        .filter((i) => i.kind === kind && i.status === 'pending')
        .map((i) => (
          <div className="bar-game-pending" key={i.id}>
            <p>
              {i.senderId === localUserId()
                ? `Вызов отправлен: ${i.receiverName}`
                : `${i.senderName} приглашает сыграть`}
            </p>
            <button
              className="btn btn--ghost"
              disabled={busy}
              onClick={() =>
                void run(() =>
                  gameApi.respond(i.id, i.senderId === localUserId() ? 'cancel' : 'decline'),
                )
              }
            >
              {i.senderId === localUserId() ? 'Отменить' : 'Отклонить'}
            </button>
            {i.receiverId === localUserId() && (
              <button
                className="btn btn--cta"
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
            )}
          </div>
        ))}
      {error && <p role="alert">{error}</p>}
      {invite && (
        <AccessibleModal
          title={`${gameNames[kind]} · ${characterNames[character]}`}
          onRequestClose={() => setInvite(false)}
          headerAction={gameClose(() => setInvite(false))}
        >
          <img
            className="bar-game-invite-art"
            src={gameArt(kind, 'invite')}
            alt={characterNames[character]}
          />
          <p className="modal-copy">{gameCopy[kind].invite}</p>
          <div className="modal-actions">
            <button
              className="btn btn--cta"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const s = await gameApi.start(character, startId.current);
                  open(s.id);
                })
              }
            >
              Играть
            </button>
          </div>
        </AccessibleModal>
      )}
      {help && <GameHelp kind={kind} close={() => setHelp(false)} />}
    </div>
  );
}
import { useAuthStore } from '../../auth/authStore.js';
const localUserId = () => useAuthStore.getState().user?.id;
