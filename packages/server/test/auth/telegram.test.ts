import { describe, it, expect } from 'vitest';
import { createHash, createHmac } from 'node:crypto';
import { verifyTelegramLoginPayload } from '../../src/auth/telegram.js';

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
