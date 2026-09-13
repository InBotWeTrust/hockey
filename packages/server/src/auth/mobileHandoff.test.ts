import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  completeMobileAuthAttempt,
  consumeMobileAuthHandoff,
  createMobileAuthAttempt,
  type MobileAuthRedis,
} from './mobileHandoff.js';

function challenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

const VERIFIER = 'correct-verifier-with-at-least-forty-three-characters-123';
const WRONG_VERIFIER = 'wrong-verifier-with-at-least-forty-three-characters-456';

class MemoryRedis implements MobileAuthRedis {
  readonly values = new Map<string, string>();
  readonly ttls = new Map<string, number>();

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setex(key: string, seconds: number, value: string): Promise<'OK'> {
    this.values.set(key, value);
    this.ttls.set(key, seconds);
    return 'OK';
  }

  async eval(script: string, _keyCount: number, ...args: Array<string | number>): Promise<unknown> {
    if (script.includes('complete-mobile-auth')) {
      const [attemptKey, handoffKey, userId, ttl] = args.map(String);
      const attempt = this.values.get(attemptKey!);
      if (!attempt) return ['missing'];
      this.values.delete(attemptKey!);
      const parsed = JSON.parse(attempt) as { codeChallenge: string; provider: string };
      this.values.set(
        handoffKey!,
        JSON.stringify({ userId, codeChallenge: parsed.codeChallenge, provider: parsed.provider }),
      );
      this.ttls.set(handoffKey!, Number(ttl));
      return ['ok'];
    }

    const [handoffKey, usedKey, expectedChallenge, ttl] = args.map(String);
    if (this.values.has(usedKey!)) return ['used'];
    const handoff = this.values.get(handoffKey!);
    if (!handoff) return ['missing'];
    const parsed = JSON.parse(handoff) as { userId: string; codeChallenge: string };
    if (parsed.codeChallenge !== expectedChallenge) return ['wrong'];
    this.values.delete(handoffKey!);
    this.values.set(usedKey!, '1');
    this.ttls.set(usedKey!, Number(ttl));
    return ['ok', parsed.userId];
  }
}

describe('mobile authentication handoff', () => {
  it('binds a five-minute attempt to provider and PKCE challenge', async () => {
    const redis = new MemoryRedis();
    const result = await createMobileAuthAttempt(redis, {
      provider: 'vk',
      codeChallenge: challenge('verifier'),
    });

    const key = `mobile-auth:attempt:${result.attemptId}`;
    expect(redis.ttls.get(key)).toBe(300);
    expect(JSON.parse(redis.values.get(key)!)).toMatchObject({
      provider: 'vk',
      codeChallenge: challenge('verifier'),
    });
  });

  it('rejects the wrong verifier without consuming the handoff', async () => {
    const redis = new MemoryRedis();
    const attempt = await createMobileAuthAttempt(redis, {
      provider: 'telegram',
      codeChallenge: challenge(VERIFIER),
    });
    const { handoffCode } = await completeMobileAuthAttempt(redis, {
      attemptId: attempt.attemptId,
      userId: 'user-1',
      provider: 'telegram',
    });

    await expect(
      consumeMobileAuthHandoff(redis, { handoffCode, codeVerifier: WRONG_VERIFIER }),
    ).rejects.toMatchObject({ code: 'mobile_auth_pkce_invalid' });
    await expect(
      consumeMobileAuthHandoff(redis, {
        handoffCode,
        codeVerifier: VERIFIER,
      }),
    ).resolves.toBe('user-1');
  });

  it('allows exactly one successful exchange', async () => {
    const redis = new MemoryRedis();
    const attempt = await createMobileAuthAttempt(redis, {
      provider: 'vk',
      codeChallenge: challenge(VERIFIER),
    });
    const { handoffCode } = await completeMobileAuthAttempt(redis, {
      attemptId: attempt.attemptId,
      userId: 'user-2',
      provider: 'vk',
    });

    await expect(
      consumeMobileAuthHandoff(redis, { handoffCode, codeVerifier: VERIFIER }),
    ).resolves.toBe('user-2');
    await expect(
      consumeMobileAuthHandoff(redis, { handoffCode, codeVerifier: VERIFIER }),
    ).rejects.toMatchObject({ code: 'mobile_auth_used' });
  });

  it('rejects completion through a different provider', async () => {
    const redis = new MemoryRedis();
    const attempt = await createMobileAuthAttempt(redis, {
      provider: 'vk',
      codeChallenge: challenge('verifier'),
    });

    await expect(
      completeMobileAuthAttempt(redis, {
        attemptId: attempt.attemptId,
        userId: 'user-3',
        provider: 'telegram',
      }),
    ).rejects.toMatchObject({ code: 'mobile_auth_provider_mismatch' });
  });
});
