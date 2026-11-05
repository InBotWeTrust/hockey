import Fastify from 'fastify';
import { afterEach, expect, it, vi } from 'vitest';
import { createGameplayRequestTiming } from '../../src/duel/requestTiming.js';
import { AppError, errorsPlugin } from '../../src/plugins/errors.js';

const apps: ReturnType<typeof Fastify>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function fixture() {
  let now = 0;
  const lines: string[] = [];
  const app = Fastify({
    logger: { level: 'warn', stream: { write: (line: string) => lines.push(line) } },
  });
  apps.push(app);
  await app.register(errorsPlugin);
  const timing = createGameplayRequestTiming('amateur_duel_shot', () => now);
  return {
    app,
    timing,
    setTime: (time: number) => {
      now = time;
    },
    logs: () =>
      lines.map((line) => JSON.parse(line)).filter((row) => row.msg === 'slow gameplay request'),
  };
}

it('includes prehandler and response serialization time without exposing credentials or input', async () => {
  const { app, timing, setTime, logs } = await fixture();
  app.post(
    '/shot',
    {
      onRequest: timing.onRequest,
      onResponse: timing.onResponse,
      preHandler: async () => {
        setTime(50);
      },
      onSend: async () => {
        setTime(1500);
      },
    },
    async (req) => {
      const t = timing.forRequest(req);
      t.identify({ matchId: 'match', userId: 'player', shotIndex: 3 });
      t.phase('pool_wait');
      setTime(350);
      t.phase('gameplay_lock');
      setTime(1450);
      t.phase('response');
      return { accepted: true };
    },
  );
  const response = await app.inject({
    method: 'POST',
    url: '/shot',
    headers: { authorization: 'Bearer private-token' },
    payload: { private: 'secret-input' },
  });
  expect(response.json()).toEqual({ accepted: true });
  expect(logs()).toHaveLength(1);
  expect(logs()[0]).toMatchObject({
    operation: 'amateur_duel_shot',
    matchId: 'match',
    userId: 'player',
    shotIndex: 3,
    statusCode: 200,
    totalMs: 1500,
    phasesMs: { request_setup: 50, pool_wait: 300, gameplay_lock: 1100, response: 50 },
  });
  expect(JSON.stringify(logs())).not.toMatch(/private-token|secret-input|authorization/);
});

it.each([999, 1000])('logs only requests taking at least one second (%i ms)', async (duration) => {
  const { app, timing, setTime, logs } = await fixture();
  app.get('/shot', { onRequest: timing.onRequest, onResponse: timing.onResponse }, async () => {
    setTime(duration);
    return { ok: true };
  });
  expect((await app.inject('/shot')).statusCode).toBe(200);
  expect(logs()).toHaveLength(duration >= 1000 ? 1 : 0);
});

it('records a slow authentication failure before the shot handler runs', async () => {
  const { app, timing, setTime, logs } = await fixture();
  const handler = vi.fn(async () => ({ ok: true }));
  app.get(
    '/shot',
    {
      onRequest: timing.onRequest,
      onResponse: timing.onResponse,
      preHandler: async () => {
        setTime(1200);
        throw new AppError('unauthenticated', 'expired', 401);
      },
    },
    handler,
  );
  const response = await app.inject('/shot');
  expect(response.statusCode).toBe(401);
  expect(handler).not.toHaveBeenCalled();
  expect(logs()[0]).toMatchObject({
    statusCode: 401,
    totalMs: 1200,
    phasesMs: { request_setup: 1200 },
  });
});

it('preserves failed shot responses and accounts for rollback separately', async () => {
  const { app, timing, setTime, logs } = await fixture();
  app.get('/shot', { onRequest: timing.onRequest, onResponse: timing.onResponse }, async (req) => {
    const t = timing.forRequest(req);
    t.phase('shot_write');
    setTime(1300);
    t.phase('rollback');
    setTime(1350);
    throw new AppError('conflict', 'shot already confirmed', 409);
  });
  const response = await app.inject('/shot');
  expect(response.json()).toEqual({
    error: { code: 'conflict', message: 'shot already confirmed' },
  });
  expect(logs()[0]).toMatchObject({
    statusCode: 409,
    totalMs: 1350,
    phasesMs: { shot_write: 1300, rollback: 50 },
  });
});

it('keeps concurrent request timings and identifiers independent', async () => {
  const { app, timing, setTime, logs } = await fixture();
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  app.get<{ Params: { id: string } }>(
    '/shot/:id',
    { onRequest: timing.onRequest, onResponse: timing.onResponse },
    async (req) => {
      const t = timing.forRequest(req);
      t.identify({ matchId: req.params.id, userId: req.params.id, shotIndex: 1 });
      t.phase('gameplay_lock');
      if (req.params.id === 'slow') {
        entered();
        await gate;
      } else setTime(300);
      t.phase('response');
      return { ok: true };
    },
  );
  const first = Promise.resolve(app.inject('/shot/slow'));
  await started;
  setTime(200);
  expect((await app.inject('/shot/fast')).statusCode).toBe(200);
  setTime(1600);
  release();
  expect((await first).statusCode).toBe(200);
  expect(logs()).toHaveLength(1);
  expect(logs()[0]).toMatchObject({
    matchId: 'slow',
    totalMs: 1600,
    phasesMs: { gameplay_lock: 1600 },
  });
});

it('accumulates repeated phases and does not fail gameplay when a log sink fails', async () => {
  const { app, timing, setTime } = await fixture();
  const warn = vi.fn(() => {
    throw new Error('log unavailable');
  });
  app.get('/shot', { onRequest: timing.onRequest, onResponse: timing.onResponse }, async (req) => {
    req.log.warn = warn;
    const t = timing.forRequest(req);
    t.phase('simulation');
    setTime(200);
    t.phase('history_read');
    setTime(300);
    t.phase('simulation');
    setTime(1500);
    return { ok: true };
  });
  expect((await app.inject('/shot')).json()).toEqual({ ok: true });
  expect(warn).toHaveBeenCalledWith(
    expect.objectContaining({
      phasesMs: { request_setup: 0, simulation: 1400, history_read: 100 },
    }),
    'slow gameplay request',
  );
});
