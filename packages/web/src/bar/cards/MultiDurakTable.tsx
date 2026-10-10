import { FittedNotice } from '../../game/FittedNotice.js';
import { useEffect, useRef, useState } from 'react';
import { LogOut, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AccessibleModal } from '../../components/AccessibleModal.js';
import { UserAvatar } from '../../chat/components/UserAvatar.js';
import { FittedMenuLabel } from './FittedMenuLabel.js';
import { DurakOpponentSeat } from './DurakOpponentSeat.js';
import { cardImage } from './DurakScreen.js';
import { art } from './DurakModals.js';
import { cardOrder, type Card } from './rules.js';
import type { RoomView, RoomCommand } from './roomApi.js';

const suits = { clubs: '♣', spades: '♠', hearts: '♥', diamonds: '♦' };
const ranks: Record<number, string> = { 11: 'В', 12: 'Д', 13: 'К', 14: 'Т' };
const label = (c: Card) => `${ranks[c.rank] ?? c.rank} ${suits[c.suit]}`;
export function MultiDurakTable({
  view,
  busy,
  error,
  now,
  onCommand,
  userId,
}: {
  userId?: string;
  view: RoomView;
  busy: boolean;
  error: string | null;
  now: number;
  onCommand: (command: RoomCommand) => void;
}) {
  const pregame = !view.game;
  const player = Math.max(
    0,
    view.seats.findIndex((s) => s.userId === userId),
  );
  const g = view.game ?? {
    player,
    hand: [],
    deckCount: 0,
    trump: 'clubs' as const,
    trumpCard: { id: 'hidden', rank: 6, suit: 'clubs' as const },
    attacker: -1,
    defender: -1,
    turn: player,
    table: [],
    phase: 'attack' as const,
    taking: false,
    deadline: null,
    actions: [],
    result: null,
  };
  const ready = view.ready.includes(view.seats[player]!.userId);
  const pregameText =
    view.status === 'ended'
      ? 'Встреча отменена: готовность не подтверждена.'
      : view.status === 'countdown'
        ? 'Игра начинается'
        : 'Ожидаем готовности игроков';
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string | null>(null);
  const [targets, setTargets] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [exit, setExit] = useState(false);
  const gesture = useRef<{ id: number; x: number; y: number } | null>(null);
  const suppress = useRef(false);
  useEffect(() => {
    setSelected(null);
    setTargets(false);
    setHint(null);
  }, [view.revision]);
  const own = g.player;
  const self = view.seats[own]!;
  const opponent = view.seats.length === 2 ? view.seats[(own + 1) % 2]! : null;
  const turn = view.seats[g.turn]!;
  const myTurn = !pregame && g.turn === own && g.result === null;
  const deadline = pregame ? (view.countdownAt ?? view.readyUntil ?? null) : g.deadline;
  const remaining = deadline === null ? null : Math.max(0, Math.ceil((deadline! - now) / 1000));
  const actions = g.actions;
  const play = (card: Card) => {
    const attack = actions.find((a) => a.type === 'play' && a.cardId === card.id);
    const beats = actions.filter((a) => a.type === 'beat' && a.cardId === card.id);
    if (attack) onCommand({ type: 'move', action: attack });
    else if (beats.length === 1) onCommand({ type: 'move', action: beats[0]! });
    else if (beats.length > 1) {
      setSelected(card.id);
      setTargets(true);
      setHint('Выбери карту на столе');
    } else
      setHint(g.phase === 'defend' ? 'Этой картой нельзя отбить' : 'Эту карту нельзя подкинуть');
  };
  const status =
    (pregame ? pregameText : null) ??
    hint ??
    (!myTurn
      ? `${turn.displayName}: ${g.phase === 'defend' ? 'отбивается' : g.phase === 'throw' ? 'подкидывает' : 'ходит'}`
      : g.phase === 'defend'
        ? 'Отбей карту или возьми'
        : g.phase === 'throw'
          ? actions.some((a) => a.type === 'play')
            ? 'Подкинь карту или пропусти'
            : 'Нажми «Пропустить»'
          : 'Твой ход');
  return (
    <main className="screen durak-screen durak-screen--online durak-screen--multi">
      {error && (
        <p className="durak-network-error" role="alert">
          {error}
        </p>
      )}
      <section className="durak-menu game-scoreboard-stack" aria-label="Меню игры">
        <div className="game-scoreboard game-scoreboard--stable-surface">
          <div className="game-scoreboard__row durak-menu__row">
            <div className="game-scoreboard__metric">
              <div className="durak-menu__identity">
                <UserAvatar name={self.displayName} avatarUrl={self.avatarUrl} size={28} />
                <FittedMenuLabel>{`${self.displayName}${pregame ? '' : ` (${g.hand.length})`}`}</FittedMenuLabel>
              </div>
            </div>
            <div
              className="game-scoreboard__metric game-scoreboard__metric--timer"
              role="timer"
              data-tone={
                remaining === null
                  ? 'idle'
                  : remaining <= 4
                    ? 'danger'
                    : remaining <= 9
                      ? 'warning'
                      : 'success'
              }
            >
              <FittedMenuLabel>Время</FittedMenuLabel>
              <strong className="game-scoreboard__value">{remaining ?? '–'}</strong>
            </div>
            <div className="game-scoreboard__metric">
              {opponent ? (
                <div className="durak-menu__identity durak-menu__identity--opponent">
                  <FittedMenuLabel>{`(${opponent.count}) ${opponent.displayName}`}</FittedMenuLabel>
                  <UserAvatar
                    name={opponent.displayName}
                    avatarUrl={opponent.avatarUrl}
                    size={28}
                  />
                </div>
              ) : (
                <FittedMenuLabel>{`${pregame ? `${view.seats.filter(s => view.ready.includes(s.userId)).length} из ${view.seats.length}` : view.seats.filter((s) => s.status === 'playing').length} за столом`}</FittedMenuLabel>
              )}
            </div>
            <div className="game-scoreboard__metric durak-menu__trump" aria-label={pregame ? 'Козырь не определён' : `Козырь ${suits[g.trump]}`}>
              <span className="game-scoreboard__label">Козырь</span>
              <strong className="durak-menu__trump-symbol">{pregame ? '—' : suits[g.trump]}</strong>
            </div>
          </div>
        </div>
        <FittedNotice fit
          role="status"
          className="duel-fatigue-notice initial-training-feedback-notice--scoreboard durak-turn-notice"
          data-tone={
            !myTurn || g.phase === 'throw' ? 'warning' : g.phase === 'defend' ? 'danger' : 'success'
          }
        >
          {status}
        </FittedNotice>
      </section>
      {opponent ? (
        <section className="durak-opponent" aria-label="Соперник за столом">
          <img
            className="durak-silhouette"
            src="/bar/cards/opponent-v1.webp"
            alt="Соперник с картами"
          />
        </section>
      ) : (
        <section
          className="durak-multi-seats"
          data-count={view.seats.length}
          aria-label="Игроки в порядке мест за столом"
        >
          {(view.seats.length > 4 ? [0, 1, 2, ...Array.from({ length: view.seats.length - 3 }, (_, i) => view.seats.length - 1 - i)] : view.seats.length === 4 ? [0, 1, 3, 2] : [0, 1, 2]).map((p) => {
            const seat = view.seats[p]!;
            return (
              <DurakOpponentSeat
                avatarSize={view.seats.length <= 4 ? 64 : 56}
                seatLabel={String(p + 1)}
                self={p === own}
                taking={!pregame && g.taking && p === g.defender}
                key={seat.userId}
                name={seat.displayName}
                avatarUrl={seat.avatarUrl}
                count={seat.count}
                showCount={!pregame}
                active={!pregame && p === g.turn}
                status={
                  pregame ? (view.ready.includes(seat.userId) ? 'ready' : 'waiting') : seat.status
                }
                description={
                  pregame
                    ? view.ready.includes(seat.userId)
                      ? 'Готов'
                      : 'Ожидаем готовности'
                    : seat.status === 'won'
                      ? 'Без карт'
                      : seat.status === 'left'
                        ? 'Вышел'
                        : seat.status === 'lost'
                          ? 'Поражение'
                          : g.taking && p === g.defender
                            ? 'Берёт карты'
                            : p === g.defender
                            ? 'Отбивается'
                            : p === g.attacker
                              ? 'Атакует'
                              : 'За столом'
                }
              />
            );
          })}
        </section>
      )}
      <section className="durak-table" aria-label="Карты на столе">
        <div className={`durak-deck${g.deckCount ? '' : ' durak-deck--empty'}`}>
          <div>
            {g.deckCount > 0 && (
              <>
                <img src={art('card-back')} alt="Колода" />
                <span className="durak-deck__count">{g.deckCount}</span>
                <img src={cardImage(g.trumpCard)} alt={`Козырь ${suits[g.trump]}`} />
              </>
            )}
          </div>
        </div>
        <div className="durak-pairs">
          {g.table.map((pair, index) => {
            const beat = targets
              ? actions.find(
                  (a) => a.type === 'beat' && a.cardId === selected && a.target === index,
                )
              : undefined;
            return (
              <button
                key={pair.attack.id}
                className={`durak-pair${beat ? ' durak-pair--target' : ''}`}
                disabled={busy || !beat}
                aria-label={`Отбить ${label(pair.attack)}`}
                onClick={() => beat && onCommand({ type: 'move', action: beat })}
              >
                <img src={cardImage(pair.attack)} alt={label(pair.attack)} />
                {pair.defence && (
                  <img
                    className="durak-defence"
                    src={cardImage(pair.defence)}
                    alt={label(pair.defence)}
                  />
                )}
              </button>
            );
          })}
        </div>
      </section>
      <section className="durak-controls">
        <button
          className="icon-btn durak-tool"
          aria-label="Выйти из игры"
          onClick={() => (pregame ? onCommand({ type: 'leave' }) : setExit(true))}
        >
          <LogOut size={20} />
        </button>
        <div className="durak-actions">
          {actions.some((a) => a.type === 'take') && (
            <button
              className="btn btn--cta"
              disabled={busy}
              onClick={() => onCommand({ type: 'move', action: { type: 'take' } })}
            >
              Беру
            </button>
          )}
          {actions.some((a) => a.type === 'pass') && (
            <button
              className="btn btn--cta"
              disabled={busy}
              onClick={() => onCommand({ type: 'move', action: { type: 'pass' } })}
            >
              Пропустить
            </button>
          )}
        </div>
        <button className="icon-btn durak-tool" aria-label="Правила" onClick={() => setHelp(true)}>
          <span className="durak-tool__question">?</span>
        </button>
      </section>
      {pregame && (
        <div className="durak-ready-panel game-scoreboard">
          <p role="status">{pregameText}</p>
          {view.status === 'confirming' && (
            <button
              className="btn btn--cta"
              disabled={busy || ready}
              onClick={() => onCommand({ type: 'ready' })}
            >
              {ready ? 'Вы готовы' : 'Готов'}
            </button>
          )}
          {view.status === 'ended' && (
            <button className="btn btn--cta" onClick={() => navigate('/bar/cards/online')}>
              Вернуться
            </button>
          )}
        </div>
      )}
      <div className="durak-hand" role="group" aria-label="Твои карты">
        {[...g.hand].sort(cardOrder(g.trump)).map((card) => (
          <button
            key={card.id}
            className={`durak-card${selected === card.id ? ' durak-card--selected' : ''}`}
            aria-label={label(card)}
            aria-pressed={selected === card.id}
            disabled={busy || !myTurn}
            onPointerDown={(e) => {
              suppress.current = false;
              gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
              e.currentTarget.setPointerCapture?.(e.pointerId);
            }}
            onPointerCancel={() => {
              gesture.current = null;
            }}
            onPointerUp={(e) => {
              const start = gesture.current;
              gesture.current = null;
              if (
                start &&
                start.id === e.pointerId &&
                start.y - e.clientY >= 42 &&
                start.y - e.clientY > Math.abs(start.x - e.clientX) * 1.3
              ) {
                suppress.current = true;
                setSelected(card.id);
                play(card);
              }
            }}
            onClick={() => {
              if (suppress.current) {
                suppress.current = false;
                return;
              }
              if (selected === card.id) play(card);
              else {
                setSelected(card.id);
                setTargets(false);
                setHint('Подтвердить выбор');
              }
            }}
          >
            <img src={cardImage(card)} alt="" draggable={false} />
          </button>
        ))}
      </div>
      {g.result !== null && (
        <AccessibleModal
          title={g.result === 'won' ? 'Победа' : 'Поражение'}
          onRequestClose={() => navigate('/bar/cards/online')}
        >
          <p className="modal-copy">
            {g.result === 'won'
              ? g.hand.length
                ? 'Другие участники вышли из партии. Ты победил.'
                : view.status === 'ended'
                  ? 'Ты избавился от всех карт. Партия завершена.'
                  : 'Ты избавился от всех карт. Остальные участники продолжат партию.'
              : g.result === 'left'
                ? 'Ты вышел из партии. Остальные участники продолжат игру.'
                : 'Ты остался с картами последним.'}
          </p>
          <div className="modal-actions">
            <button className="btn btn--cta" onClick={() => navigate('/bar/cards/online')}>
              Понятно
            </button>
          </div>
        </AccessibleModal>
      )}
      {help && g.result === null && (
        <AccessibleModal
          title="Как играть"
          onRequestClose={() => setHelp(false)}
          headerAction={
            <button className="icon-btn" aria-label="Закрыть" onClick={() => setHelp(false)}>
              <X size={15} />
            </button>
          }
        >
          <p className="modal-copy durak-rules-copy">
            Подкидной дурак, 36 карт. Отбивай старшей картой той же масти или козырем. Козырь –
            только старшим козырем.
          </p>
          <p className="modal-copy durak-rules-copy">
            Подкидывают по очереди карты того же достоинства, что уже есть на столе. В первом заходе
            максимум пять карт, затем шесть, но не больше числа карт у отбивающегося в начале
            захода. «Пропустить» передаёт право подкинуть следующему участнику.
          </p>
          <p className="modal-copy durak-rules-copy">
            На атаку и защиту – 20 секунд, на подкидывание – 5 секунд. Время вышло: в атаке уйдёт
            младшая карта, на защите заберёшь карты, на подкидывании пропустишь. Таймер идёт и пока
            открыты правила.
          </p>
          <p className="modal-copy durak-rules-copy">
            Выбери карту нажатием, затем нажми ещё раз или проведи вверх, чтобы сыграть. Когда
            колода закончилась, избавься от всех карт. Последний с картами проигрывает.
          </p>
          <div className="modal-actions">
            <button className="modal-primary btn btn--cta" onClick={() => setHelp(false)}>
              Понятно
            </button>
          </div>
        </AccessibleModal>
      )}
      {exit && g.result === null && (
        <AccessibleModal title="Выйти из игры?" onRequestClose={() => setExit(false)}>
          <p className="modal-copy">
            Тебе будет засчитано поражение. Остальные участники продолжат партию.
          </p>
          <div className="modal-actions">
            <button className="btn btn--ghost" onClick={() => setExit(false)}>
              Продолжить
            </button>
            <button
              className="modal-primary btn btn--cta"
              disabled={busy}
              onClick={() => {
                setExit(false);
                onCommand({ type: 'leave' });
              }}
            >
              Сдаться
            </button>
          </div>
        </AccessibleModal>
      )}
    </main>
  );
}
