import type { Redis } from 'ioredis';

const key = (jti: string) => `refresh:${jti}`;

export interface SaveRefreshInput {
  jti: string;
  userId: string;
  ttlSec: number;
}

export async function saveRefresh(redis: Redis, input: SaveRefreshInput): Promise<void> {
  await redis.set(key(input.jti), input.userId, 'EX', input.ttlSec);
}

export async function consumeRefresh(
  redis: Redis,
  jti: string,
): Promise<{ userId: string } | null> {
  const userId = await redis.getdel(key(jti));
  return userId ? { userId } : null;
}

export async function revokeRefresh(redis: Redis, jti: string): Promise<void> {
  await redis.del(key(jti));
}
