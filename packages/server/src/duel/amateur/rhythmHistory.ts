import type { createRhythmMovementSampler } from '@hockey/game-core';
import { setImmediate } from 'node:timers/promises';

type Sampler = Pick<ReturnType<typeof createRhythmMovementSampler>, 'motionAt'>;
type Pauses = Parameters<Sampler['motionAt']>[1];

export async function warmRhythmHistory(sampler: Sampler, sceneMs: number, pauses: Pauses): Promise<void> {
  const end = Math.min(150_000, Math.max(0, sceneMs));
  // The pure sampler integrates at 10ms steps. Keep the same samples/results,
  // but let live gameplay requests run between historical catch-up batches.
  for (let time = 0; time < end; time += 5000) {
    await setImmediate();
    sampler.motionAt(Math.min(time + 5000, end), pauses);
  }
}
