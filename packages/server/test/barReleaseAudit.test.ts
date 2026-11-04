import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  enabled: false,
  end: vi.fn(async () => undefined),
  release: vi.fn(),
}));
vi.mock('../src/env.js', () => ({ loadDotEnv: vi.fn() }));
vi.mock('../src/config.js', () => ({ loadMigrationConfig: () => ({ DATABASE_URL: 'unused' }) }));
vi.mock('../src/db/pool.js', () => ({ createPool: () => ({
  end: mocks.end,
  connect: async () => ({
    release: mocks.release,
    query: async (sql: string) => ({ rows: sql.includes('select key,value')
      ? [{ key: 'duels.fights.enabled', value: mocks.enabled }]
      : [] }),
  }),
}) }));
vi.mock('../src/bar/games/ochkoDeck.js', () => ({
  createPrivateOchko: () => ({ series: { totalRounds: 5 } }),
}));

beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });
afterEach(() => { process.exitCode = 0; vi.restoreAllMocks(); });

it.each([false, true])('release audit accepts disabled duel fights only (enabled=%s)', async (enabled) => {
  mocks.enabled = enabled;
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  await import('../src/ops/barReleaseAuditCli.js');
  await vi.waitFor(() => expect(mocks.end).toHaveBeenCalledOnce());
  await vi.waitFor(() => expect(error.mock.calls.length).toBe(enabled ? 1 : 0));
  expect(mocks.release).toHaveBeenCalledOnce();
});
