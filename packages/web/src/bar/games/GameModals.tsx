import { X } from 'lucide-react';
import type { BarGameId, BarGameSnapshot } from '@hockey/game-core';
import { AccessibleModal } from '../../components/AccessibleModal.js';
import { gameArt, gameCopy, gameNames, characterNames, rules, timerRules } from './content.js';
export const gameClose = (close: () => void) => (
  <button className="icon-btn" aria-label="Закрыть" onClick={close}>
    <X size={18} />
  </button>
);
export function GameHelp({ kind, close }: { kind: BarGameId; close: () => void }) {
  return (
    <AccessibleModal
      cardClassName="bar-game-help"
      title={`Как играть: ${gameNames[kind]}`}
      onRequestClose={close}
      headerAction={gameClose(close)}
    >
      {rules[kind].map((p) => (
        <p className="modal-copy" key={p}>
          {p}
        </p>
      ))}
      <p className="modal-copy">{timerRules}</p>
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
    view.runtime.reason === 'inactivity'
      ? 'Партия завершена после двух пропусков подряд.'
      : view.runtime.reason === 'surrender'
        ? 'Один из участников сдался.'
        : null;
  return (
    <AccessibleModal
      title={title}
      onRequestClose={back}
      headerAction={gameClose(back)}
      cardClassName="bar-game-result"
    >
      <img
        className="bar-game-result__art"
        src={gameArt(view.kind, `${view.character ? 'character' : 'online'}-${outcome}`)}
        alt={`${title}: ${view.character ? characterNames[view.character] : gameNames[view.kind]}`}
      />
      {reason && <p className="modal-copy">{reason}</p>}
      <p className="modal-copy">
        {view.character
          ? reason
            ? '«Заглядывай, когда будет время на партию.»'
            : gameCopy[view.kind][outcome]
          : outcome === 'draw'
            ? 'Партия закончилась вничью.'
            : outcome === 'win'
              ? 'Ты выиграл эту партию.'
              : 'Соперник выиграл эту партию.'}
      </p>
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
