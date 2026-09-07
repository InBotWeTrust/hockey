import type { PoolClient } from 'pg';
import { AppError } from '../plugins/errors.js';
import {
  GAMEPLAY_RECOVERY_MINUTES,
  GAMEPLAY_RECOVERY_MS,
  getGameplayLockState,
} from './gameplayLocks.js';

export const DEFAULT_TRAINING_TO_DAILY_COOLDOWN_MINUTES = GAMEPLAY_RECOVERY_MINUTES;
export const DEFAULT_TRAINING_TO_DAILY_COOLDOWN_MS = GAMEPLAY_RECOVERY_MS;

export function trainingDailyCooldownMs(minutes: number): number {
  if (!Number.isFinite(minutes)) return DEFAULT_TRAINING_TO_DAILY_COOLDOWN_MS;
  return Math.max(0, Math.trunc(minutes)) * 60 * 1000;
}

export async function fetchTrainingCooldownEndsAt(
  client: PoolClient,
  userId: string,
  now: Date,
  cooldownMs = DEFAULT_TRAINING_TO_DAILY_COOLDOWN_MS,
): Promise<Date | null> {
  const state = await getGameplayLockState(client, {
    userId,
    action: 'start_daily_period',
    now,
    recoveryMs: cooldownMs,
  });
  return state.reason === 'recent_gameplay' ? state.endsAt : null;
}

export async function assertTrainingCooldownExpired(
  client: PoolClient,
  userId: string,
  now: Date,
  cooldownMs = DEFAULT_TRAINING_TO_DAILY_COOLDOWN_MS,
): Promise<void> {
  const cooldownEndsAt = await fetchTrainingCooldownEndsAt(client, userId, now, cooldownMs);
  if (cooldownEndsAt !== null) {
    throw new AppError('conflict', `daily game locked until ${cooldownEndsAt.toISOString()}`, 409);
  }
}
