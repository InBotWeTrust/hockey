import { describe, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { createYooKassaClient } from '../../src/payments/yookassaClient.js';

const localPaymentId = 'e23f5304-0908-4bbc-8c97-4874fcf39187';

function paymentResponse(overrides: Record<string, unknown> = {}): Response {
  return new Response(
    JSON.stringify({
      id: '2f8a85c3-000f-5000-8000-1b68b53613a8',
      status: 'pending',
      amount: { value: '299.00', currency: 'RUB' },
      metadata: { local_payment_id: localPaymentId },
      confirmation: { type: 'redirect', confirmation_url: 'https://yookassa.test/confirm' },
      ...overrides,
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

function buildClient(fetchImpl: typeof fetch) {
  return createYooKassaClient({
    shopId: '1463027',
    secretKey: 'test-secret',
    returnUrl: 'https://dev.hockey.inbotwetrust.ru/inventory?tab=bank',
    fetchImpl,
  });
}

describe('YooKassa client', () => {
  it.each(['headers', 'body'])('aborts a real HTTP request stalled during %s', async (phase) => {
    let connectionClosed = false;
    let requestSignal: AbortSignal | null | undefined;
    const server = createServer((_request, response) => {
      response.on('close', () => {
        connectionClosed = true;
      });
      if (phase === 'body') {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.write('{"id":');
      }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('missing test server address');
    const client = createYooKassaClient({
      shopId: 'fixture-shop',
      secretKey: 'fixture-secret',
      returnUrl: 'https://example.test/return',
      requestTimeoutMs: 100,
      fetchImpl: (_url, init) => {
        requestSignal = init?.signal;
        return fetch(`http://127.0.0.1:${address.port}`, init);
      },
    });
    const result = client.getPayment('fixture-payment').catch((error) => error as Error);
    try {
      await delay(250);
      expect(requestSignal?.aborted).toBe(true);
      expect(connectionClosed).toBe(true);
      await expect(result).resolves.toEqual(new Error('yookassa_request_failed'));
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      await result;
    }
  });

  it('creates a redirect payment with the local payment metadata and idempotency key', async () => {
    const fetchMock = vi.fn(async () => paymentResponse()) as unknown as typeof fetch;
    const client = buildClient(fetchMock);

    await expect(
      client.createPayment(
        { amountRub: 299, description: 'Малый запас', localPaymentId },
        'attempt-id',
      ),
    ).resolves.toMatchObject({
      id: '2f8a85c3-000f-5000-8000-1b68b53613a8',
      confirmation: { confirmationUrl: 'https://yookassa.test/confirm' },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.yookassa.ru/v3/payments',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'Idempotence-Key': 'attempt-id',
          Authorization: `Basic ${Buffer.from('1463027:test-secret').toString('base64')}`,
        }),
      }),
    );
    const request = fetchMock.mock.calls[0]?.[1];
    expect(JSON.parse(String(request?.body))).toEqual({
      amount: { value: '299.00', currency: 'RUB' },
      capture: true,
      confirmation: {
        type: 'redirect',
        return_url: 'https://dev.hockey.inbotwetrust.ru/inventory?tab=bank',
      },
      description: 'Малый запас',
      metadata: { local_payment_id: localPaymentId },
    });
  });

  it('gets a payment through the authenticated provider endpoint', async () => {
    const fetchMock = vi.fn(async () =>
      paymentResponse({ status: 'succeeded' }),
    ) as unknown as typeof fetch;
    const client = buildClient(fetchMock);

    await expect(client.getPayment('provider-payment-id')).resolves.toMatchObject({
      id: '2f8a85c3-000f-5000-8000-1b68b53613a8',
      status: 'succeeded',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.yookassa.ru/v3/payments/provider-payment-id',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: `Basic ${Buffer.from('1463027:test-secret').toString('base64')}`,
        }),
      }),
    );
  });

  it('translates provider failures without exposing provider response details', async () => {
    const fetchMock = vi.fn(
      async () => new Response('secret provider diagnostic', { status: 401 }),
    ) as unknown as typeof fetch;
    const client = buildClient(fetchMock);

    await expect(client.getPayment('provider-payment-id')).rejects.toThrow(
      'yookassa_request_failed',
    );
    await expect(client.getPayment('provider-payment-id')).rejects.not.toThrow(
      'secret provider diagnostic',
    );
  });
});
