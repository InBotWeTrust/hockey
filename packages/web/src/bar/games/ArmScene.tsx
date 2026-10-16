import type { CSSProperties } from 'react';
export function ArmScene({
  progress,
  player,
  supportHeld,
  character,
  stamina = 1,
}: {
  progress: number;
  player: 0 | 1;
  supportHeld: boolean;
  character: boolean;
  stamina?: number;
}) {
  const advantage = Math.max(-1, Math.min(1, progress * (player === 0 ? 1 : -1)));
  const fatigue = 1 - Math.max(0, Math.min(1, stamina));
  return (
    <div className="bar-arm-static-scene">
      <svg
        className="bar-arm-scene"
        viewBox={character ? '0 0 1024 1536' : '0 500 1024 1036'}
        preserveAspectRatio="xMidYMid slice"
        role="img"
        aria-label="Сцепленные правые руки, левые руки держат опоры"
      >
        <image href="/bar/games/arm-coherent-neutral-v2.webp" width="1024" height="1536" />
        <circle
          className="bar-arm-grip-pulse"
          data-support-held={supportHeld}
          style={{
            '--grip-duration': `${1200 - fatigue * 900}ms`,
            '--grip-opacity': .16 + fatigue * .29,
            '--grip-scale': 1.01 + fatigue * .09,
          } as CSSProperties}
          cx="105" cy="1115" r="84"
          fill="none" stroke="currentColor" strokeWidth="7"
        />
      </svg>
      <div className="bar-arm-progress" role="meter" aria-label="Ход борьбы"
        aria-valuemin={-1} aria-valuemax={1} aria-valuenow={advantage}
        aria-valuetext={advantage > 0 ? 'Твоё преимущество' : advantage < 0 ? 'Преимущество соперника' : 'Равная борьба'}>
        <span className="bar-arm-progress__rail" />
        <span className="bar-arm-progress__center" />
        <span className="bar-arm-progress__marker" data-arm-marker style={{left:`${50 - advantage * 45}%`}} />
      </div>
    </div>
  );
}
