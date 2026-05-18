import { describe, it, expect } from 'vitest';
import { createHash, createHmac } from 'node:crypto';
import {
  verifyTelegramLoginPayload,
  verifyTelegramMiniAppInitData,
} from '../../src/auth/telegram.js';

const BOT_TOKEN = '123456:AAEhBOKEN';

function signPayload(data: Record<string, string>, botToken: string): string {
  const secretKey = createHash('sha256').update(botToken).digest();
  const checkString = Object.keys(data)
    .filter((k) => k !== 'hash')
    .sort()
    .map((k) => `${k}=${data[k]}`)
    .join('\n');
  return createHmac('sha256', secretKey).update(checkString).digest('hex');
}

function freshPayload(overrides: Partial<Record<string, string>> = {}) {
  const nowSec = Math.floor(Date.now() / 1000);
  const base: Record<string, string> = {
    id: '100500',
    first_name: 'Egor',
    last_name: 'Gumenyuk',
    username: 'egor',
    photo_url: 'https://t.me/i/userpic/320/egor.jpg',
    auth_date: String(nowSec - 30),
    ...overrides,
  };
  base.hash = signPayload(base, BOT_TOKEN);
  return base;
}

function signMiniAppInitData(data: Record<string, string>, botToken: string): string {
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const checkString = Object.keys(data)
    .filter((k) => k !== 'hash')
    .sort()
    .map((k) => `${k}=${data[k]}`)
    .join('\n');
  return createHmac('sha256', secretKey).update(checkString).digest('hex');
}

function freshMiniAppInitData(overrides: Partial<Record<string, string>> = {}): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const data: Record<string, string> = {
    auth_date: String(nowSec - 30),
    query_id: 'AAEtest-query',
    user: JSON.stringify({
      id: 100500,
      first_name: 'Egor',
      last_name: 'Gumenyuk',
      username: 'egor',
      photo_url: 'https://t.me/i/userpic/320/egor.jpg',
      language_code: 'ru',
    }),
    ...overrides,
  };
  data.hash = signMiniAppInitData(data, BOT_TOKEN);
  return new URLSearchParams(data).toString();
}

describe('verifyTelegramLoginPayload', () => {
  it('accepts a valid payload and returns typed user data', () => {
    const payload = freshPayload();
    const result = verifyTelegramLoginPayload(payload, BOT_TOKEN);
    expect(result.id).toBe(100500);
    expect(result.firstName).toBe('Egor');
    expect(result.username).toBe('egor');
    expect(result.authDate).toBeInstanceOf(Date);
  });

  it('rejects tampered payload', () => {
    const payload = freshPayload();
    payload.first_name = 'Mallory';
    expect(() => verifyTelegramLoginPayload(payload, BOT_TOKEN)).toThrow(/hash/i);
  });

  it('rejects payload older than 24h', () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const payload = freshPayload({ auth_date: String(nowSec - 60 * 60 * 25) });
    expect(() => verifyTelegramLoginPayload(payload, BOT_TOKEN)).toThrow(/expired|stale|auth_date/i);
  });

  it('rejects payload with missing hash', () => {
    const payload = freshPayload();
    delete payload.hash;
    expect(() => verifyTelegramLoginPayload(payload, BOT_TOKEN)).toThrow();
  });
});

describe('verifyTelegramMiniAppInitData', () => {
  it('accepts valid Mini App initData and returns typed user data', () => {
    const result = verifyTelegramMiniAppInitData(freshMiniAppInitData(), BOT_TOKEN);

    expect(result.id).toBe(100500);
    expect(result.firstName).toBe('Egor');
    expect(result.lastName).toBe('Gumenyuk');
    expect(result.username).toBe('egor');
    expect(result.photoUrl).toBe('https://t.me/i/userpic/320/egor.jpg');
    expect(result.authDate).toBeInstanceOf(Date);
  });

  it('rejects tampered Mini App initData', () => {
    const initData = freshMiniAppInitData();
    const params = new URLSearchParams(initData);
    params.set(
      'user',
      JSON.stringify({
        id: 100500,
        first_name: 'Mallory',
      }),
    );

    expect(() => verifyTelegramMiniAppInitData(params.toString(), BOT_TOKEN)).toThrow(/hash/i);
  });

  it('rejects stale Mini App initData', () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const initData = freshMiniAppInitData({ auth_date: String(nowSec - 60 * 60 * 25) });

    expect(() => verifyTelegramMiniAppInitData(initData, BOT_TOKEN)).toThrow(
      /expired|stale|auth_date/i,
    );
  });
});
