import { FittedNotice } from '../../game/FittedNotice.js';
import { LogOut, X } from 'lucide-react';
import { AccessibleModal } from '../../components/AccessibleModal.js';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { UserAvatar } from '../../chat/components/UserAvatar.js';
import { FittedMenuLabel, CardPlayerName } from './FittedMenuLabel.js';
import { useAuthStore } from '../../auth/authStore.js';
import { DurakResultModal, art } from './DurakModals.js';
import { computerOpponent, opponentArt, type ComputerOpponentId } from './computerOpponents.js';
import { useDurakGame } from './useDurakGame.js';
import { recordCardGame } from './cardHistoryDelivery.js';
import type { CompletedCardGame } from './cardHistory.js';
import { automaticAction, cardOrder, legalActions, type Card, type Game } from './rules.js';
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
  const params = useParams();
  const owner = useAuthStore(state => state.user?.id);
  const opponentId = computerOpponent(params.opponentId).id;
  return (
    <ComputerGame
      key={`${opponentId}:${owner ?? 'preview'}`}
      opponentId={opponentId}
      initialGame={initialGame}
      {...(previewPlayer ? { previewPlayer } : {})}
    />
  );
}
function ComputerGame({
  opponentId,
  initialGame,
  previewPlayer,
}: {
  opponentId: ComputerOpponentId;
  initialGame?: Game | undefined;
  previewPlayer?: { displayName: string; avatarUrl?: string };
}) {
  const owner = useAuthStore(state => state.user?.id);
  const [unsaved,setUnsaved] = useState<CompletedCardGame | null>(null);
  const save = (match: CompletedCardGame) => {
    if (!owner || previewPlayer) return;
    try { recordCardGame(owner,match); setUnsaved(null); }
    catch { setUnsaved(match); }
  };
  const controller = useDurakGame(initialGame, opponentId, save);
  return (
    <>
    {unsaved && <div className="bar-card-history-error" role="alert">
      Не удалось сохранить результат партии на устройстве.
      <button className="btn btn--ghost" onClick={() => save(unsaved)}>Повторить сохранение</button>
    </div>}
    <DurakTable
      opponentId={opponentId}
      controller={controller}
      {...(previewPlayer ? { previewPlayer } : {})}
    />
    </>
  );
}
export function DurakTable({
  controller,
  previewPlayer,
  opponent,
  online = false,
  opponentId = 'maria',
  error,
  pregame,
}: {
  controller: ReturnType<typeof useDurakGame>;
  previewPlayer?: { displayName: string; avatarUrl?: string };
  opponent?: { displayName: string; avatarUrl: string | null };
  online?: boolean;
  opponentId?: ComputerOpponentId;
  error?: string | null;
  pregame?: {
    text: string;
    ready: boolean;
    countdown: boolean;
    cancelled: boolean;
    pending: boolean;
    onReady: () => void;
  };
}) {
  const navigate = useNavigate();
  const computer = computerOpponent(opponentId);
  const profile = useAuthStore((state) => state.user);
  const user = profile ?? previewPlayer;
  const { game, dispatch, restart, surrender, remainingSeconds, thinking } = controller;
  const [help, setHelp] = useState(false);
  const [exit, setExit] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [targetReady, setTargetReady] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const gesture = useRef<{ id: number; x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const actions = legalActions(game, 0);
  const automatic = !pregame && (online
    ? !game.deck.length && !game.hands[0].length && actions.some((a) => a.type === 'finish')
    : automaticAction(game));
  const selectedBeats = targetReady
    ? actions.filter((a) => a.type === 'beat' && a.cardId === selected)
    : [];
  useEffect(() => {
    setSelected(null);
    setTargetReady(false);
    setHint(null);
  }, [game.revision]);
  const back = () => navigate('/bar', { replace: true });
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
  const status =
    pregame?.text ??
    (automatic
      ? 'Завершаем заход…'
      : thinking
        ? online
          ? 'Ход соперника'
          : `${computer.name} думает…`
        : (hint ??
          (game.phase === 'defend'
            ? 'Отбей карту или возьми'
            : game.phase === 'taking'
              ? actions.some((a) => a.type === 'play')
                ? `${opponent?.displayName ?? computer.name} берёт. Подкинь или заверши ход.`
                : `${opponent?.displayName ?? computer.name} берёт. Заверши ход.`
              : game.table.length
                ? actions.some((a) => a.type === 'play')
                  ? 'Подкинь карту или нажми «Бито»'
                  : 'Нажми «Бито»'
                : 'Твой ход')));
  return (
    <main className={`screen durak-screen${online ? ' durak-screen--online' : ''}`}>
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
                <UserAvatar
                  avatarUrl={user?.avatarUrl}
                  name={user?.displayName ?? 'Игрок'}
                  size={28}
                  alt="Твой аватар"
                />
                <CardPlayerName name={user?.displayName ?? 'Игрок'} count={pregame ? undefined : game.hands[0].length} />
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
                <CardPlayerName name={opponent?.displayName ?? computer.name} count={pregame ? undefined : game.hands[1].length} countFirst />
                <UserAvatar
                  avatarUrl={
                    online ? (opponent?.avatarUrl ?? undefined) : opponentArt(opponentId, 'avatar')
                  }
                  name={opponent?.displayName ?? computer.name}
                  size={28}
                  alt={online ? 'Аватар соперника' : `Аватар: ${computer.name}`}
                />
              </div>
            </div>
          </div>
        </div>
        <FittedNotice
          fit
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
        </FittedNotice>
      </section>
      {online ? (
        <section className="durak-opponent" aria-label="Соперник за столом">
          <img
            className="durak-silhouette"
            src="/bar/cards/opponent-v1.webp"
            alt="Соперник с картами"
          />
        </section>
      ) : (
        <section className="durak-opponent" aria-label={`Карты: ${computer.name}`}>
          <>
            {game.hands[1].length > 0 ? (
              <img src={opponentArt(opponentId, 'playing')} alt={`${computer.name} с картами`} />
            ) : (
              <img src={opponentArt(opponentId, 'player-win')} alt={`${computer.name} без карт`} />
            )}
          </>
        </section>
      )}
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
        <div className="durak-pairs" data-count={game.table.length}>
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
      {!pregame && (
      <section className="durak-controls">
        <button
          className="icon-btn durak-tool"
          aria-label="Выйти из игры"
          onClick={() => setExit(true)}
        >
          <LogOut size={20} />
        </button>
        <div
          className={`durak-actions${!online && opponentId === 'grigory' ? ' durak-actions--grigory' : ''}`}
        >
          {!online && opponentId === 'grigory' && game.phase === 'defend' && !thinking && (
            <button
              className="btn btn--ghost"
              onClick={() => {
                const caught = controller.challengeCheat?.();
                setHint(caught ? 'Карта возвращена Григорию' : 'Григорий сыграл по правилам');
              }}
            >
              Жульничаешь!
            </button>
          )}
          {actions.some((a) => a.type === 'take') && (
            <button className="btn btn--cta" onClick={() => dispatch({ type: 'take' })}>
              Беру
            </button>
          )}
          {!automatic && actions.some((a) => a.type === 'finish') && (
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
      )}
      {pregame && (!pregame.countdown || pregame.cancelled) && (
        <div className="durak-ready-actions" role="status">
          {!pregame.cancelled && !pregame.countdown && (
            <button
              className="btn btn--cta"
              disabled={pregame.pending || pregame.ready}
              onClick={pregame.onReady}
            >
              {pregame.ready ? 'Вы готовы' : 'Готов'}
            </button>
          )}
          {pregame.cancelled && (
            <button className="btn btn--cta" onClick={() => restart()}>
              Вернуться
            </button>
          )}
        </div>
      )}
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
      {game.result !== null &&
        (online ? (
          <AccessibleModal
            title={game.result === 0 ? 'Победа' : game.result === 'draw' ? 'Ничья' : 'Поражение'}
            onRequestClose={back}
          >
            <p className="modal-copy">
              {game.result === 0
                ? 'Ты первым избавился от карт.'
                : game.result === 'draw'
                  ? 'Вы закончили одновременно.'
                  : 'Соперник выиграл эту партию.'}
            </p>
            <div className="modal-actions">
              <button className="btn btn--cta" onClick={back}>
                Понятно
              </button>
            </div>
          </AccessibleModal>
        ) : (
          <DurakResultModal
            opponentId={opponentId}
            result={game.result}
            onReplay={() => {
              setSelected(null);
              setHelp(false);
              setExit(false);
              restart();
            }}
            onBack={back}
          />
        ))}
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
            На первый ход каждого захода 40 секунд, после каждого действия 30 секунд, даже пока читаешь правила. Время вышло – в атаке уйдёт младшая
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
