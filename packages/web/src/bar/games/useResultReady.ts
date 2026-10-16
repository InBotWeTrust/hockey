import { useRef } from 'react';

// Reveal the opponent's cards, then leave both hands readable before covering the table.
export function useResultReady(
  id: string | undefined,
  kind: string | undefined,
  finished: boolean,
  now: number,
  animationUntil: number,
) {
  const reveal = useRef<{ id: string | undefined; at: number } | null>(null);
  if (!finished || reveal.current?.id !== id) reveal.current = null;
  if (finished && !reveal.current) {
    reveal.current = { id, at: Math.max(now, animationUntil) };
  }
  return finished && now >= (kind === 'ochko' ? reveal.current!.at + 5600 : animationUntil);
}

export function useOchkoReveal(finished: boolean, now: number, dealUntil: number, delay = 1000) {
  const at = useRef<number | null>(null);
  if (!finished) at.current = null;
  if (finished && at.current === null) at.current = Math.max(now, dealUntil) + delay;
  return finished && now >= at.current!;
}
