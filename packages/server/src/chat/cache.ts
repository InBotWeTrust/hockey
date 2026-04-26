import type { Redis } from 'ioredis';
import { RateLimitedError } from './errors.js';

const UNREAD_TTL_SECONDS = 10;
const RATE_LIMIT_TTL_SECONDS = 1;
const RATE_LIMIT_MAX = 5; // messages per second per user

const unreadKey = (userId: string) => `chat:unread:${userId}`;
const rateLimitKey = (userId: string) => `chat:rate:${userId}`;

export async function getUnreadFromCache(
  redis: Redis,
  userId: string,
): Promise<Record<string, number> | null> {
  const raw = await redis.get(unreadKey(userId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, number>;
  } catch {
    return null;
  }
}

export async function setUnreadCache(
  redis: Redis,
  userId: string,
  counts: Record<string, number>,
): Promise<void> {
  await redis.set(unreadKey(userId), JSON.stringify(counts), 'EX', UNREAD_TTL_SECONDS);
}

export async function invalidateUnreadCache(redis: Redis, userId: string): Promise<void> {
  await redis.del(unreadKey(userId));
}

export async function checkAndConsumeRateLimit(
  redis: Redis,
  userId: string,
): Promise<void> {
  const key = rateLimitKey(userId);
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, RATE_LIMIT_TTL_SECONDS);
  }
  if (count > RATE_LIMIT_MAX) {
    const ttl = await redis.ttl(key);
    throw new RateLimitedError(ttl > 0 ? ttl : RATE_LIMIT_TTL_SECONDS);
  }
}
