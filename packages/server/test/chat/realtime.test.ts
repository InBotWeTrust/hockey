import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { hasIntegrationEnv, getTestUrls, createTestRedis, resetRedis } from '../helpers/testDb.js';
import { redisPlugin } from '../../src/plugins/redis.js';
import { realtimePlugin } from '../../src/plugins/realtime.js';
import type { ChatEvent } from '../../src/chat/types.js';

function flush(): Promise<void> {
  // Give Redis pub/sub one tick + a small delay to deliver across two clients.
  return new Promise((r) => setTimeout(r, 150));
}

describe.skipIf(!hasIntegrationEnv)('realtime plugin', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const { redisUrl } = getTestUrls();
    const setup = createTestRedis();
    await resetRedis(setup);
    await setup.quit();

    app = Fastify({ logger: false });
    await app.register(redisPlugin, { url: redisUrl });
    await app.register(realtimePlugin);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  const evt: ChatEvent = { type: 'chat:read', chatId: 'c1', userId: 'u1', lastReadAt: '2026-04-26T00:00:00Z' };

  it('subscribe → publish → handler called', async () => {
    const got: ChatEvent[] = [];
    const off = await app.realtime.subscribe('chat:user:u1', (e) => got.push(e));
    await app.realtime.publish('chat:user:u1', evt);
    await flush();
    expect(got).toEqual([evt]);
    await off();
  });

  it('two handlers on the same channel both fire (one Redis SUBSCRIBE under the hood)', async () => {
    const a: ChatEvent[] = [];
    const b: ChatEvent[] = [];
    const offA = await app.realtime.subscribe('chat:user:u2', (e) => a.push(e));
    const offB = await app.realtime.subscribe('chat:user:u2', (e) => b.push(e));
    await app.realtime.publish('chat:user:u2', evt);
    await flush();
    expect(a).toEqual([evt]);
    expect(b).toEqual([evt]);
    await offA();
    await offB();
  });

  it('unsubscribing one of two leaves the other receiving', async () => {
    const a: ChatEvent[] = [];
    const b: ChatEvent[] = [];
    const offA = await app.realtime.subscribe('chat:user:u3', (e) => a.push(e));
    const offB = await app.realtime.subscribe('chat:user:u3', (e) => b.push(e));
    await offA();
    await app.realtime.publish('chat:user:u3', evt);
    await flush();
    expect(a).toEqual([]);
    expect(b).toEqual([evt]);
    await offB();
  });

  it('after the last unsubscribe, a later publish to that channel is a no-op', async () => {
    const a: ChatEvent[] = [];
    const off = await app.realtime.subscribe('chat:user:u4', (e) => a.push(e));
    await off();
    await app.realtime.publish('chat:user:u4', evt);
    await flush();
    expect(a).toEqual([]);
  });

  it('different channels are isolated', async () => {
    const a: ChatEvent[] = [];
    const b: ChatEvent[] = [];
    const offA = await app.realtime.subscribe('chat:user:u5', (e) => a.push(e));
    const offB = await app.realtime.subscribe('chat:system:c5', (e) => b.push(e));
    await app.realtime.publish('chat:user:u5', evt);
    await flush();
    expect(a).toEqual([evt]);
    expect(b).toEqual([]);
    await offA();
    await offB();
  });
});
