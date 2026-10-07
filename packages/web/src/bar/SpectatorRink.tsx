import { useEffect, useState } from 'react';
import type { BarPlayer, BarShot } from './types.js';
import type { ReplayBuffer } from './replay.js';

export function playerStatus(player: BarPlayer): string {
  if (player.state === 'break_active') return 'Перерыв';
  if (['completed', 'forfeit'].includes(player.state)) return 'Закончил игру';
  if (player.state === 'paused') return 'Игра приостановлена';
  if (player.state === 'period_active') return `Период ${player.period}`;
  return 'Ожидает продолжения';
}
const outcome = { goal: 'Гол!', save: 'Сейв', miss: 'Мимо' };
export function SpectatorRink({
  player,
  buffer,
}: {
  player: BarPlayer;
  buffer: ReplayBuffer;
}): JSX.Element {
  const [shot, setShot] = useState<BarShot | null>(null);
  useEffect(() => {
    const play = () => setShot(buffer.take(player.userId));
    play();
    const timer = setInterval(play, 1300);
    return () => clearInterval(timer);
  }, [buffer, player.userId]);
  const shooterX = shot?.shooterX ?? 286;
  const goalX = shot?.goalX ?? 286;
  const goalieX = shot?.goalieX ?? 286;
  const puckEnd = shot?.result === 'save' ? 300 : 265;
  const facing = player.grip === 'left' ? 'left' : 'right';
  return (
    <section className="bar-rink-panel" aria-label={`Площадка: ${player.name}`}>
      <header className="bar-rink-header">
        <strong>{player.name}</strong>
        <b>{player.goals}</b>
      </header>
      <div className="bar-rink">
        <svg
          viewBox="0 0 572 700"
          role="img"
          aria-label={shot ? `Бросок ${shot.index}: ${outcome[shot.result]}` : playerStatus(player)}
        >
          <image
            href="/sprites/new-light-court.webp"
            width="572"
            height="700"
            preserveAspectRatio="xMidYMid slice"
          />
          <image href="/sprites/gate.webp" x={goalX - 92} y="183" width="184" height="110" />
          <image
            href={shot?.result === 'save' ? '/sprites/save.webp' : '/sprites/goalkeeper.webp'}
            x={goalieX - 48}
            y="241"
            width="96"
            height="103"
          />
          <image
            href={`/sprites/ultimate-player-${facing}${shot ? '-shoot' : ''}.webp`}
            x={shooterX - 64}
            y="484"
            width="128"
            height="155"
          />
          {shot && (
            <g key={shot.id} className="bar-shot-motion">
              <ellipse cx={shooterX} cy="592" rx="9" ry="5" fill="#15212d">
                <animate
                  attributeName="cy"
                  from="592"
                  to={String(puckEnd)}
                  dur="0.65s"
                  fill="freeze"
                />
                <animate
                  attributeName="opacity"
                  values="1;1;0"
                  keyTimes="0;0.75;1"
                  dur="1.2s"
                  fill="freeze"
                />
              </ellipse>
            </g>
          )}
        </svg>
        <div
          className={`bar-rink-notice${shot?.result === 'goal' ? ' bar-rink-notice--goal' : ''}`}
        >
          {shot ? outcome[shot.result] : playerStatus(player)}
        </div>
      </div>
      <p className="bar-rink-status">{playerStatus(player)}</p>
    </section>
  );
}
