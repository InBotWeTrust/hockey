import type { BarGameAction, barOchko } from '@hockey/game-core';
import { cardImage } from '../cards/DurakScreen.js';
const suits = ['clubs', 'diamonds', 'hearts', 'spades'] as const;
function Card({ id }: { id: number }) {
  const hidden = id < 0;
  return (
    <img
      className="bar-ochko-card"
      src={
        hidden
          ? '/bar/cards/card-back-v1.webp'
          : cardImage({ id: String(id), suit: suits[id % 4]!, rank: 6 + Math.floor(id / 4) })
      }
      alt={
        hidden
          ? 'Закрытая карта'
          : `Карта ${['6', '7', '8', '9', '10', 'В', 'Д', 'К', 'Т'][Math.floor(id / 4)]}`
      }
      draggable={false}
    />
  );
}
export function OchkoField({
  game,
  player,
  now,
  disabled,
  pregame = false,
  send,
}: {
  game: barOchko.OchkoView;
  player: 0 | 1;
  now: number;
  disabled: boolean;
  pregame?: boolean;
  send: (action: BarGameAction) => void;
}) {
  const other = player === 0 ? 1 : 0,
    blocked =
      pregame ||
      disabled ||
      game.done[player] ||
      game.winner !== null ||
      now < game.dealUntil[player];
  return (
    <div className="bar-ochko-field">
      <div className="bar-ochko-hand" aria-label="Карты соперника">
        {game.hands[other].map((id, i) => (
          <Card key={i} id={id} />
        ))}
      </div>
      <div className="bar-ochko-total">
        {pregame
          ? ''
          : game.winner !== null
            ? `${game.scores[other]} : ${game.scores[player]}`
            : `У тебя ${game.scores[player]}`}
      </div>
      <div className="bar-ochko-hand" aria-label="Твои карты">
        {game.hands[player].map((id, i) => (
          <Card key={i} id={id} />
        ))}
      </div>
      {!pregame && (
        <div className="bar-ochko-actions">
          <button
            className="btn btn--ghost"
            disabled={blocked}
            onClick={() => send({ type: 'ochko-hit', seq: game.actionSeq[player] + 1 })}
          >
            Ещё карту
          </button>
          <button
            className="btn btn--cta"
            disabled={blocked}
            onClick={() => send({ type: 'ochko-stand', seq: game.actionSeq[player] + 1 })}
          >
            Хватит
          </button>
        </div>
      )}
    </div>
  );
}
