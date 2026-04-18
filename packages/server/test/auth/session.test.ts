import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Redis } from 'ioredis';
import { saveRefresh, consumeRefresh, revokeRefresh } from '../../src/auth/session.js';
import { createTestRedis, hasIntegrationEnv, resetRedis } from '../helpers/testDb.js';

describe.skipIf(!hasIntegrationEnv)('refresh session storage', () => {
  let redis: Redis;

  beforeAll(async () => {
    redis = createTestRedis();
    await resetRedis(redis);
  });

  afterAll(async () => {
    redis.disconnect();
  });

  it('saves refresh and consumes it exactly once', async () => {
    await saveRefresh(redis, { jti: 'j-1', userId: 'u-1', ttlSec: 60 });
    const first = await consumeRefresh(redis, 'j-1');
    expect(first).toEqual({ userId: 'u-1' });
    const second = await consumeRefresh(redis, 'j-1');
    expect(second).toBeNull();
  });

  it('respects TTL', async () => {
    await saveRefresh(redis, { jti: 'j-ttl', userId: 'u-1', ttlSec: 1 });
    await new Promise((r) => setTimeout(r, 1500));
    const result = await consumeRefresh(redis, 'j-ttl');
    expect(result).toBeNull();
  });

  it('revokeRefresh removes a pending token', async () => {
    await saveRefresh(redis, { jti: 'j-rev', userId: 'u-1', ttlSec: 60 });
    await revokeRefresh(redis, 'j-rev');
    expect(await consumeRefresh(redis, 'j-rev')).toBeNull();
  });
});
