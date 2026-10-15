import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { HelpCircle, LogOut } from 'lucide-react';
import type { BarGameSnapshot, BarGameAction } from '@hockey/game-core';
import { AccessibleModal } from '../../components/AccessibleModal.js';
import { UserAvatar } from '../../chat/components/UserAvatar.js';
import { gameApi } from './api.js';
import { gameNames, gameCopy, eventReplies } from './content.js';
import { GameHelp, GameResult, gameClose } from './GameModals.js';
import { DartsField, CheckersField, PoolField } from './GameFields.js';
import { useGameMatch } from './useGameMatch.js';
import './games.css';
export function BarGameScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const match = useGameMatch(id);
  const [help, setHelp] = useState(false),
    [exit, setExit] = useState(false),
    [replaying, setReplaying] = useState(false),
    [replayError, setReplayError] = useState<string | null>(null);
  const [replayRequest, setReplayRequest] = useState(() => crypto.randomUUID());
  const back = () => navigate('/bar', { replace: true });
  const view = match.view;
  useEffect(() => {
    setHelp(false);
    setExit(false);
    setReplaying(false);
    setReplayRequest(crypto.randomUUID());
  }, [id]);
  useEffect(() => {
    if (!view || view.runtime.game.winner !== null || view.ready?.cancelled) return;
    const block = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', block);
    return () => window.removeEventListener('beforeunload', block);
  }, [view?.runtime.game.winner, view?.ready?.cancelled]);
  const replay = async () => {
    if (!view?.character || replaying) return;
    setReplaying(true);
    setReplayError(null);
    try {
      const next = await gameApi.start(view.character, replayRequest, view.id);
      navigate(`/bar/games/match/${next.id}`, { replace: true });
    } catch {
      setReplayError('Не удалось начать новую партию. Попробуй ещё раз.');
      setReplaying(false);
    }
  };
  return (
    <main className="bar-game-screen">
      {!view ? (
        <>
          <p role="status">Загружаем партию…</p>
          {match.error && <p role="alert">{match.error}</p>}
          <button className="btn btn--ghost" onClick={back}>
            Вернуться в бар
          </button>
        </>
      ) : (
        <>
          <header className="bar-game-header">
            <button
              className="icon-btn"
              aria-label="Выйти из партии"
              onClick={() =>
                view.runtime.game.winner !== null || view.ready?.cancelled ? back() : setExit(true)
              }
            >
              <LogOut size={19} />
            </button>
            <h1>{gameNames[view.kind]}</h1>
            <button className="icon-btn" aria-label="Правила игры" onClick={() => setHelp(true)}>
              <HelpCircle size={20} />
            </button>
          </header>
          <GameTable view={view} now={match.now} disabled={match.busy} send={match.send} />
          {match.error && (
            <div className="bar-game-error" role="alert">
              {match.error}
              {match.uncertain && (
                <button className="btn btn--ghost" onClick={match.retry}>
                  Повторить отправку
                </button>
              )}
            </div>
          )}
          {replayError && <p role="alert">{replayError}</p>}
          {view.ready && !view.ready.cancelled && (
            <AccessibleModal
              title="Готов к игре?"
              onRequestClose={() => setExit(true)}
              headerAction={gameClose(() => setExit(true))}
            >
              <p className="modal-copy">
                {view.ready.startsAt
                  ? `Начинаем через ${Math.max(0, Math.ceil((view.ready.startsAt - match.now) / 1000))}…`
                  : `Подтверди готовность. Осталось ${Math.max(0, Math.ceil((view.ready.expiresAt - match.now) / 1000))} сек.`}
              </p>
              <div className="modal-actions">
                <button
                  className="btn btn--cta"
                  disabled={match.busy || view.ready.players.includes(view.player)}
                  onClick={() => match.send({ type: 'ready' })}
                >
                  {view.ready.players.includes(view.player) ? 'Ждём соперника' : 'Готов'}
                </button>
              </div>
            </AccessibleModal>
          )}
          {view.ready?.cancelled && (
            <AccessibleModal
              title="Партия не началась"
              onRequestClose={back}
              headerAction={gameClose(back)}
            >
              <p className="modal-copy">Не все участники подтвердили готовность.</p>
              <div className="modal-actions">
                <button className="btn btn--cta" onClick={back}>
                  Понятно
                </button>
              </div>
            </AccessibleModal>
          )}
          {view.runtime.game.winner !== null && match.now >= view.runtime.animationUntil && (
            <GameResult view={view} replay={() => void replay()} back={back} busy={replaying} />
          )}
          {help && <GameHelp kind={view.kind} close={() => setHelp(false)} />}
          {exit && (
            <AccessibleModal
              title="Выйти из партии?"
              onRequestClose={() => setExit(false)}
              headerAction={gameClose(() => setExit(false))}
            >
              <p className="modal-copy">Выход засчитается как поражение.</p>
              <div className="modal-actions">
                <button className="btn btn--ghost" onClick={() => setExit(false)}>
                  Остаться
                </button>
                <button
                  className="btn btn--cta"
                  disabled={match.busy}
                  onClick={() => {
                    match.send({ type: 'surrender' });
                    setExit(false);
                  }}
                >
                  Сдаться
                </button>
              </div>
            </AccessibleModal>
          )}
        </>
      )}
    </main>
  );
}
export function GameTable({
  view,
  now,
  disabled,
  send,
}: {
  view: BarGameSnapshot;
  now: number;
  disabled: boolean;
  send: (a: BarGameAction) => void;
}) {
  const { runtime: m, player } = view;
  const game = m.game;
  const animation = now < m.animationUntil;
  const active =
    !disabled &&
    !view.ready &&
    game.winner === null &&
    game.turn === player &&
    !animation &&
    now < m.deadline;
  const p = player === 0 ? 1 : 0;
  let balls = game.kind === 'billiards' ? game.balls : [];
  if (
    game.kind === 'billiards' &&
    m.poolFrames.length &&
    now < m.animationStart + ((m.poolFrames.length - 1) * 1000) / 60
  ) {
    const index = Math.max(
      0,
      Math.min(m.poolFrames.length - 1, Math.floor(((now - m.animationStart) * 60) / 1000)),
    );
    balls = m.poolFrames[index]!;
  }
  const seconds = Math.max(0, Math.ceil((m.deadline - Math.max(now, m.animationUntil)) / 1000));
  return (
    <>
      <div className="bar-game-scoreboard">
        {[player, p].map((i) => (
          <div key={i} className={`bar-game-player ${game.turn === i ? 'is-active' : ''}`}>
            <UserAvatar
              name={view.participants[i]!.displayName}
              avatarUrl={view.participants[i]!.avatarUrl}
              size={34}
            />
            <span>{i === player ? 'Ты' : view.participants[i]!.displayName}</span>
            <strong>
              {game.kind === 'darts'
                ? game.scores[i as 0 | 1]
                : game.kind === 'billiards'
                  ? game.groups[i as 0 | 1] === 'solids'
                    ? 'Сплошные'
                    : game.groups[i as 0 | 1] === 'stripes'
                      ? 'Полосатые'
                      : 'Стол открыт'
                  : game.board.filter((x) => x && (x > 0 ? 0 : 1) === i).length}
            </strong>
          </div>
        ))}
      </div>
      <div className={`bar-game-field bar-game-field--${view.kind}`}>
        {game.kind === 'darts' ? (
          <DartsField game={game} lastDart={m.lastDart} disabled={!active} send={send} />
        ) : game.kind === 'checkers' ? (
          <CheckersField game={game} disabled={!active} send={send} player={player} />
        ) : (
          <PoolField game={game} balls={balls} disabled={!active} send={send} />
        )}
      </div>
      <div className="bar-game-turn" aria-live="polite">
        {game.winner !== null
          ? 'Партия завершена'
          : view.ready
            ? 'Ожидаем начала'
            : animation
              ? 'Ход выполняется…'
              : game.turn === player
                ? 'Твой ход'
                : 'Ход соперника'}
        {game.winner === null && !view.ready && !animation && <strong>{seconds} сек.</strong>}
        {game.kind === 'darts' && <span>Дротиков: {game.dartsLeft}</span>}
      </div>
      {m.missed[player] > 0 && game.winner === null && (
        <p className="bar-game-warning" role="status">
          Один ход пропущен. Следующий пропуск подряд — поражение.
        </p>
      )}
      {game.kind === 'billiards' && game.lastFoul && game.winner === null && (
        <p className="bar-game-hint">
          Фол.{' '}
          {game.turn === player ? 'Поставь биток в свободное место.' : 'Соперник размещает биток.'}
        </p>
      )}
      {view.character && (
        <p className="bar-game-reply">
          {game.kind === 'darts' && m.lastDart
            ? game.lastScore === 0
              ? eventReplies.darts.miss
              : eventReplies.darts.hit
            : game.kind === 'billiards' && game.lastFoul
              ? eventReplies.billiards.foul
              : gameCopy[view.kind].playing}
        </p>
      )}
    </>
  );
}
