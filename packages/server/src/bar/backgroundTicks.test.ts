import Fastify from 'fastify';
import type * as DurakService from './durakService.js';
import type * as BarGameService from './games/service.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { durakRoutes } from './durakRoutes.js';
import { barGameRoutes } from './games/routes.js';
import { tickCardMatches } from './durakService.js';
import { tickGames } from './games/service.js';

vi.mock('./durakService.js', async (original) => ({
  ...await original<typeof DurakService>(),
  tickCardMatches: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./games/service.js', async (original) => ({
  ...await original<typeof BarGameService>(),
  tickGames: vi.fn().mockResolvedValue(undefined),
}));
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe.each([
  { name: 'cards', plugin: durakRoutes, tick: tickCardMatches },
  { name: 'bar games', plugin: barGameRoutes, tick: tickGames },
])('$name background ticks', ({ plugin, tick }) => {
  it.each([false, true, undefined])('honors backgroundTicksEnabled=%s and stops on close', async (enabled) => {
    vi.useFakeTimers();
    const app = Fastify();
    app.decorate('authenticate', async () => {});
    await app.register(plugin, enabled === undefined ? {} : { backgroundTicksEnabled: enabled });
    await app.ready();
    try {
      await vi.advanceTimersByTimeAsync(1000);
      expect(tick).toHaveBeenCalledTimes(enabled === false ? 0 : 1);
    } finally {
      await app.close();
    }
    const calls = vi.mocked(tick).mock.calls.length;
    await vi.advanceTimersByTimeAsync(2000);
    expect(tick).toHaveBeenCalledTimes(calls);
  });
});
