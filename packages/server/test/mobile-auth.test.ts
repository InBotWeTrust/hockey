import { createHash } from 'node:crypto';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { errorsPlugin } from '../src/plugins/errors.js';
import { mobileAuthRoutes } from '../src/routes/mobileAuth.js';
import { completeMobileAuthAttempt, type MobileAuthRedis } from '../src/auth/mobileHandoff.js';

const VERIFIER = 'route-verifier-with-at-least-forty-three-characters-12345';
const CHALLENGE = createHash('sha256').update(VERIFIER).digest('base64url');

class MemoryRedis implements MobileAuthRedis {
  readonly values = new Map<string, string>();
  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }
  async set(key: string, value: string): Promise<'OK'> {
    this.values.set(key, value);
    return 'OK';
  }
  async setex(key: string, _seconds: number, value: string): Promise<'OK'> {
    this.values.set(key, value);
    return 'OK';
  }
  async getdel(key: string): Promise<string | null> {
    const value = this.values.get(key) ?? null;
    this.values.delete(key);
    return value;
  }
  async eval(script: string, _keyCount: number, ...args: Array<string | number>): Promise<unknown> {
    const values = args.map(String);
    if (script.includes('complete-mobile-auth')) {
      const [attemptKey, handoffKey, userId] = values;
      const attempt = this.values.get(attemptKey!);
      if (!attempt) return ['missing'];
      this.values.delete(attemptKey!);
      const parsed = JSON.parse(attempt) as { codeChallenge: string; provider: string };
      this.values.set(handoffKey!, JSON.stringify({ ...parsed, userId }));
      return ['ok'];
    }
    const [handoffKey, usedKey, challenge] = values;
    if (this.values.has(usedKey!)) return ['used'];
    const raw = this.values.get(handoffKey!);
    if (!raw) return ['missing'];
    const handoff = JSON.parse(raw) as { codeChallenge: string; userId: string };
    if (handoff.codeChallenge !== challenge) return ['wrong'];
    this.values.delete(handoffKey!);
    this.values.set(usedKey!, '1');
    return ['ok', handoff.userId];
  }
}

async function buildTestApp() {
  const app = Fastify();
  const redis = new MemoryRedis();
  app.decorate('redis', redis as never);
  app.decorate('pg', {
    query: async () => ({
      rows: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          display_name: 'Игрок',
          role: 'player',
          grip: 'right',
          avatar_url: null,
          display_source: 'telegram',
          blocked_at: null,
        },
      ],
    }),
  } as never);
  await app.register(errorsPlugin);
  await app.register(mobileAuthRoutes, {
    accessSecret: 'access-secret-at-least-16-chars',
    refreshSecret: 'refresh-secret-at-least-16-chars',
    telegramBotToken: '111:test-bot-token',
    vkAppId: '777',
  });
  return { app, redis };
}

describe('mobile auth HTTP contract', () => {
  it('creates a provider-bound PKCE attempt', async () => {
    const { app } = await buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/mobile/auth/attempt',
      payload: { provider: 'telegram', codeChallenge: CHALLENGE },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      attemptId: expect.any(String),
      expiresAt: expect.any(String),
    });
    await app.close();
  });

  it('exchanges a completed handoff once and issues the normal session shape', async () => {
    const { app, redis } = await buildTestApp();
    const attempt = await app.inject({
      method: 'POST',
      url: '/mobile/auth/attempt',
      payload: { provider: 'telegram', codeChallenge: CHALLENGE },
    });
    const { attemptId } = attempt.json() as { attemptId: string };
    const complete = await completeMobileAuthAttempt(redis, {
      attemptId,
      userId: '11111111-1111-4111-8111-111111111111',
      provider: 'telegram',
    });
    const { handoffCode } = complete;

    const first = await app.inject({
      method: 'POST',
      url: '/mobile/auth/exchange',
      payload: { handoffCode, codeVerifier: VERIFIER },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
      user: { id: '11111111-1111-4111-8111-111111111111', displayName: 'Игрок' },
    });
    const second = await app.inject({
      method: 'POST',
      url: '/mobile/auth/exchange',
      payload: { handoffCode, codeVerifier: VERIFIER },
    });
    expect(second.statusCode).toBe(409);
    expect(second.json()).toMatchObject({ error: { code: 'mobile_auth_used' } });
    expect([...redis.values.keys()].some((key) => key.startsWith('refresh:'))).toBe(true);
    await app.close();
  });

  it('starts VK authorization in the system browser with server-owned PKCE', async () => {
    const { app } = await buildTestApp();
    const attempt = await app.inject({
      method: 'POST',
      url: '/mobile/auth/attempt',
      payload: { provider: 'vk', codeChallenge: CHALLENGE },
    });
    const { attemptId } = attempt.json() as { attemptId: string };

    const response = await app.inject({
      method: 'GET',
      url: `/mobile/auth/vk/start?attempt=${encodeURIComponent(attemptId)}`,
    });
    expect(response.statusCode).toBe(302);
    const location = new URL(response.headers.location!);
    expect(location.origin + location.pathname).toBe('https://id.vk.com/authorize');
    expect(location.searchParams.get('client_id')).toBe('777');
    expect(location.searchParams.get('redirect_uri')).toBe(
      'https://ultimatehockey.ru/api/mobile/auth/vk/callback',
    );
    expect(location.searchParams.get('code_challenge_method')).toBe('s256');
    await app.close();
  });

  it('rejects unsigned Telegram completion payloads', async () => {
    const { app } = await buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/mobile/auth/telegram/complete',
      payload: {
        attemptId: 'a'.repeat(43),
        id: 123,
        first_name: 'Egor',
        auth_date: Math.floor(Date.now() / 1000),
        hash: 'invalid',
      },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: 'unauthenticated' } });
    await app.close();
  });
});
