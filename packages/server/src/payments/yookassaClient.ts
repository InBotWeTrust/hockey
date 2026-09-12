import { Buffer } from 'node:buffer';

const API_URL = 'https://api.yookassa.ru/v3/payments';
const REQUEST_TIMEOUT_MS = 10_000;

type FetchLike = typeof fetch;

export interface CreateYooKassaPaymentInput {
  amountRub: number;
  description: string;
  localPaymentId: string;
}

export interface YooKassaPaymentAmount {
  value: string;
  currency: string;
}

export interface YooKassaPaymentConfirmation {
  type: string;
  confirmationUrl?: string;
}

export interface YooKassaPayment {
  id: string;
  status: string;
  amount: YooKassaPaymentAmount;
  metadata: Record<string, string>;
  confirmation?: YooKassaPaymentConfirmation;
}

export interface YooKassaClient {
  createPayment(
    input: CreateYooKassaPaymentInput,
    idempotencyKey: string,
  ): Promise<YooKassaPayment>;
  getPayment(providerPaymentId: string): Promise<YooKassaPayment>;
}

export interface CreateYooKassaClientOptions {
  shopId: string;
  secretKey: string;
  returnUrl: string;
  fetchImpl?: FetchLike;
  requestTimeoutMs?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) throw new Error('yookassa_request_failed');
  return value;
}

function parsePayment(value: unknown): YooKassaPayment {
  if (!isRecord(value) || !isRecord(value.amount)) throw new Error('yookassa_request_failed');

  const payment: YooKassaPayment = {
    id: requiredString(value, 'id'),
    status: requiredString(value, 'status'),
    amount: {
      value: requiredString(value.amount, 'value'),
      currency: requiredString(value.amount, 'currency'),
    },
    metadata: {},
  };

  if (isRecord(value.metadata)) {
    for (const [key, metadataValue] of Object.entries(value.metadata)) {
      if (typeof metadataValue === 'string') payment.metadata[key] = metadataValue;
    }
  }

  if (isRecord(value.confirmation)) {
    const confirmation: YooKassaPaymentConfirmation = {
      type: requiredString(value.confirmation, 'type'),
    };
    const confirmationUrl = value.confirmation.confirmation_url;
    if (typeof confirmationUrl === 'string' && confirmationUrl.length > 0) {
      confirmation.confirmationUrl = confirmationUrl;
    }
    payment.confirmation = confirmation;
  }

  return payment;
}

export function createYooKassaClient(options: CreateYooKassaClientOptions): YooKassaClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const authorization = `Basic ${Buffer.from(`${options.shopId}:${options.secretKey}`).toString('base64')}`;

  async function request(url: string, init: RequestInit): Promise<YooKassaPayment> {
    const controller = new AbortController();
    // Keep one deadline active through response.json(): headers alone do not
    // complete a request, and an unfinished body must not retain a payment lock.
    const timeout = setTimeout(
      () => controller.abort(),
      options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS,
    );
    try {
      const response = await fetchImpl(url, { ...init, signal: controller.signal });
      if (!response.ok) throw new Error('yookassa_request_failed');
      return parsePayment(await response.json());
    } catch (error) {
      if (error instanceof Error && error.message === 'yookassa_request_failed') throw error;
      throw new Error('yookassa_request_failed');
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    createPayment: (input, idempotencyKey) =>
      request(API_URL, {
        method: 'POST',
        headers: {
          Authorization: authorization,
          'Content-Type': 'application/json',
          'Idempotence-Key': idempotencyKey,
        },
        body: JSON.stringify({
          amount: { value: input.amountRub.toFixed(2), currency: 'RUB' },
          capture: true,
          confirmation: { type: 'redirect', return_url: options.returnUrl },
          description: input.description,
          metadata: { local_payment_id: input.localPaymentId },
        }),
      }),
    getPayment: (providerPaymentId) =>
      request(`${API_URL}/${encodeURIComponent(providerPaymentId)}`, {
        method: 'GET',
        headers: { Authorization: authorization },
      }),
  };
}
