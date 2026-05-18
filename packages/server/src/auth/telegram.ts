import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export interface TelegramLoginUser {
  id: number;
  firstName: string;
  lastName?: string;
  username?: string;
  photoUrl?: string;
  authDate: Date;
}

const MAX_AGE_SEC = 24 * 60 * 60;

export function verifyTelegramLoginPayload(
  raw: Record<string, unknown>,
  botToken: string,
): TelegramLoginUser {
  const data: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'string') data[k] = v;
    else if (typeof v === 'number') data[k] = String(v);
  }

  const providedHash = data.hash;
  if (!providedHash) throw new Error('telegram: missing hash');

  const checkString = Object.keys(data)
    .filter((k) => k !== 'hash')
    .sort()
    .map((k) => `${k}=${data[k]}`)
    .join('\n');
  const secretKey = createHash('sha256').update(botToken).digest();
  const expectedHash = createHmac('sha256', secretKey).update(checkString).digest('hex');

  if (expectedHash.length !== providedHash.length) {
    throw new Error('telegram: invalid hash');
  }
  const ok = timingSafeEqual(Buffer.from(expectedHash), Buffer.from(providedHash));
  if (!ok) throw new Error('telegram: invalid hash');

  const authDateSec = Number(data.auth_date);
  if (!Number.isFinite(authDateSec)) throw new Error('telegram: invalid auth_date');
  const ageSec = Math.floor(Date.now() / 1000) - authDateSec;
  if (ageSec > MAX_AGE_SEC) throw new Error('telegram: auth_date expired');

  const idNum = Number(data.id);
  if (!Number.isFinite(idNum)) throw new Error('telegram: invalid id');

  return {
    id: idNum,
    firstName: data.first_name ?? '',
    ...(data.last_name !== undefined ? { lastName: data.last_name } : {}),
    ...(data.username !== undefined ? { username: data.username } : {}),
    ...(data.photo_url !== undefined ? { photoUrl: data.photo_url } : {}),
    authDate: new Date(authDateSec * 1000),
  };
}

function assertFreshAuthDate(authDateRaw: string | undefined): Date {
  const authDateSec = Number(authDateRaw);
  if (!Number.isFinite(authDateSec)) throw new Error('telegram: invalid auth_date');
  const ageSec = Math.floor(Date.now() / 1000) - authDateSec;
  if (ageSec > MAX_AGE_SEC) throw new Error('telegram: auth_date expired');
  return new Date(authDateSec * 1000);
}

function safeTimingEqualHex(expectedHash: string, providedHash: string | undefined): void {
  if (!providedHash) throw new Error('telegram: missing hash');
  if (expectedHash.length !== providedHash.length) {
    throw new Error('telegram: invalid hash');
  }
  const ok = timingSafeEqual(Buffer.from(expectedHash), Buffer.from(providedHash));
  if (!ok) throw new Error('telegram: invalid hash');
}

function isTelegramMiniAppUser(value: unknown): value is {
  id: number | string;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
} {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === 'number' || typeof candidate.id === 'string';
}

export function verifyTelegramMiniAppInitData(
  initData: string,
  botToken: string,
): TelegramLoginUser {
  const data: Record<string, string> = {};
  const params = new URLSearchParams(initData);
  for (const [key, value] of params.entries()) {
    if (data[key] !== undefined) throw new Error('telegram: duplicate init data key');
    data[key] = value;
  }

  const checkString = Object.keys(data)
    .filter((k) => k !== 'hash')
    .sort()
    .map((k) => `${k}=${data[k]}`)
    .join('\n');
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expectedHash = createHmac('sha256', secretKey).update(checkString).digest('hex');
  safeTimingEqualHex(expectedHash, data.hash);

  const authDate = assertFreshAuthDate(data.auth_date);
  if (!data.user) throw new Error('telegram: missing user');

  let userRaw: unknown;
  try {
    userRaw = JSON.parse(data.user);
  } catch {
    throw new Error('telegram: invalid user');
  }
  if (!isTelegramMiniAppUser(userRaw)) throw new Error('telegram: invalid user');

  const idNum = Number(userRaw.id);
  if (!Number.isFinite(idNum)) throw new Error('telegram: invalid id');

  return {
    id: idNum,
    firstName: userRaw.first_name ?? '',
    ...(userRaw.last_name !== undefined ? { lastName: userRaw.last_name } : {}),
    ...(userRaw.username !== undefined ? { username: userRaw.username } : {}),
    ...(userRaw.photo_url !== undefined ? { photoUrl: userRaw.photo_url } : {}),
    authDate,
  };
}
