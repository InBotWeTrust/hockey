import type { Pool, PoolClient } from 'pg';
import { OPEN_WINDOW_STEPS, type OpenWindowStepKey } from '@hockey/game-core';

type Queryable = Pool | PoolClient;

export async function fetchOpenWindowCompletions(db: Queryable,
  userId: string): Promise<Set<OpenWindowStepKey>> {
  const { rows } = await db.query<{ step_key: OpenWindowStepKey }>(
    'select step_key from open_window_training_completion where user_id = $1', [userId]);
  return new Set(rows.map((row) => row.step_key));
}

export function buildOpenWindowCatalog(completed: ReadonlySet<OpenWindowStepKey>,
  unlocked: boolean) {
  let nextAvailable = false;
  const steps = OPEN_WINDOW_STEPS.map((step, index) => {
    const done = completed.has(step.key);
    const available = unlocked && !done && !nextAvailable;
    if (available) nextAvailable = true;
    return {
      key: step.key,
      stage: step.stage,
      position: index + 1,
      title: step.title,
      description: step.objective,
      skill: step.stage,
      goal: step.objective,
      rewardStars: index % 3 === 2 ? 1 : 0,
      rewardExperience: index % 3 === 2 ? 1 : 0,
      state: done ? 'completed' as const : available ? 'available' as const : 'locked' as const,
    };
  });
  return { completed_count: completed.size, total_count: OPEN_WINDOW_STEPS.length, steps };
}

export function parseOpenWindowStepKey(value: string): OpenWindowStepKey | null {
  return OPEN_WINDOW_STEPS.find((step) => step.key === value)?.key ?? null;
}
