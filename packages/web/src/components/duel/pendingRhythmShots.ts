import type { RhythmShot } from '@hockey/game-core';

/** Server history wins; retain every still-local predecessor until it is confirmed. */
export function mergePendingRhythmShots<T extends RhythmShot>(
  confirmed: readonly T[],
  pending: readonly (T & { index: number })[],
  visibleCount: number,
): T[] {
  const result: T[] = [];
  for (let index = 1; index <= visibleCount; index++) {
    const shot = confirmed[index - 1] ?? pending.find((candidate) => candidate.index === index);
    if (!shot) break;
    result.push(shot);
  }
  return result;
}
