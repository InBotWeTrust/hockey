import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, it } from 'vitest';
import { createServiceProxyFetch } from '../src/network/serviceProxy.js';

it('sends proxy auth only in CONNECT and never leaks the target API key to the proxy', async () => {
  const server = createServer();
  const requests: Array<{
    authority: string | undefined;
    proxyAuth: string | undefined;
    targetAuth: string | undefined;
  }> = [];
  server.on('connect', (request, socket) => {
    requests.push({
      authority: request.url,
      proxyAuth: request.headers['proxy-authorization'],
      targetAuth: request.headers.authorization,
    });
    socket.end(
      'HTTP/1.1 407 Proxy Authentication Required\r\nConnection: close\r\nContent-Length: 0\r\n\r\n',
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  const proxy = createServiceProxyFetch(
    'https://api.openai.com',
    `http://test-user:test-pass@127.0.0.1:${port}`,
  );
  try {
    await expect(
      proxy.fetcher('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { Authorization: 'Bearer fake-target-api-key' },
        body: '{}',
        signal: AbortSignal.timeout(3000),
      }),
    ).rejects.toThrow();
    expect(requests).toEqual([
      {
        authority: 'api.openai.com:443',
        proxyAuth: 'Basic ' + Buffer.from('test-user:test-pass').toString('base64'),
        targetAuth: undefined,
      },
    ]);
  } finally {
    await proxy.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
