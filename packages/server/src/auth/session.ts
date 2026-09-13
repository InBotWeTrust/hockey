import type { Redis } from 'ioredis';

const key = (jti: string) => `refresh:${jti}`;

export interface SaveRefreshInput {
  jti: string;
  userId: string;
  ttlSec: number;
  accessCodeId?: string;
}

export async function saveRefresh(redis: Redis, input: SaveRefreshInput): Promise<void> {
  const stored =
    input.accessCodeId === undefined
      ? input.userId
      : JSON.stringify({ userId: input.userId, accessCodeId: input.accessCodeId });
  await redis.set(
    key(input.jti),
    stored,
    'EX',
    input.ttlSec,
  );
}

export async function consumeRefresh(
  redis: Redis,
  jti: string,
): Promise<{ userId: string; accessCodeId?: string } | null> {
  const stored = await redis.getdel(key(jti));
  if (!stored) return null;
  if (!stored.startsWith('{')) return { userId: stored };
  const parsed = JSON.parse(stored) as { userId?: unknown; accessCodeId?: unknown };
  if (typeof parsed.userId !== 'string') return null;
  return {
    userId: parsed.userId,
    ...(typeof parsed.accessCodeId === 'string' ? { accessCodeId: parsed.accessCodeId } : {}),
  };
}

export async function revokeRefresh(redis: Redis, jti: string): Promise<void> {
  await redis.del(key(jti));
}
