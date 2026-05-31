import type { Pool, PoolClient } from 'pg';
import { completeAchievements } from './service.js';

type Queryable = Pool | PoolClient;
type ShotResult = 'goal' | 'save' | 'miss';

export interface AchievementShotEvent {
  userId: string;
  mode: 'daily' | 'training' | 'duel';
  ownerId?: string;
  containerId: string;
  periodNumber: number;
  shotIndex: number;
  result: ShotResult;
}

export async function evaluateShotAchievements(
  db: Queryable,
  event: AchievementShotEvent,
): Promise<void> {
  const ids: string[] = [];
  if (event.result === 'goal') ids.push('first-goal');
  await completeAchievements(db, event.userId, ids, { ...event });
}
