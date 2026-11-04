export type CaretakerEquipment = 'shovel' | 'machine';
// The server's random daily seed makes the choice random between breaks, while
// keeping it stable across reloads, retries and devices for the same break.
export function caretakerEquipment(venue: 'yard' | 'stadium', seed: string, period: number): CaretakerEquipment {
  if (venue === 'yard') return 'shovel';
  let hash = 2166136261;
  for (const char of `equipment:${seed}:${period}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 16) % 2 === 0 ? 'shovel' : 'machine';
}
