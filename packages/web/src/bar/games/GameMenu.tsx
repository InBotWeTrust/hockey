import { useRef } from 'react';
import { useOchkoReveal } from './useResultReady.js';
import { HelpCircle, LogOut } from 'lucide-react';
import { formatRussianCount } from '../../lib/russianPlural.js';
import {
  barDarts,
  type barPool,
  DART_FLIGHT_MS,
  DART_IMPACT_MS,
  POOL_STROKE_MS,
  type BarGameSnapshot,
} from '@hockey/game-core';
import { UserAvatar } from '../../chat/components/UserAvatar.js';
import { FittedNotice } from '../../game/FittedNotice.js';
import { CardPlayerName, FittedMenuLabel } from '../cards/FittedMenuLabel.js';
import '../cards/durak.css';
function count(view: BarGameSnapshot, player: 0 | 1): number | undefined {
  const g = view.runtime.game;
  if (g.kind === 'darts') return g.scores[player];
  if (g.kind === 'checkers') return g.board.filter((p) => p && (p > 0 ? 0 : 1) === player).length;
  if (g.kind === 'armwrestling') return Math.round(g.stamina[player] * 100);
  if (g.kind === 'ochko')
    return g.series ? g.series.totals[player] : g.scores[player] < 0 ? undefined : g.scores[player];
  if (g.kind === 'battleship')
    return player === view.player
      ? g.ownShips.filter((s) => s.hits.length < s.w * s.h).length
      : 12 - g.enemySunk.length;
  const group = g.groups[player];
  if (!group) return 0;
  return g.balls.filter(
    (b) => b.pocketed && b.id !== 0 && b.id !== 8 && (b.id < 8 ? 'solids' : 'stripes') === group,
  ).length;
}
function PoolGroup({ group }: { group: barPool.Group | null | undefined }) {
  if (!group) return null;
  const striped = group === 'stripes';
  return (
    <span
      className={`bar-pool-group${striped ? ' bar-pool-group--striped' : ''}`}
      role="img"
      aria-label={striped ? 'Полосатые шары' : 'Сплошные шары'}
      title={striped ? 'Полосатые' : 'Сплошные'}
    />
  );
}
function dartBust(view: BarGameSnapshot): string {
  const m = view.runtime,
    g = m.game,
    f = m.feedback;
  if (m.engineVersion < 9 || m.engineVersion >= 11) return 'Перебор – дротик не засчитан';
  if (g.kind !== 'darts' || !f || !m.dartHits?.length) return 'Перебор – очки хода отменены';
  // A bust restores the visit's opening score; score the saved hits before board rotation.
  const angle = m.dartRotation?.from ?? g.boardAngle ?? 0;
  const remaining =
    g.scores[f.actor] - m.dartHits.reduce((sum, hit) => sum + barDarts.score(hit, angle), 0);
  const reason =
    remaining === 1 ? 'остался 1' : remaining < 0 ? 'превышен остаток' : 'нужно удвоение';
  return `Перебор: ${reason} – ход отменён`;
}
function actionResult(view: BarGameSnapshot): string {
  const f = view.runtime.feedback;
  if (!f) return '';
  const actor = f.actor === view.player ? 'Ты' : view.participants[f.actor]!.displayName;
  switch (f.type) {
    case 'dart':
      return f.bust
        ? dartBust(view)
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
    case 'naval-attack':
      return f.points ? `${actor}: попаданий ${f.points}` : 'Мимо';
    case 'naval-move':
      return '';
  }
}
export function GameMenu({
  view,
  now,
  onExit,
  onRules,
  notice,
  onRetry,
}: {
  view: BarGameSnapshot;
  now: number;
  onExit?: (() => void) | undefined;
  onRules?: (() => void) | undefined;
  notice?: string | null | undefined;
  onRetry?: (() => void) | undefined;
}) {
  const { runtime: m, player } = view,
    g = m.game,
    other = player === 0 ? 1 : 0;
  const ochkoRevealed = useOchkoReveal(
    g.kind === 'ochko' && g.winner !== null,
    now,
    g.kind === 'ochko' ? Math.max(...g.dealUntil) : 0,
    1600,
  );
  const motionDuration = !m.feedback
    ? 0
    : m.feedback.type === 'dart'
      ? DART_FLIGHT_MS + DART_IMPACT_MS
      : m.feedback.type === 'checkers' || (m.feedback.type === 'timeout' && g.kind === 'checkers')
        ? (m.checkersMove?.durationMs ?? 350)
        : m.feedback.type === 'shot'
          ? m.poolFrames.length
            ? POOL_STROKE_MS + ((m.poolFrames.length - 1) * 1000) / 60
            : Math.max(0, m.animationUntil - m.animationStart)
          : 0;
  const motionUntil = Math.max(
    m.animationStart + motionDuration,
    g.kind === 'darts' ? (m.dartRotation?.until ?? 0) : 0,
  );
  const animating = now < motionUntil;
  const thinking = m.computer && g.turn === other && g.winner === null && !animating && !view.ready;
  const poolShotPending = g.kind === 'billiards' && m.feedback?.type === 'shot' && animating;
  const settledPool = useRef<{
    id: string;
    groups: barPool.Game['groups'];
    counts: [number, number];
  } | null>(null);
  if (settledPool.current?.id !== view.id || g.kind !== 'billiards') settledPool.current = null;
  if (g.kind === 'billiards' && !poolShotPending) {
    settledPool.current = {
      id: view.id,
      groups: [...g.groups],
      counts: [count(view, 0)!, count(view, 1)!],
    };
  }
  // Keep the previous summary until the balls stop, including across repeated polls.
  // A mid-shot reconnect has no settled summary, so do not expose the outcome yet.
  const poolGroups =
    g.kind === 'billiards' ? (poolShotPending ? settledPool.current?.groups : g.groups) : undefined;
  const visibleCount = (p: 0 | 1) =>
    poolShotPending ? (settledPool.current?.counts[p] ?? 0) : count(view, p);
  const armCountdown = g.kind === 'armwrestling' && !view.ready && now < g.startedAt;
  const navalSetup = g.kind === 'battleship' && !!view.ready && !view.ready.cancelled;
  const seconds =
    navalSetup ? Math.max(0, Math.ceil(((view.ready!.startsAt ?? view.ready!.expiresAt) - now) / 1000)) :
    g.kind === 'ochko' && g.series && g.series.phase !== 'play' && g.winner === null
      ? Math.max(
          0,
          Math.ceil(
            ((g.series.phase === 'countdown'
              ? g.series.nextAt
              : g.series.phase === 'reveal'
                ? g.series.reviewAt
                : g.series.reviewUntil) -
              now) /
              1000,
          ),
        )
      : armCountdown && g.kind === 'armwrestling'
        ? Math.ceil((g.startedAt - now) / 1000)
        : (g.winner !== null && !poolShotPending) ||
            view.ready ||
            (g.kind === 'ochko' && g.done[player])
          ? null
          : Math.max(
              0,
              Math.ceil(
                ((g.kind === 'ochko'
                  ? g.deadlines[player]
                  : g.kind === 'armwrestling'
                    ? g.endsAt
                    : m.deadline) -
                  Math.max(now, motionUntil, g.kind === 'ochko' ? g.dealUntil[player] : 0)) /
                  1000,
              ),
            );
  let turn = poolShotPending
    ? 'Ход выполняется…'
    : g.winner !== null
      ? 'Партия завершена'
      : view.ready
        ? view.ready.startsAt !== null
          ? `Начинаем через ${Math.max(0, Math.ceil((view.ready.startsAt - now) / 1000))}…`
          : view.ready.players.includes(other)
            ? 'Соперник готов'
            : 'Ждём соперника'
        : thinking
          ? `${view.participants[other]!.displayName} думает…`
          : animating
            ? 'Ход выполняется…'
            : g.turn === player
              ? 'Твой ход'
              : 'Ход соперника';
  if (g.kind === 'armwrestling' && !view.ready && g.winner === null)
    turn = g.warning[player]
      ? 'Вернись к управлению, иначе поражение'
      : 'Держи опору и дави правой рукой';
  if (g.kind === 'ochko' && !view.ready && g.winner === null)
    turn = g.done[player] ? 'Ждём соперника' : 'Бери карту или выбирай «Хватит»';
  if (
    g.kind === 'battleship' &&
    view.ready &&
    view.ready.startsAt === null &&
    !view.ready.cancelled
  )
    turn = view.ready.players.includes(player)
      ? 'Ждём начала партии'
      : 'Выбери корабль сверху и расставь весь флот';
  if (armCountdown) turn = 'Приготовься к схватке';
  if (g.kind === 'ochko' && g.series && !view.ready) {
    if (g.series.phase === 'reveal') turn = 'Вскрываем карты…';
    if (g.series.phase === 'review')
      turn =
        g.series.challengeResult === 'correct'
          ? 'Счёт исправлен'
          : g.series.challengeResult === 'wrong'
            ? 'Счёт верный. Штраф: 3 очка'
            : g.series.ready[player]
              ? 'Ждём соперника'
              : 'Проверь карты и продолжай';
    if (g.series.phase === 'countdown') turn = 'Следующая раздача начинается…';
  }
  if (g.kind === 'battleship' && g.lastAction?.type === 'move' && !view.ready)
    turn = `Подлодка ${g.lastAction.player === player ? 'перемещена' : 'соперника переместилась'} · ${turn}`;
  if (g.kind === 'ochko' && g.winner !== null && !ochkoRevealed) turn = 'Вскрываем карты…';
  const boardSpinning =
    g.kind === 'darts' &&
    !!m.dartRotation &&
    now >= m.dartRotation.start &&
    now < m.dartRotation.until;
  if (boardSpinning) turn = 'Мишень вращается…';
  if (g.kind === 'darts' && g.winner === null && !view.ready && !boardSpinning)
    turn += ` · Осталось дротиков: ${g.dartsLeft}`;
  const dartFeedback = g.kind === 'darts' && m.feedback?.type === 'dart';
  const sinceContact = now - m.animationStart - DART_FLIGHT_MS;
  const result =
    (dartFeedback && (sinceContact < 0 || sinceContact >= 2000)) ||
    (g.kind === 'billiards' && (animating || now >= motionUntil + 2000)) ||
    (g.kind === 'battleship' && now >= m.animationStart + 2000)
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
    : m.missed[player] > 0 ||
        (g.kind === 'armwrestling' && g.warning[player]) ||
        m.feedback?.bust ||
        m.feedback?.foul
      ? 'danger'
      : (g.kind !== 'ochko' && g.kind !== 'armwrestling' && g.turn !== player) || animating
        ? 'warning'
        : 'success';
  return (
    <section
      className={`durak-menu game-scoreboard-stack bar-game-menu${g.kind === 'ochko' && g.series ? ' bar-game-menu--series' : ''}`}
      aria-label="Меню игры"
    >
      <div className="game-scoreboard game-scoreboard--stable-surface">
        <div className="game-scoreboard__row durak-menu__row">
          <div className="game-scoreboard__metric bar-game-player--self">
            <span className="bar-pool-group-slot bar-pool-group-slot--self">
              <PoolGroup group={view.ready ? null : poolGroups?.[player]} />
            </span>
            <div className="durak-menu__identity">
              <UserAvatar
                avatarUrl={view.participants[player]!.avatarUrl}
                name={view.participants[player]!.displayName}
                size={30}
                alt="Твой аватар"
              />
              <div className="bar-game-name-stack bar-game-name-stack--self">
              <CardPlayerName
                name={view.participants[player]!.displayName}
                count={view.ready ? undefined : visibleCount(player)}
              />
                {view.ready?.players.includes(player) && !view.ready.cancelled && <small className="bar-game-ready-label">Готов</small>}
              </div>
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
            <FittedMenuLabel>
              {navalSetup ? (view.ready!.startsAt === null ? 'Расстановка' : 'Старт') : g.kind === 'ochko' && g.series ? 'Таймер' : 'Время'}
            </FittedMenuLabel>
            <strong className="game-scoreboard__value">
              {((g.kind === 'ochko' && g.series) || navalSetup) && seconds !== null
                ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
                : (seconds ?? '–')}
            </strong>

          </div>
          {g.kind === 'ochko' && g.series && <div className="game-scoreboard__metric bar-ochko-round-metric" role="group" aria-label="Раздача">
            <FittedMenuLabel>Раздача</FittedMenuLabel>
            <strong className="game-scoreboard__value">{g.series.round}/4</strong>
          </div>}
          <div className="game-scoreboard__metric bar-game-player--opponent">
            <span className="bar-pool-group-slot bar-pool-group-slot--opponent">
              <PoolGroup group={view.ready ? null : poolGroups?.[other]} />
            </span>
            <div className="durak-menu__identity durak-menu__identity--opponent">
              <div
                className="bar-game-name-stack"
              >
                <CardPlayerName
                  name={view.participants[other]!.displayName}
                  count={
                    view.ready || (g.kind === 'ochko' && !g.series && !ochkoRevealed)
                      ? undefined
                      : visibleCount(other)
                  }
                  countFirst
                />
                {view.ready?.players.includes(other) &&
                  !view.ready.cancelled && <small className="bar-game-ready-label">Готов</small>}
              </div>
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
      {g.kind === 'armwrestling' && (
        <div className="bar-arm-stamina">
          <meter min={0} max={1} value={g.stamina[player]} aria-label="Твоя выносливость" />
          <meter min={0} max={1} value={g.stamina[other]} aria-label="Выносливость соперника" />
        </div>
      )}
      <div className="bar-game-notice-row">
        {onExit && (
          <button className="icon-btn" aria-label="Выйти из партии" onClick={onExit}>
            <LogOut size={18} />
          </button>
        )}
        <FittedNotice
          fit
          maxLines={2}
          role={notice ? 'alert' : 'status'}
          data-tone={notice ? 'warning' : tone}
          className="duel-fatigue-notice initial-training-feedback-notice--scoreboard durak-turn-notice"
        >
          {notice ?? feedback}
          {notice && onRetry && (
            <button className="bar-game-notice-retry" onClick={onRetry}>
              Повторить отправку
            </button>
          )}
        </FittedNotice>
        {onRules && (
          <button className="icon-btn" aria-label="Правила игры" onClick={onRules}>
            <HelpCircle size={20} />
          </button>
        )}
      </div>
    </section>
  );
}
