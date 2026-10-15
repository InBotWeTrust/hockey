import { formatRussianCount } from '../../lib/russianPlural.js';
import { DART_FLIGHT_MS, type BarGameSnapshot } from '@hockey/game-core';
import { UserAvatar } from '../../chat/components/UserAvatar.js';
import { FittedNotice } from '../../game/FittedNotice.js';
import { CardPlayerName, FittedMenuLabel } from '../cards/FittedMenuLabel.js';
import '../cards/durak.css';
function count(view: BarGameSnapshot, player: 0 | 1): number | undefined {
  const g = view.runtime.game;
  if (g.kind === 'darts') return g.scores[player];
  if (g.kind === 'checkers') return g.board.filter((p) => p && (p > 0 ? 0 : 1) === player).length;
  const group = g.groups[player];
  if (!group) return 0;
  return g.balls.filter(
    (b) => b.pocketed && b.id !== 0 && b.id !== 8 && (b.id < 8 ? 'solids' : 'stripes') === group,
  ).length;
}
function PoolGroup({ view, player }: { view: BarGameSnapshot; player: 0 | 1 }) {
  const g = view.runtime.game;
  if (g.kind !== 'billiards' || !g.groups[player] || view.ready) return null;
  const striped = g.groups[player] === 'stripes';
  return (
    <span
      className={`bar-pool-group${striped ? ' bar-pool-group--striped' : ''}`}
      role="img"
      aria-label={striped ? 'Полосатые шары' : 'Сплошные шары'}
      title={striped ? 'Полосатые' : 'Сплошные'}
    />
  );
}
function actionResult(view: BarGameSnapshot): string {
  const f = view.runtime.feedback;
  if (!f) return '';
  const actor = f.actor === view.player ? 'Ты' : view.participants[f.actor]!.displayName;
  switch (f.type) {
    case 'dart':
      return f.bust
        ? 'Перебор – дротик не засчитан'
        : f.points === 0
          ? 'Промах'
          : `${actor}: ${formatRussianCount(f.points ?? 0, 'очко', 'очка', 'очков')}`;
    case 'shot':
      return f.foul
        ? 'Фол – биток можно поставить заново'
        : f.pocketed?.length
          ? `${actor}: ${formatRussianCount(f.pocketed.length, 'шар', 'шара', 'шаров')}`
          : 'Шар не забит';
    case 'checkers':
      return f.captured
        ? `${actor}: ${formatRussianCount(f.captured, 'шашка', 'шашки', 'шашек')}`
        : 'Ход выполнен';
    case 'place':
      return 'Биток установлен';
    case 'timeout':
      return 'Время на ход вышло';
  }
}
export function GameMenu({ view, now }: { view: BarGameSnapshot; now: number }) {
  const { runtime: m, player } = view,
    g = m.game,
    other = player === 0 ? 1 : 0;
  const animating = now < m.animationUntil;
  const poolShotPending = g.kind === 'billiards' && m.feedback?.type === 'shot' && animating;
  const seconds =
    (g.winner !== null && !poolShotPending) || view.ready
      ? null
      : Math.max(0, Math.ceil((m.deadline - Math.max(now, m.animationUntil)) / 1000));
  let turn = poolShotPending
    ? 'Ход выполняется…'
    : g.winner !== null
      ? 'Партия завершена'
      : view.ready
        ? 'Ожидаем начала'
        : animating
          ? 'Ход выполняется…'
          : g.turn === player
            ? 'Твой ход'
            : 'Ход соперника';
  if (g.kind === 'darts' && g.winner === null) turn += ` · Осталось дротиков: ${g.dartsLeft}`;
  const dartFeedback = g.kind === 'darts' && m.feedback?.type === 'dart';
  const sinceContact = now - m.animationStart - DART_FLIGHT_MS;
  const result =
    (dartFeedback && (sinceContact < 0 || sinceContact >= 2000)) ||
    (g.kind === 'billiards' && (animating || now >= m.animationUntil + 2000))
      ? ''
      : actionResult(view);
  const poolHint =
    g.kind === 'billiards' && g.winner === null && !view.ready && !animating && g.turn === player
      ? g.ballInHand
        ? 'Выбери место для битка'
        : 'Прицелься и выбери силу'
      : '';
  const feedback =
    m.missed[player] > 0 && g.winner === null
      ? 'Следующий пропуск – поражение'
      : result
        ? dartFeedback
          ? result
          : `${result} · ${turn}`
        : poolHint
          ? `${turn} · ${poolHint}`
          : turn;
  const tone = poolShotPending
    ? 'warning'
    : m.missed[player] > 0 || m.feedback?.bust || m.feedback?.foul
      ? 'danger'
      : g.turn !== player || animating
        ? 'warning'
        : 'success';
  return (
    <section className="durak-menu game-scoreboard-stack bar-game-menu" aria-label="Меню игры">
      <div className="game-scoreboard game-scoreboard--stable-surface">
        <div className="game-scoreboard__row durak-menu__row">
          <div className="game-scoreboard__metric bar-game-player--self">
            <span className="bar-pool-group-slot bar-pool-group-slot--self">
              <PoolGroup view={view} player={player} />
            </span>
            <div className="durak-menu__identity">
              <UserAvatar
                avatarUrl={view.participants[player]!.avatarUrl}
                name={view.participants[player]!.displayName}
                size={30}
                alt="Твой аватар"
              />
              <CardPlayerName
                name={view.participants[player]!.displayName}
                count={view.ready ? undefined : count(view, player)}
              />
            </div>
          </div>
          <div
            className="game-scoreboard__metric game-scoreboard__metric--timer"
            data-tone={
              seconds === null
                ? 'idle'
                : seconds <= 4
                  ? 'danger'
                  : seconds <= 10
                    ? 'warning'
                    : 'success'
            }
            aria-label="Осталось времени"
            role="timer"
          >
            <FittedMenuLabel>Время</FittedMenuLabel>
            <strong className="game-scoreboard__value">{seconds ?? '–'}</strong>
          </div>
          <div className="game-scoreboard__metric bar-game-player--opponent">
            <span className="bar-pool-group-slot bar-pool-group-slot--opponent">
              <PoolGroup view={view} player={other} />
            </span>
            <div className="durak-menu__identity durak-menu__identity--opponent">
              <CardPlayerName
                name={view.participants[other]!.displayName}
                count={view.ready ? undefined : count(view, other)}
                countFirst
              />
              <UserAvatar
                avatarUrl={view.participants[other]!.avatarUrl}
                name={view.participants[other]!.displayName}
                size={30}
                alt={`Аватар: ${view.participants[other]!.displayName}`}
              />
            </div>
          </div>
        </div>
      </div>
      <FittedNotice
        fit
        role="status"
        data-tone={tone}
        className="duel-fatigue-notice initial-training-feedback-notice--scoreboard durak-turn-notice"
      >
        {feedback}
      </FittedNotice>
    </section>
  );
}
