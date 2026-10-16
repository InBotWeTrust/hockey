import { useId, useState } from 'react';
export const armFrames = [
  'arm-pose-left-pin',
  'arm-pose-left-half',
  'arm-coherent-neutral',
  'arm-pose-right-half',
  'arm-pose-right-pin',
] as const;
export function armFrame(progress: number, player: 0 | 1): number {
  const p = progress * (player === 0 ? 1 : -1);
  return p >= 0.999 ? 0 : p > 0.22 ? 1 : p <= -0.999 ? 4 : p < -0.22 ? 3 : 2;
}
export function ArmScene({
  progress,
  player,
  supportHeld,
  character,
}: {
  progress: number;
  player: 0 | 1;
  supportHeld: boolean;
  character: boolean;
}) {
  const mask = useId(),
    soft = useId();
  const [loaded, setLoaded] = useState<Set<number>>(() => new Set());
  const desired = armFrame(progress, player),
    current = loaded.has(desired) ? desired : 2;
  return (
    <svg
      className="bar-arm-scene"
      viewBox={character ? '0 0 1024 1536' : '0 500 1024 1036'}
      preserveAspectRatio="xMidYMin slice"
      role="img"
      aria-label="Стол для армрестлинга"
      data-direction={progress * (player === 0 ? 1 : -1) > 0 ? 'left' : 'right'}
    >
      <defs>
        <filter id={soft}>
          <feGaussianBlur stdDeviation="2" />
        </filter>
        <mask id={mask}>
          <path
            d="M 0 1015 L 175 1015 L 215 1130 L 140 1270 L 105 1536 L 0 1536 Z"
            fill="white"
            filter={`url(#${soft})`}
          />
        </mask>
      </defs>
      {armFrames.map((frame, index) => (
        <image
          key={frame}
          className="bar-arm-pose"
          href={`/bar/games/${frame}-v1.webp`}
          width="1024"
          height="1536"
          opacity={index === current ? 1 : 0}
          onLoad={() => setLoaded((old) => new Set([...old, index]))}
        />
      ))}
      <image
        className="bar-arm-support-sprite"
        href="/bar/games/arm-coherent-loose-v1.webp"
        width="1024"
        height="1536"
        mask={`url(#${mask})`}
        opacity={supportHeld ? 0 : 1}
      />
    </svg>
  );
}
