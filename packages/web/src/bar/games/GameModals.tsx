import { Star, X } from 'lucide-react';
import { ENGINE_VERSION, type BarGameId, type BarGameSnapshot } from '@hockey/game-core';
import { AccessibleModal } from '../../components/AccessibleModal.js';
import { gameArt, gameCopy, gameNames, characterNames, dartsDoubleOutRules, rules, timerRules } from './content.js';
export const gameClose = (close: () => void) => (
  <button className="icon-btn" aria-label="Закрыть" onClick={close}>
    <X size={18} />
  </button>
);
export function GameHelp({ kind, close, engineVersion = ENGINE_VERSION }: { kind: BarGameId; close: () => void; engineVersion?: number }) {
  const paragraphs = kind === 'darts' && engineVersion >= 9 && engineVersion <= 10
    ? dartsDoubleOutRules
    : kind === 'darts' && engineVersion < 9
      ? rules.darts.filter(p => !p.startsWith('После каждого хода мишень')).map(p => p.replace('501', '301'))
      : rules[kind];
  return (
    <AccessibleModal
      cardClassName="bar-game-help"
      title={`Как играть: ${gameNames[kind]}`}
      onRequestClose={close}
      headerAction={gameClose(close)}
    >
      {paragraphs.map((p) => (
        <p className="modal-copy" key={p}>
          {p}
        </p>
      ))}
      {kind !== 'ochko' && kind !== 'armwrestling' && <p className="modal-copy">{timerRules}</p>}
    </AccessibleModal>
  );
}
export function GameResult({
  view,
  replay,
  back,
  busy = false,
}: {
  view: BarGameSnapshot;
  replay: () => void;
  back: () => void;
  busy?: boolean;
}) {
  const winner = view.runtime.game.winner;
  const outcome = winner === 'draw' ? 'draw' : winner === view.player ? 'win' : 'loss';
  const title = outcome === 'draw' ? 'Ничья' : outcome === 'win' ? 'Победа' : 'Поражение';
  const reason =
    view.runtime.reason === 'technical'
      ? 'Партию пришлось завершить. Ставка возвращена.'
      : view.runtime.reason === 'inactivity'
        ? view.kind === 'armwrestling'
          ? 'Схватка завершена после 10 секунд бездействия.'
          : 'Партия завершена после двух пропусков хода подряд.'
        : view.runtime.reason === 'surrender'
          ? 'Один из участников сдался.'
          : null;
  return (
    <AccessibleModal
      title={title}
      onRequestClose={back}
      headerAction={gameClose(back)}
      cardClassName="bar-game-result bonus-game-preview-modal bonus-game-launch-modal"
    >
      <img
        className="bar-game-result__art"
        src={gameArt(
          view.kind,
          `${view.character ? 'character' : 'online'}-${outcome}`,
          view.character ?? undefined,
        )}
        alt={`${title}: ${view.character ? characterNames[view.character] : gameNames[view.kind]}`}
      />
      {reason && <p className="modal-copy">{reason}</p>}
      <p className="modal-copy">
        {view.character
          ? reason
            ? '«Заглядывай, когда будет больше времени на игру.»'
            : gameCopy[view.kind][outcome]
          : outcome === 'draw'
            ? 'Партия закончилась вничью.'
            : outcome === 'win'
              ? 'Ты выиграл эту партию.'
              : 'Соперник выиграл эту партию.'}
      </p>
      {outcome !== 'draw' && view.stake && view.stake.payout !== null && (
        <div className="bar-ochko-earned" data-loss={view.stake.payout < view.stake.amount} aria-label="Изменение баланса звёзд">
          <Star size={24} fill="currentColor" aria-hidden="true" />
          <strong>{view.stake.payout > view.stake.amount ? '+' : view.stake.payout < view.stake.amount ? '−' : ''}{Math.abs(view.stake.payout - view.stake.amount)}</strong>
        </div>
      )}
      <div className="modal-actions">
        {view.character ? (
          <>
            <button className="btn btn--ghost" onClick={back}>
              Вернуться в бар
            </button>
            <button className="modal-primary btn btn--cta" onClick={replay} disabled={busy}>
              Повторить
            </button>
          </>
        ) : (
          <button className="modal-primary btn btn--cta" onClick={back}>
            Понятно
          </button>
        )}
      </div>
    </AccessibleModal>
  );
}
