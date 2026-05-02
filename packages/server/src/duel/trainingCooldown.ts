import type { PoolClient } from 'pg';
import { AppError } from '../plugins/errors.js';

export const TRAINING_TO_DAILY_COOLDOWN_MS = 2 * 60 * 60 * 1000;

export async function fetchTrainingCooldownEndsAt(
  client: PoolClient,
  userId: string,
  now: Date,
): Promise<Date | null> {
  const { rows } = await client.query<{ last_training_shot_at: Date | null }>(
    `select max(created_at) as last_training_shot_at
       from shot_session
      where user_id = $1 and mode = 'training'`,
    [userId],
  );
  const lastTrainingShotAt = rows[0]?.last_training_shot_at ?? null;
  if (lastTrainingShotAt === null) return null;

  const cooldownEndsAt = new Date(
    lastTrainingShotAt.getTime() + TRAINING_TO_DAILY_COOLDOWN_MS,
  );
  return cooldownEndsAt.getTime() > now.getTime() ? cooldownEndsAt : null;
}

export async function assertTrainingCooldownExpired(
  client: PoolClient,
  userId: string,
  now: Date,
): Promise<void> {
  const cooldownEndsAt = await fetchTrainingCooldownEndsAt(client, userId, now);
  if (cooldownEndsAt !== null) {
    throw new AppError(
      'conflict',
      `daily game locked until ${cooldownEndsAt.toISOString()}`,
      409,
    );
  }
}
