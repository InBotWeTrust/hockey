import { createHash } from 'node:crypto';
import { GoogleAuth } from 'google-auth-library';
import type { WebPushPayload } from './service.js';

export interface FcmOptions {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

export interface FcmSendResult {
  ok: boolean;
  invalid: boolean;
  retryable: boolean;
  status: number;
  diagnostic: string;
}

const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const FCM_TIMEOUT_MS = 10_000;
const authClients = new Map<string, GoogleAuth>();

function getAuthClient(options: FcmOptions): GoogleAuth {
  const key = createHash('sha256')
    .update(options.projectId)
    .update('\0')
    .update(options.clientEmail)
    .update('\0')
    .update(options.privateKey)
    .digest('base64url');
  const cached = authClients.get(key);
  if (cached !== undefined) return cached;
  const auth = new GoogleAuth({
    credentials: {
      client_email: options.clientEmail,
      private_key: options.privateKey,
    },
    scopes: [FCM_SCOPE],
  });
  authClients.set(key, auth);
  return auth;
}

function responseReason(value: unknown): string {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return 'unknown_error';
  const error = (value as Record<string, unknown>).error;
  if (error === null || typeof error !== 'object' || Array.isArray(error)) return 'unknown_error';
  const errorRecord = error as Record<string, unknown>;
  const details = errorRecord.details;
  if (Array.isArray(details)) {
    for (const detail of details) {
      if (detail === null || typeof detail !== 'object' || Array.isArray(detail)) continue;
      const errorCode = (detail as Record<string, unknown>).errorCode;
      if (typeof errorCode === 'string' && errorCode.length > 0) return errorCode;
    }
  }
  const status = errorRecord.status;
  return typeof status === 'string' && status.length > 0 ? status : 'unknown_error';
}

export async function sendFcm(
  token: string,
  options: FcmOptions,
  payload: WebPushPayload,
): Promise<FcmSendResult> {
  try {
    const auth = getAuthClient(options);
    const accessToken = await auth.getAccessToken();
    if (accessToken === null) {
      return {
        ok: false,
        invalid: false,
        retryable: true,
        status: 0,
        diagnostic: 'auth_error: access token unavailable',
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FCM_TIMEOUT_MS);
    timeout.unref();
    let response: Response;
    try {
      response = await fetch(
        `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(options.projectId)}/messages:send`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              token,
              notification: { title: payload.title, body: payload.body },
              data: {
                title: payload.title,
                body: payload.body,
                url: payload.url,
                ...(payload.deliveryId === undefined ? {} : { deliveryId: payload.deliveryId }),
                ...(payload.eventType === undefined ? {} : { eventType: payload.eventType }),
              },
              android: { priority: 'normal' },
            },
          }),
          signal: controller.signal,
        },
      );
    } finally {
      clearTimeout(timeout);
    }

    if (response.ok) {
      return {
        ok: true,
        invalid: false,
        retryable: false,
        status: response.status,
        diagnostic: 'sent',
      };
    }

    let reason = 'unknown_error';
    try {
      reason = responseReason(await response.json());
    } catch {
      // Keep a bounded, credential-free classification when FCM returns malformed data.
    }
    const invalid = response.status === 404 || reason === 'UNREGISTERED';
    const retryable = !invalid && (response.status === 429 || response.status >= 500);
    return {
      ok: false,
      invalid,
      retryable,
      status: response.status,
      diagnostic: `HTTP ${response.status}: ${reason}`,
    };
  } catch {
    return {
      ok: false,
      invalid: false,
      retryable: true,
      status: 0,
      diagnostic: 'network_error',
    };
  }
}
