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
