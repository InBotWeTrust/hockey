import { NavalResult } from './NavalResult.js';
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
  const paragraphs = kind==='ochko'&&engineVersion>=12 ? [
    'Матч состоит из четырёх раздач одной колодой на 36 карт. Карты не возвращаются. 6–10 дают свой номинал, валет — 2, дама — 3, король — 4, туз — 11. Два туза в начальной руке дают 21: набор владельца заканчивается, соперник продолжает.',
    'Бери карты или нажми «Хватит». Сумма до 21 включительно добавляется к общему счёту, перебор даёт 0. Побеждает большая сумма за четыре раздачи. Для будущих раздач резервируются по четыре карты: если свободные закончились, набор останавливается.',
    'Григорий может приписать себе 1–3 очка, не меняя карты и не скрывая перебор. После вскрытия можно один раз проверить счёт. Верное обвинение исправляет сумму, ошибочное отнимает 3 очка у тебя. Общий счёт может быть отрицательным.',
    'С Григорием на проверку и кнопку «Дальше» есть три минуты после вскрытия. Между раздачами опоздание означает поражение. После четвёртой раздачи кнопка «Результат», а по окончании срока результат фиксируется автоматически. Закрытие приложения не продлевает срок.',
    'Одна ставка на весь матч: списывается перед первой раздачей. Победа возвращает двойную ставку, ничья — исходную, поражение — ничего.',
    'Онлайн игра бесплатная, без обмана. Между раздачами оба подтверждают продолжение за 30 секунд, затем отсчёт 5 секунд. Готов только один — его техническая победа 21:0; никто — ничья 0:0. После четвёртой раздачи подтверждать продолжение не нужно.',
  ] : kind === 'darts' && engineVersion >= 9 && engineVersion <= 10
    ? dartsDoubleOutRules
    : kind === 'darts' && engineVersion < 9
      ? rules.darts.filter(p => !p.startsWith('После каждого хода мишень')).map(p => p.replace('501', '301'))
      : kind === 'battleship' && engineVersion < 15
        ? rules.battleship.map(p => p.replace('авианалёт на квадрат 2×2', 'залп 3×2 (можно повернуть)').replace('Авианалёт заряжается после пяти обычных выстрелов, в начале он недоступен. После использования заряд сбрасывается. ', '').replaceAll('Авианалёт', 'Залп').replaceAll('авианалёт', 'залп'))
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
      {kind !== 'ochko' && kind !== 'armwrestling' && kind !== 'battleship' && <p className="modal-copy">{timerRules}</p>}
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
  const game = view.runtime.game;
  const finalScores = game.kind === 'ochko' ? game.series?.totals ?? game.scores : null;
  const technicalScore = game.kind === 'ochko' && game.series?.technical;
  const challengePenalty = game.kind === 'ochko' && game.series && !technicalScore
    ? Math.max(0, game.series.history.reduce((sum, round) => sum + round.awards[view.player], 0) - game.series.totals[view.player])
    : 0;
  const winner = game.winner;
  const outcome = winner === 'draw' ? 'draw' : winner === view.player ? 'win' : 'loss';
  const title = outcome === 'draw' ? 'Ничья' : outcome === 'win' ? 'Победа' : 'Поражение';
  const reason =
    view.runtime.reason === 'technical'
      ? view.stake ? 'Партию пришлось завершить. Ставка возвращена.' : 'Матч завершён по подтверждению продолжения.'
      : view.runtime.reason === 'inactivity'
        ? view.kind === 'armwrestling'
          ? 'Схватка завершена после 10 секунд бездействия.'
          : view.kind==='ochko' ? 'Время продолжения раздачи истекло.' : 'Партия завершена после двух пропусков хода подряд.'
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
      {finalScores && <p className="bar-game-result__score" aria-label="Итоговый счёт"><span>{technicalScore ? 'Технический счёт:' : 'Счёт:'}</span><strong>{finalScores[view.player]} : {finalScores[view.player === 0 ? 1 : 0]}</strong>{game.kind === 'ochko' && !!game.series?.history.length && <span className="bar-game-result__rounds">({technicalScore ? 'раздачи: ' : ''}{game.series.history.map(round => `${round.awards[view.player]}:${round.awards[view.player === 0 ? 1 : 0]}`).join(', ')})</span>}</p>}
      {challengePenalty > 0 && <p className="modal-copy">Штраф за проверку счёта: −{challengePenalty}</p>}
      {game.kind === 'battleship' && <NavalResult game={game} player={view.player}/>}
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
