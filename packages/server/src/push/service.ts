import { createCipheriv, createECDH, createHmac, randomBytes } from 'node:crypto';
import { SignJWT, importJWK, type JWK } from 'jose';

export interface PushVapidOptions {
  publicKey?: string;
  privateKey?: string;
  subject?: string;
}

export interface ResolvedPushVapidOptions {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export interface WebPushSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface WebPushSendResult {
  ok: boolean;
  status: number;
  gone: boolean;
  body: string;
}

export interface WebPushPayload {
  title: string;
  body: string;
  url: string;
  deliveryId?: string;
  tag?: string;
  icon?: string;
  badge?: string;
  silent?: boolean;
}

const DEFAULT_VAPID_SUBJECT = 'mailto:push@hockey.inbotwetrust.ru';
const WEB_PUSH_TTL_SECONDS = 60;
const WEB_PUSH_TIMEOUT_MS = 10_000;
const WEB_PUSH_RECORD_SIZE = 4096;
const MAX_WEB_PUSH_PAYLOAD_BYTES = 3800;

export function resolvePushVapidOptions(
  options: PushVapidOptions,
): ResolvedPushVapidOptions | null {
  if (!options.publicKey || !options.privateKey) return null;
  return {
    publicKey: options.publicKey,
    privateKey: options.privateKey,
    subject: options.subject ?? DEFAULT_VAPID_SUBJECT,
  };
}

function publicKeyToJwk(publicKey: string, privateKey: string): JWK {
  const publicBytes = Buffer.from(publicKey, 'base64url');
  const privateBytes = Buffer.from(privateKey, 'base64url');

  if (publicBytes.length !== 65 || publicBytes[0] !== 0x04) {
    throw new Error('invalid VAPID public key');
  }
  if (privateBytes.length !== 32) {
    throw new Error('invalid VAPID private key');
  }

  return {
    kty: 'EC',
    crv: 'P-256',
    x: publicBytes.subarray(1, 33).toString('base64url'),
    y: publicBytes.subarray(33, 65).toString('base64url'),
    d: privateKey,
  };
}

export async function createVapidJwt(
  audience: string,
  options: ResolvedPushVapidOptions,
  now = new Date(),
): Promise<string> {
  const key = await importJWK(publicKeyToJwk(options.publicKey, options.privateKey), 'ES256');
  const expiresAt = Math.floor(now.getTime() / 1000) + 12 * 60 * 60;

  return new SignJWT({
    aud: audience,
    exp: expiresAt,
    sub: options.subject,
  })
    .setProtectedHeader({ alg: 'ES256', typ: 'JWT' })
    .sign(key);
}

function hkdfExtract(salt: Buffer, input: Buffer): Buffer {
  return createHmac('sha256', salt).update(input).digest();
}

function hkdfExpand(prk: Buffer, info: Buffer, length: number): Buffer {
  const blocks: Buffer[] = [];
  let previous = Buffer.alloc(0);
  let counter = 1;

  while (Buffer.concat(blocks).length < length) {
    previous = createHmac('sha256', prk)
      .update(previous)
      .update(info)
      .update(Buffer.from([counter]))
      .digest();
    blocks.push(previous);
    counter += 1;
  }

  return Buffer.concat(blocks).subarray(0, length);
}

function encryptWebPushPayload(subscription: WebPushSubscription, payload: WebPushPayload): Buffer {
  const payloadBytes = Buffer.from(JSON.stringify(payload), 'utf8');
  if (payloadBytes.length > MAX_WEB_PUSH_PAYLOAD_BYTES) {
    throw new Error('web push payload is too large');
  }

  const userPublicKey = Buffer.from(subscription.p256dh, 'base64url');
  const authSecret = Buffer.from(subscription.auth, 'base64url');
  const salt = randomBytes(16);
  const ecdh = createECDH('prime256v1');
  const serverPublicKey = ecdh.generateKeys();
  const sharedSecret = ecdh.computeSecret(userPublicKey);

  const authPrk = hkdfExtract(authSecret, sharedSecret);
  const keyInfo = Buffer.concat([
    Buffer.from('WebPush: info\0', 'utf8'),
    userPublicKey,
    serverPublicKey,
  ]);
  const ikm = hkdfExpand(authPrk, keyInfo, 32);
  const contentPrk = hkdfExtract(salt, ikm);
  const cek = hkdfExpand(contentPrk, Buffer.from('Content-Encoding: aes128gcm\0', 'utf8'), 16);
  const nonce = hkdfExpand(contentPrk, Buffer.from('Content-Encoding: nonce\0', 'utf8'), 12);
  const plaintext = Buffer.concat([payloadBytes, Buffer.from([0x02])]);
  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(WEB_PUSH_RECORD_SIZE, 16);
  header[20] = serverPublicKey.length;

  return Buffer.concat([header, serverPublicKey, encrypted]);
}

export async function sendWebPush(
  subscription: WebPushSubscription,
  options: ResolvedPushVapidOptions,
  payload?: WebPushPayload,
): Promise<WebPushSendResult> {
  const audience = new URL(subscription.endpoint).origin;
  const token = await createVapidJwt(audience, options);
  const body = payload ? encryptWebPushPayload(subscription, payload) : undefined;
  const headers: Record<string, string> = {
    Authorization: `vapid t=${token}, k=${options.publicKey}`,
    TTL: String(WEB_PUSH_TTL_SECONDS),
    Urgency: 'normal',
  };

  if (body) {
    headers['Content-Encoding'] = 'aes128gcm';
    headers['Content-Type'] = 'application/octet-stream';
    headers['Content-Length'] = String(body.length);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, WEB_PUSH_TIMEOUT_MS);
  timeout.unref();

  try {
    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers,
      ...(body ? { body } : {}),
      signal: controller.signal,
    });

    const responseBody = await response.text().catch(() => '');
    return {
      ok: response.ok,
      status: response.status,
      gone: response.status === 404 || response.status === 410,
      body: responseBody,
    };
  } finally {
    clearTimeout(timeout);
  }
}
