import { LogOut, X } from 'lucide-react';
import { AccessibleModal } from '../../components/AccessibleModal.js';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserAvatar } from '../../chat/components/UserAvatar.js';
import { FittedMenuLabel } from './FittedMenuLabel.js';
import { useAuthStore } from '../../auth/authStore.js';
import { DurakResultModal, art } from './DurakModals.js';
import { useDurakGame } from './useDurakGame.js';
import { cardOrder, legalActions, type Card, type Game } from './rules.js';
import '../bar.css';
import './durak.css';
const symbols = { clubs: '♣', spades: '♠', hearts: '♥', diamonds: '♦' };
const rankNames: Record<number, string> = { 11: 'В', 12: 'Д', 13: 'К', 14: 'Т' };
const assetRanks: Record<number, string> = { 11: 'jack', 12: 'queen', 13: 'king', 14: 'ace' };
export const cardImage = (c: Card) => art(`${c.suit}-${assetRanks[c.rank] ?? c.rank}`);
const label = (c: Card) => `${rankNames[c.rank] ?? c.rank} ${symbols[c.suit]}`;
export function DurakScreen({
  initialGame,
  previewPlayer,
}: {
  initialGame?: Game | undefined;
  previewPlayer?: { displayName: string; avatarUrl?: string };
} = {}) {
  const navigate = useNavigate();
  const profile = useAuthStore((state) => state.user);
  const user = profile ?? previewPlayer;
  const { game, dispatch, restart, surrender, remainingSeconds, thinking } =
    useDurakGame(initialGame);
  const [help, setHelp] = useState(false);
  const [exit, setExit] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [targetReady, setTargetReady] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const gesture = useRef<{ id: number; x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const actions = legalActions(game, 0);
  const selectedBeats = targetReady
    ? actions.filter((a) => a.type === 'beat' && a.cardId === selected)
    : [];
  useEffect(() => {
    setSelected(null);
    setTargetReady(false);
    setHint(null);
  }, [game.revision]);
  const back = () => navigate('/bar');
  const commit = (card: Card) => {
    const play = actions.find((a) => a.type === 'play' && a.cardId === card.id);
    const beats = actions.filter((a) => a.type === 'beat' && a.cardId === card.id);
    if (play) dispatch(play);
    else if (beats.length === 1) dispatch(beats[0]!);
    else if (beats.length > 1) {
      setSelected(card.id);
      setTargetReady(true);
      setHint('Выбери карту на столе');
    } else {
      setTargetReady(false);
      setHint(game.phase === 'defend' ? 'Этой картой нельзя отбить' : 'Эту карту нельзя подкинуть');
    }
  };
  const choose = (card: Card) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (selected === card.id) commit(card);
    else {
      setSelected(card.id);
      setTargetReady(false);
      setHint('Подтвердить выбор');
    }
  };
  const status = thinking
    ? 'Мария думает…'
    : (hint ??
      (game.phase === 'defend'
        ? 'Отбей карту или возьми'
        : game.phase === 'taking'
          ? 'Можно подкинуть или завершить'
          : game.table.length
            ? 'Подкинь карту или нажми «Бито»'
            : 'Твой ход'));
  return (
    <main className="screen durak-screen">
      <section className="durak-menu game-scoreboard-stack" aria-label="Меню игры">
        <div className="game-scoreboard game-scoreboard--stable-surface">
          <div className="game-scoreboard__row durak-menu__row">
            <div className="game-scoreboard__metric">
              <div className="durak-menu__identity">
                <UserAvatar
                  avatarUrl={user?.avatarUrl}
                  name={user?.displayName ?? 'Игрок'}
                  size={28}
                  alt="Твой аватар"
                />
                <FittedMenuLabel>{`${user?.displayName ?? 'Игрок'} (${game.hands[0].length})`}</FittedMenuLabel>
              </div>
            </div>
            <div
              className="game-scoreboard__metric game-scoreboard__metric--timer"
              data-tone={
                remainingSeconds === null
                  ? 'idle'
                  : remainingSeconds <= 4
                    ? 'danger'
                    : remainingSeconds <= 10
                      ? 'warning'
                      : 'success'
              }
              aria-label="Осталось времени"
              role="timer"
            >
              <FittedMenuLabel>Время</FittedMenuLabel>
              <strong className="game-scoreboard__value">{remainingSeconds ?? '—'}</strong>
            </div>
            <div className="game-scoreboard__metric">
              <div className="durak-menu__identity durak-menu__identity--opponent">
                <FittedMenuLabel>{`(${game.hands[1].length}) Мария`}</FittedMenuLabel>
                <UserAvatar avatarUrl={art('playing')} name="Мария" size={28} alt="Аватар Марии" />
              </div>
            </div>
          </div>
        </div>
        <div
          role="status"
          data-tone={
            thinking ||
            game.phase === 'taking' ||
            (game.phase !== 'defend' && game.table.length > 0)
              ? 'warning'
              : game.phase === 'defend'
                ? 'danger'
                : 'success'
          }
          className="duel-fatigue-notice initial-training-feedback-notice--scoreboard durak-turn-notice"
        >
          {status}
        </div>
      </section>
      <section className="durak-opponent" aria-label="Карты Марии">
        {game.hands[1].length > 0 ? (
          <img src={art('playing')} alt="Мария с картами" />
        ) : (
          <img src={art('player-win')} alt="Мария закончила игру" />
        )}
      </section>
      <section className="durak-table" aria-label="Карты на столе">
        <div className={`durak-deck${game.deck.length === 0 ? ' durak-deck--empty' : ''}`}>
          <div>
            {game.deck.length > 0 && <img src={art('card-back')} alt="Колода" />}
            {game.deck.length > 0 && (
              <span className="durak-deck__count" aria-label="Карт в колоде">
                {game.deck.length}
              </span>
            )}
            {game.deck.length > 0 && (
              <img src={cardImage(game.trumpCard)} alt={`Козырь ${symbols[game.trump]}`} />
            )}
          </div>
        </div>
        <div className="durak-pairs">
          {game.table.map((pair, index) => {
            const beat = selectedBeats.find((a) => a.type === 'beat' && a.target === index);
            return (
              <button
                key={pair.attack.id}
                className={`durak-pair${beat ? ' durak-pair--target' : ''}`}
                aria-label={`Отбить ${label(pair.attack)}`}
                disabled={!beat}
                onClick={() => beat && dispatch(beat)}
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
          onClick={() => setExit(true)}
        >
          <LogOut size={20} />
        </button>
        <div className="durak-actions">
          {actions.some((a) => a.type === 'take') && (
            <button className="btn btn--cta" onClick={() => dispatch({ type: 'take' })}>
              Беру
            </button>
          )}
          {actions.some((a) => a.type === 'finish') && (
            <button className="btn btn--cta" onClick={() => dispatch({ type: 'finish' })}>
              {game.phase === 'taking' ? 'Завершить' : 'Бито'}
            </button>
          )}
        </div>
        <button className="icon-btn durak-tool" aria-label="Правила" onClick={() => setHelp(true)}>
          <span className="durak-tool__question" aria-hidden="true">
            ?
          </span>
        </button>
      </section>
      <div className="durak-hand" role="group" aria-label="Твои карты">
        {[...game.hands[0]].sort(cardOrder(game.trump)).map((card) => (
          <button
            key={card.id}
            className={`durak-card${selected === card.id ? ' durak-card--selected' : ''}`}
            aria-label={label(card)}
            aria-pressed={selected === card.id}
            disabled={thinking || game.result !== null}
            onPointerDown={(event) => {
              suppressClick.current = false;
              gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
              event.currentTarget.setPointerCapture?.(event.pointerId);
            }}
            onPointerCancel={() => {
              gesture.current = null;
            }}
            onPointerUp={(event) => {
              const start = gesture.current;
              gesture.current = null;
              if (!start || start.id !== event.pointerId) return;
              const dy = start.y - event.clientY;
              const dx = Math.abs(start.x - event.clientX);
              if (dy >= 42 && dy > dx * 1.3) {
                suppressClick.current = true;
                setSelected(card.id);
                commit(card);
              }
            }}
            onClick={() => choose(card)}
          >
            <img src={cardImage(card)} alt="" draggable={false} />
          </button>
        ))}
      </div>
      {game.result !== null && (
        <DurakResultModal
          result={game.result}
          onReplay={() => {
            setSelected(null);
            setHelp(false);
            setExit(false);
            restart();
          }}
          onBack={back}
        />
      )}
      {help && game.result === null && (
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
            Подкидывай карты того же достоинства, что уже есть на столе. За заход можно подкинуть до
            шести карт, но не больше, чем было у соперника в начале. Не можешь отбиться – нажми
            «Беру». Все карты отбиты – «Бито».
          </p>
          <p className="modal-copy durak-rules-copy">
            Нажми на карту, чтобы выбрать её, и ещё раз, чтобы сыграть. Проведи пальцем по карте
            вверх, чтобы сразу отправить её на стол. Если ей можно отбить несколько карт, выбери
            нужную на столе.
          </p>
          <p className="modal-copy durak-rules-copy">
            На ход у тебя 20 секунд, даже пока читаешь правила. Время вышло – в атаке уйдёт младшая
            подходящая карта, на отбое заберёшь карты со стола. Когда колода закончится, первым
            избавься от всех карт.
          </p>
          <div className="modal-actions">
            <button className="modal-primary btn btn--cta" onClick={() => setHelp(false)}>
              Понятно
            </button>
          </div>
        </AccessibleModal>
      )}
      {exit && game.result === null && (
        <AccessibleModal
          title="Выйти из игры?"
          onRequestClose={() => setExit(false)}
          headerAction={
            <button className="icon-btn" aria-label="Закрыть" onClick={() => setExit(false)}>
              <X size={15} />
            </button>
          }
        >
          <p className="modal-copy">Если выйдешь сейчас, тебе будет засчитано поражение.</p>
          <div className="modal-actions">
            <button className="btn btn--ghost" onClick={() => setExit(false)}>
              Продолжить
            </button>
            <button
              className="modal-primary btn btn--cta"
              onClick={() => {
                setExit(false);
                setHelp(false);
                surrender();
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
