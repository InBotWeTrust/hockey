import { POOL_STROKE_MS } from '@hockey/game-core';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { BarGameSnapshot, BarGameAction } from '@hockey/game-core';
import { AccessibleModal } from '../../components/AccessibleModal.js';
import { ArmwrestlingField } from './ArmwrestlingField.js';
import { OchkoField } from './OchkoField.js';
import { CharacterLaunch } from './CharacterLaunch.js';
import { GameMenu } from './GameMenu.js';
import { gameApi } from './api.js';
import { GameHelp, GameResult, gameClose } from './GameModals.js';
import { DartsField, CheckersField, PoolField } from './GameFields.js';
import { useResultReady } from './useResultReady.js';
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
  const [stakeOpen, setStakeOpen] = useState(false);
  const [replayRequest, setReplayRequest] = useState(() => crypto.randomUUID());
  const back = () => navigate('/bar', { replace: true });
  const view = match.view;
  const resultReady = useResultReady(
    id,
    view?.kind,
    view?.runtime.game.winner !== null && !!view,
    match.now,
    view?.runtime.animationUntil ?? 0,
  );
  useEffect(() => {
    setHelp(false);
    setExit(false);
    setReplaying(false);
    setStakeOpen(false);
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
    if (view.character === 'grigory') {
      setStakeOpen(true);
      return;
    }
    setReplaying(true);
    setReplayError(null);
    try {
      const next =
        view.character === 'maria'
          ? await gameApi.start('daria', replayRequest)
          : await gameApi.start(view.character, replayRequest, view.id);
      navigate(`/bar/games/match/${next.id}`, { replace: true });
    } catch {
      setReplayError('Не удалось начать новую партию. Попробуй ещё раз.');
      setReplaying(false);
    }
  };
  return (
    <main
      className="bar-game-screen bar-game-screen--playing"
      data-game={view?.kind}
      data-character={view?.character}
    >
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
          <GameTable
            view={view}
            now={match.now}
            disabled={match.busy || match.armBlocked || help || exit}
            send={match.send}
            onExit={() =>
              view.runtime.game.winner !== null || view.ready?.cancelled ? back() : setExit(true)
            }
            onRules={() => setHelp(true)}
            notice={match.error ?? replayError}
            onRetry={match.uncertain ? match.retry : undefined}
          />
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
          {!view.ready && !stakeOpen && view.runtime.game.winner !== null && resultReady && (
            <GameResult view={view} replay={() => void replay()} back={back} busy={replaying} />
          )}
          {stakeOpen && <CharacterLaunch character="grigory" close={() => setStakeOpen(false)} />}
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
  onExit,
  onRules,
  notice,
  onRetry,
}: {
  view: BarGameSnapshot;
  now: number;
  disabled: boolean;
  send: (a: BarGameAction | { type: 'ready' }) => void;
  onExit?: (() => void) | undefined;
  onRules?: (() => void) | undefined;
  notice?: string | null | undefined;
  onRetry?: (() => void) | undefined;
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
  let balls = game.kind === 'billiards' ? game.balls : [];
  if (
    game.kind === 'billiards' &&
    m.poolFrames.length &&
    now < m.animationStart + POOL_STROKE_MS + ((m.poolFrames.length - 1) * 1000) / 60
  ) {
    const index = Math.max(
      0,
      Math.min(
        m.poolFrames.length - 1,
        Math.floor(((now - m.animationStart - POOL_STROKE_MS) * 60) / 1000),
      ),
    );
    balls = m.poolFrames[index]!;
  }
  return (
    <>
      <GameMenu
        view={view}
        now={now}
        onExit={onExit}
        onRules={onRules}
        notice={notice}
        onRetry={onRetry}
      />
      <div className={`bar-game-field bar-game-field--${view.kind}`}>
        {game.kind === 'darts' ? (
          <DartsField
            game={game}
            lastDart={m.lastDart}
            dartHits={m.dartHits}
            rotation={m.dartRotation}
            engineVersion={m.engineVersion}
            animationStart={m.animationStart}
            now={now}
            disabled={!active}
            send={send}
          />
        ) : game.kind === 'checkers' ? (
          <CheckersField
            game={game}
            disabled={!active}
            send={send}
            player={player}
            motion={m.checkersMove ?? null}
            animationStart={m.animationStart}
            now={now}
          />
        ) : game.kind === 'armwrestling' ? (
          <ArmwrestlingField
            character={view.character === 'oleg'}
            game={game}
            player={player}
            now={now}
            disabled={disabled || !!view.ready}
            pregame={!!view.ready}
            send={send}
          />
        ) : game.kind === 'ochko' ? (
          <OchkoField
            pregame={!!view.ready}
            game={game}
            player={player}
            now={now}
            disabled={disabled || !!view.ready}
            send={send}
          />
        ) : (
          <PoolField
            game={game}
            balls={balls}
            disabled={!active}
            send={send}
            aim={m.poolAim}
            shot={m.feedback?.type === 'shot' ? m.poolShot : null}
            animationStart={m.animationStart}
            now={now}
            opponent={game.turn !== player}
            pregame={!!view.ready}
          />
        )}
        {view.ready && !view.ready.cancelled && view.ready.startsAt === null && (
          <div className="bar-game-ready-actions durak-ready-actions">
            <button
              className="btn btn--cta"
              disabled={disabled || view.ready.players.includes(player)}
              onClick={() => send({ type: 'ready' })}
            >
              {view.ready.players.includes(player) ? 'Вы готовы' : 'Готов'}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
