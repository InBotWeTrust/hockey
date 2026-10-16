import type { CSSProperties } from 'react';
import type { BarGameAction, barArmwrestling } from '@hockey/game-core';

import { ArmScene } from './ArmScene.js';
import { useArmControls } from './useArmControls.js';
export function ArmwrestlingField({
  game,
  player,
  now,
  disabled,
  pregame,
  character = true,
  send,
}: {
  game: barArmwrestling.ArmState;
  player: 0 | 1;
  now: number;
  disabled: boolean;
  pregame: boolean;
  character?: boolean;
  send: (a: BarGameAction) => void;
}) {
  const c = useArmControls({
    seq: game.lastSeq[player],
    disabled: disabled || pregame || game.winner !== null,
    send,
  });
  const other = player === 0 ? 1 : 0;

  const pressing = c.input.pressing && !disabled;
  const wrist = { straight: 'Прямо', inside: 'Внутрь', outside: 'Наружу' }[c.input.wrist];
  return (
    <div className="bar-arm-field" data-pressing={pressing}>
      <div className="bar-arm-stamina">
        {([player, other] as const).map((p, i) => (
          <label key={p}>
            {i === 0 ? 'Твоя выносливость' : 'Соперник'}
            <meter
              role="meter"
              min={0}
              max={1}
              value={game.stamina[p]}
              aria-label={i === 0 ? 'Твоя выносливость' : 'Выносливость соперника'}
            />
          </label>
        ))}
      </div>
      <ArmScene
        progress={game.progress}
        player={player}
        supportHeld={c.input.supportHeld}
        character={character}
      />
      {!pregame && game.winner === null && (
        <div className="bar-arm-controls">
          <button
            className="bar-arm-support"
            aria-label="Опора свободной руки"
            disabled={disabled}
            {...c.supportHandlers}
            style={{ '--support': c.input.support } as CSSProperties}
          >
            <span className="bar-arm-support__handle" data-held={c.input.supportHeld} />
            <strong>Опора</strong>
            <small>Удерживай · тяни вверх</small>
          </button>
          <button
            className="bar-arm-pressure"
            aria-label="Давление и кисть"
            disabled={disabled}
            {...c.pressureHandlers}
            data-held={pressing}
          >
            <strong>{pressing ? 'Давишь' : 'Зажми и дави'}</strong>
            <span className="bar-arm-wrist" data-wrist={c.input.wrist}>
              ‹ <b>{wrist}</b> ›
            </span>
            <small>Кисть – движением в стороны</small>
          </button>
        </div>
      )}
      {!pregame && game.warning[player] && now < game.endsAt && (
        <span className="sr-only">Вернись к управлению, иначе поражение</span>
      )}
    </div>
  );
}
