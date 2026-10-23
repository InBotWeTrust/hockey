import { ProxyAgent } from 'undici';

/** Per-service CONNECT tunnel; never changes the global dispatcher or target headers. */
export function createServiceProxyFetch(
  origin: string,
  proxyUrl: string | undefined,
  transport: typeof fetch = fetch,
): { fetcher: typeof fetch; close: () => Promise<void> } {
  if (!proxyUrl) return { fetcher: transport, close: async () => undefined };
  let uri: string, token: string | undefined;
  try {
    const proxy = new URL(proxyUrl);
    if (!['http:', 'https:'].includes(proxy.protocol)) throw new Error('unsupported protocol');
    if (proxy.username || proxy.password)
      token =
        'Basic ' +
        Buffer.from(
          `${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`,
        ).toString('base64');
    proxy.username = '';
    proxy.password = '';
    uri = proxy.toString();
  } catch {
    throw new Error('invalid_service_proxy_url');
  }
  const agent = new ProxyAgent({ uri, ...(token ? { token } : {}) });
  const fetcher: typeof fetch = (input, init) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    );
    if (url.origin !== origin) return transport(input, init);
    // Node's bundled undici declarations can lag the compatible external dispatcher API.
    const options = { ...init, dispatcher: agent } as unknown as NonNullable<
      Parameters<typeof fetch>[1]
    >;
    return transport(input, options);
  };
  return { fetcher, close: () => agent.close() };
}
