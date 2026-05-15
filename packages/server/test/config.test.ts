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

function withoutEnvKey(key: keyof typeof base): Record<string, string> {
  const env = { ...base } as Record<string, string>;
  delete env[key];
  return env;
}

describe('loadConfig', () => {
  it('requires DATABASE_URL and REDIS_URL', () => {
    expect(() => loadConfig({ NODE_ENV: 'development' })).toThrow();
  });

  it('requires JWT_SECRET (min 16 chars)', () => {
    expect(() => loadConfig({ ...base, JWT_SECRET: 'short' })).toThrow();
    expect(() => loadConfig(withoutEnvKey('JWT_SECRET'))).toThrow();
  });

  it('requires REFRESH_SECRET (min 16 chars) and TELEGRAM_BOT_TOKEN', () => {
    expect(() => loadConfig(withoutEnvKey('REFRESH_SECRET'))).toThrow();
    expect(() => loadConfig(withoutEnvKey('TELEGRAM_BOT_TOKEN'))).toThrow();
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

  it('treats push VAPID config as optional and normalizes blank values', () => {
    expect(
      loadConfig({ ...base, PUSH_VAPID_PUBLIC_KEY: '' }).PUSH_VAPID_PUBLIC_KEY,
    ).toBeUndefined();
    expect(
      loadConfig({ ...base, PUSH_VAPID_PRIVATE_KEY: '' }).PUSH_VAPID_PRIVATE_KEY,
    ).toBeUndefined();
    expect(loadConfig({ ...base, PUSH_VAPID_SUBJECT: '' }).PUSH_VAPID_SUBJECT).toBeUndefined();
    expect(loadConfig({ ...base, PUSH_VAPID_PUBLIC_KEY: 'public' }).PUSH_VAPID_PUBLIC_KEY).toBe(
      'public',
    );
  });

  it('requires object storage config as a complete group', () => {
    expect(
      loadConfig({ ...base, OBJECT_STORAGE_ENDPOINT: '' }).OBJECT_STORAGE_ENDPOINT,
    ).toBeUndefined();
    expect(() =>
      loadConfig({
        ...base,
        OBJECT_STORAGE_ENDPOINT: 'https://s3.cloud.ru',
        OBJECT_STORAGE_BUCKET: 'bucket',
      }),
    ).toThrow();
    expect(
      loadConfig({
        ...base,
        OBJECT_STORAGE_ENDPOINT: 'https://s3.cloud.ru',
        OBJECT_STORAGE_REGION: 'ru-central-1',
        OBJECT_STORAGE_BUCKET: 'bucket',
        OBJECT_STORAGE_ACCESS_KEY_ID: 'key',
        OBJECT_STORAGE_SECRET_ACCESS_KEY: 'secret',
      }),
    ).toMatchObject({
      OBJECT_STORAGE_ENDPOINT: 'https://s3.cloud.ru',
      OBJECT_STORAGE_REGION: 'ru-central-1',
      OBJECT_STORAGE_BUCKET: 'bucket',
      OBJECT_STORAGE_MAX_UPLOAD_BYTES: 25 * 1024 * 1024,
    });
  });
});
