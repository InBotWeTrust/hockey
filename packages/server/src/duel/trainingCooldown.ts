import type { PoolClient } from 'pg';
import { AppError } from '../plugins/errors.js';

export const DEFAULT_TRAINING_TO_DAILY_COOLDOWN_MINUTES = 120;
export const DEFAULT_TRAINING_TO_DAILY_COOLDOWN_MS =
  DEFAULT_TRAINING_TO_DAILY_COOLDOWN_MINUTES * 60 * 1000;

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
  if (cooldownMs <= 0) return null;
  const { rows } = await client.query<{ last_training_shot_at: Date | null }>(
    `select max(created_at) as last_training_shot_at
       from shot_session
      where user_id = $1 and mode = 'training'`,
    [userId],
  );
  const lastTrainingShotAt = rows[0]?.last_training_shot_at ?? null;
  if (lastTrainingShotAt === null) return null;

  const cooldownEndsAt = new Date(lastTrainingShotAt.getTime() + cooldownMs);
  return cooldownEndsAt.getTime() > now.getTime() ? cooldownEndsAt : null;
}

export async function assertTrainingCooldownExpired(
  client: PoolClient,
  userId: string,
  now: Date,
  cooldownMs = DEFAULT_TRAINING_TO_DAILY_COOLDOWN_MS,
): Promise<void> {
  const cooldownEndsAt = await fetchTrainingCooldownEndsAt(client, userId, now, cooldownMs);
  if (cooldownEndsAt !== null) {
    throw new AppError(
      'conflict',
      `daily game locked until ${cooldownEndsAt.toISOString()}`,
      409,
    );
  }
}
