import type { BarGameAction, barOchko } from '@hockey/game-core';
import { useOchkoReveal } from './useResultReady.js';
import { cardImage } from '../cards/DurakScreen.js';
const suits = ['clubs', 'diamonds', 'hearts', 'spades'] as const;
function Card({
  id,
  delay = 0,
  revealing = false,
}: {
  id: number;
  delay?: number;
  revealing?: boolean;
}) {
  const hidden = id < 0;
  return (
    <img
      className="bar-ochko-card"
      style={{
        animationDelay: `${revealing ? 0 : delay}ms`,
        ...(revealing ? { animationName: 'bar-ochko-reveal', animationDuration: '400ms' } : {}),
      }}
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
  character = false,
  send,
}: {
  game: barOchko.OchkoView;
  player: 0 | 1;
  now: number;
  disabled: boolean;
  pregame?: boolean;
  character?: boolean;
  send: (action: BarGameAction) => void;
}) {
  const legacyRevealed = useOchkoReveal(game.winner !== null, now, Math.max(...game.dealUntil));
  const series = game.series;
  const revealed = series ? now >= series.reviewAt && series.phase !== 'play' : legacyRevealed;
  const other = player === 0 ? 1 : 0,
    blocked =
      pregame ||
      disabled ||
      game.done[player] ||
      (!!series && series.phase !== 'play') ||
      game.winner !== null ||
      now < game.dealUntil[player];
  if (pregame) return <div className={`bar-ochko-field${series ? ' bar-ochko-field--series' : ''}`} />;
  return (
    <div className={`bar-ochko-field${series ? ' bar-ochko-field--series' : ''}`}>
      <div
        className={`bar-ochko-hand${!series && revealed ? ' bar-ochko-hand--revealed' : ''}`}
        aria-label="Карты соперника"
      >
        {series && revealed && game.scores[other] >= 0 && (
          <strong className="bar-ochko-sum bar-ochko-sum--opponent">{game.scores[other]}</strong>
        )}
        {game.hands[other].map((id, i) => (
          <Card
            delay={series && game.hands[other].length === 2 ? i * 700 : 0}
            key={`${series?.round ?? 0}-${i}-${series ? id : 'legacy'}`}
            revealing={!!series && id >= 0 && series.phase !== 'play'}
            id={!series && game.winner !== null && !revealed ? -1 : id}
          />
        ))}
      </div>
      <div className="bar-ochko-hand" aria-label="Твои карты">
        {series && game.scores[player] >= 0 && (
          <strong className="bar-ochko-sum bar-ochko-sum--self">{game.scores[player]}</strong>
        )}
        {game.hands[player].map((id, i) => (
          <Card
            key={`${series?.round ?? 0}-${i}`}
            id={id}
            delay={series && game.hands[player].length === 2 ? i * 700 : 0}
          />
        ))}
      </div>
      {!pregame && (!series || series.phase === 'play' || series.phase === 'reveal' || series.phase === 'countdown') && (
        <div className="bar-ochko-actions">
          <button
            className="btn btn--ghost"
            disabled={blocked}
            onClick={() =>
              send({
                type: 'ochko-hit',
                seq: game.actionSeq[player] + 1,
                ...(series ? { round: series.round } : {}),
              })
            }
          >
            Ещё карту
          </button>
          <button
            className="btn btn--cta"
            disabled={blocked}
            onClick={() =>
              send({
                type: 'ochko-stand',
                seq: game.actionSeq[player] + 1,
                ...(series ? { round: series.round } : {}),
              })
            }
          >
            Хватит
          </button>
        </div>
      )}
      {series?.phase === 'review' && game.winner === null && (
        <div className="bar-ochko-actions">
          {character && (
            <button
              className="btn btn--ghost"
              disabled={disabled || series.challenged}
              onClick={() => send({ type: 'ochko-challenge', round: series.round })}
            >
              Проверить счёт
            </button>
          )}
          <button
            className="btn btn--cta"
            disabled={disabled || series.ready[player]}
            onClick={() => send({ type: 'ochko-next', round: series.round })}
          >
            {series.round === 4 ? 'Результат' : series.ready[player] ? 'Ждём соперника' : 'Дальше'}
          </button>
        </div>
      )}
    </div>
  );
}
