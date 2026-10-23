import { afterEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  agents: [] as Array<{ options: unknown; close: ReturnType<typeof vi.fn> }>,
}));
vi.mock('undici', () => ({
  ProxyAgent: class {
    options: unknown;
    close = vi.fn(async () => {});
    constructor(options: unknown) {
      this.options = options;
      state.agents.push(this);
    }
  },
}));
import { createServiceProxyFetch } from '../src/network/serviceProxy.js';
afterEach(() => {
  state.agents.length = 0;
  vi.clearAllMocks();
});
it('keeps direct transport unchanged when no proxy is configured', async () => {
  const base = vi.fn<typeof fetch>().mockResolvedValue(new Response('ok'));
  const proxy = createServiceProxyFetch('https://api.openai.com', undefined, base);
  const init = { method: 'POST' };
  await proxy.fetcher('https://api.openai.com/v1/responses', init);
  expect(base).toHaveBeenCalledWith('https://api.openai.com/v1/responses', init);
  expect(state.agents).toHaveLength(0);
  await proxy.close();
});
it('uses separate agents only for each exact origin and leaves CloseRouter direct', async () => {
  const base = vi.fn<typeof fetch>().mockResolvedValue(new Response('ok'));
  const openai = createServiceProxyFetch(
    'https://api.openai.com',
    'http://alpha:one@127.0.0.1:8101',
    base,
  );
  const weather = createServiceProxyFetch(
    'https://api.weatherapi.com',
    'http://beta:two@127.0.0.1:8102',
    base,
  );
  const controller = new AbortController();
  await openai.fetcher('https://api.openai.com/v1/responses', {
    signal: controller.signal,
    headers: { Authorization: 'Bearer test-key' },
  });
  await weather.fetcher(new URL('https://api.weatherapi.com/v1/current.json'), {});
  await openai.fetcher('https://api.closerouter.dev/v1/chat/completions', { method: 'POST' });
  expect(base.mock.calls[0]![1]).toMatchObject({
    dispatcher: state.agents[0],
    signal: controller.signal,
    headers: { Authorization: 'Bearer test-key' },
  });
  expect(base.mock.calls[1]![1]).toMatchObject({ dispatcher: state.agents[1] });
  expect(base.mock.calls[2]![1]).not.toHaveProperty('dispatcher');
  expect(state.agents[0]!.options).toEqual({
    uri: 'http://127.0.0.1:8101/',
    token: 'Basic ' + Buffer.from('alpha:one').toString('base64'),
  });
  expect(JSON.stringify(base.mock.calls)).not.toContain('Proxy-Authorization');
  await openai.close();
  await weather.close();
  expect(state.agents.every((agent) => agent.close.mock.calls.length === 1)).toBe(true);
});
it('does not match lookalike hosts and does not retry directly when proxy fails', async () => {
  const base = vi.fn<typeof fetch>().mockRejectedValue(new Error('proxy failed'));
  const proxy = createServiceProxyFetch('https://api.openai.com', 'http://127.0.0.1:8101', base);
  await expect(proxy.fetcher('https://api.openai.com/v1/responses')).rejects.toThrow(
    'proxy failed',
  );
  expect(base).toHaveBeenCalledTimes(1);
  base.mockResolvedValue(new Response('ok'));
  await proxy.fetcher('https://api.openai.com.example.org/v1/responses');
  expect(base.mock.calls[1]![1]).toBeUndefined();
  await proxy.close();
});
it('routes Request objects and decodes proxy credentials without exposing them to the target', async () => {
  const base = vi.fn<typeof fetch>().mockResolvedValue(new Response('ok'));
  const proxy = createServiceProxyFetch(
    'https://api.weatherapi.com',
    'http://u%40name:p%3Ass@127.0.0.1:8101',
    base,
  );
  await proxy.fetcher(new Request('https://api.weatherapi.com/v1/search.json'));
  expect(base.mock.calls[0]![1]).toHaveProperty('dispatcher');
  expect(state.agents[0]!.options).toHaveProperty(
    'token',
    'Basic ' + Buffer.from('u@name:p:ss').toString('base64'),
  );
  await proxy.close();
});
