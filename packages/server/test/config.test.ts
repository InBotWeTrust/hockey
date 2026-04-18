import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('requires DATABASE_URL and REDIS_URL', () => {
    expect(() => loadConfig({ NODE_ENV: 'development' })).toThrow();
  });

  it('parses valid env', () => {
    const cfg = loadConfig({
      NODE_ENV: 'development',
      DATABASE_URL: 'postgres://u:p@localhost:5432/hockey',
      REDIS_URL: 'redis://localhost:6379',
    });
    expect(cfg.DATABASE_URL).toBe('postgres://u:p@localhost:5432/hockey');
    expect(cfg.REDIS_URL).toBe('redis://localhost:6379');
    expect(cfg.PORT).toBe(3000);
  });
});
