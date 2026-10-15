import { useRef, type CSSProperties } from 'react';
import { checkerPosition, type MovingChecker as Motion } from './checkersMotion.js';
export function MovingChecker({
  motion,
  flipped,
  white,
  id,
}: {
  motion: Motion;
  flipped: boolean;
  white: boolean;
  id: string;
}) {
  const clock = useRef({ id, delay: motion.elapsed });
  if (clock.current.id !== id) clock.current = { id, delay: motion.elapsed };
  const from = checkerPosition(motion.from, flipped),
    to = checkerPosition(motion.to, flipped);
  return (
    <span
      key={id}
      className={`bar-checker bar-checker--moving${white ? ' bar-checker--white' : ''}${motion.capture ? ' bar-checker--jumping' : ''}`}
      aria-label={`${white ? 'Белая' : 'Чёрная'} ${Math.abs(motion.piece) === 2 ? 'дамка' : 'шашка'} движется`}
      style={
        {
          '--checker-from-x': `${from.x}%`,
          '--checker-from-y': `${from.y}%`,
          '--checker-to-x': `${to.x}%`,
          '--checker-to-y': `${to.y}%`,
          animationDuration: `${motion.duration}ms`,
          animationDelay: `-${clock.current.delay}ms`,
        } as CSSProperties
      }
    >
      {Math.abs(motion.piece) === 2 ? '♛' : ''}
    </span>
  );
}
