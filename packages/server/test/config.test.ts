import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.js';

const base = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgres://u:p@localhost:5432/hockey',
  REDIS_URL: 'redis://localhost:6379',
  JWT_SECRET: 'dev-jwt-secret-that-is-long-enough',
  REFRESH_SECRET: 'dev-refresh-secret-long-enough-too',
  TELEGRAM_BOT_TOKEN: '123456:placeholder-bot-token',
  DAILY_SEED_SECRET: 'daily-seed-secret-long-enough!!',
};

describe('loadConfig', () => {
  it('requires DATABASE_URL and REDIS_URL', () => {
    expect(() => loadConfig({ NODE_ENV: 'development' })).toThrow();
  });

  it('requires JWT_SECRET (min 16 chars)', () => {
    expect(() => loadConfig({ ...base, JWT_SECRET: 'short' })).toThrow();
    const { JWT_SECRET: _omit, ...rest } = base;
    expect(() => loadConfig(rest)).toThrow();
  });

  it('requires REFRESH_SECRET (min 16 chars) and TELEGRAM_BOT_TOKEN', () => {
    const { REFRESH_SECRET: _r, ...rest1 } = base;
    expect(() => loadConfig(rest1)).toThrow();
    const { TELEGRAM_BOT_TOKEN: _t, ...rest2 } = base;
    expect(() => loadConfig(rest2)).toThrow();
  });

  it('parses valid env', () => {
    const cfg = loadConfig(base);
    expect(cfg.DATABASE_URL).toBe(base.DATABASE_URL);
    expect(cfg.JWT_SECRET).toBe(base.JWT_SECRET);
    expect(cfg.TELEGRAM_BOT_TOKEN).toBe(base.TELEGRAM_BOT_TOKEN);
    expect(cfg.PORT).toBe(3000);
  });

  it('treats VK_APP_ID as optional and normalizes blank value', () => {
    expect(loadConfig({ ...base, VK_APP_ID: '' }).VK_APP_ID).toBeUndefined();
    expect(loadConfig({ ...base, VK_APP_ID: '777' }).VK_APP_ID).toBe('777');
  });

  it('treats account recovery allowlist as optional and normalizes blank value', () => {
    expect(
      loadConfig({ ...base, ACCOUNT_RECOVERY_TELEGRAM_PROVIDER_UIDS: '' })
        .ACCOUNT_RECOVERY_TELEGRAM_PROVIDER_UIDS,
    ).toBeUndefined();
    expect(
      loadConfig({ ...base, ACCOUNT_RECOVERY_TELEGRAM_PROVIDER_UIDS: '42,100500' })
        .ACCOUNT_RECOVERY_TELEGRAM_PROVIDER_UIDS,
    ).toBe('42,100500');
  });
});
