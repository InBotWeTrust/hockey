import { createHash, randomBytes } from 'node:crypto';
import { AppError } from '../plugins/errors.js';

export type MobileAuthProvider = 'telegram' | 'vk';

export interface MobileAuthRedis {
  get(key: string): Promise<string | null>;
  setex(key: string, seconds: number, value: string): Promise<unknown>;
  eval(script: string, keyCount: number, ...args: Array<string | number>): Promise<unknown>;
}

const TTL_SECONDS = 5 * 60;
const ATTEMPT_PREFIX = 'mobile-auth:attempt:';
const HANDOFF_PREFIX = 'mobile-auth:handoff:';
const USED_PREFIX = 'mobile-auth:used:';

const COMPLETE_SCRIPT = `
-- complete-mobile-auth
local attempt = redis.call('GET', KEYS[1])
if not attempt then return {'missing'} end
redis.call('DEL', KEYS[1])
local decoded = cjson.decode(attempt)
redis.call('SET', KEYS[2], cjson.encode({
  userId = ARGV[1],
  codeChallenge = decoded.codeChallenge,
  provider = decoded.provider
}), 'EX', ARGV[2], 'NX')
return {'ok'}
`;

const CONSUME_SCRIPT = `
-- consume-mobile-auth
if redis.call('EXISTS', KEYS[2]) == 1 then return {'used'} end
local handoff = redis.call('GET', KEYS[1])
if not handoff then return {'missing'} end
local decoded = cjson.decode(handoff)
if decoded.codeChallenge ~= ARGV[1] then return {'wrong'} end
redis.call('DEL', KEYS[1])
redis.call('SET', KEYS[2], '1', 'EX', ARGV[2])
return {'ok', decoded.userId}
`;

function opaqueCode(): string {
  return randomBytes(32).toString('base64url');
}

function resultParts(result: unknown): string[] {
  if (!Array.isArray(result)) return [];
  return result.map((part) => String(part));
}

function verifierChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

export async function createMobileAuthAttempt(
  redis: MobileAuthRedis,
  input: { provider: MobileAuthProvider; codeChallenge: string; referralCode?: string; referralSource?: 'manual' | 'link'; referralIpHash?: string; referralInstallationHash?: string },
): Promise<{ attemptId: string; expiresAt: string }> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(input.codeChallenge)) {
    throw new AppError('mobile_auth_pkce_invalid', 'invalid PKCE challenge', 400);
  }
  const attemptId = opaqueCode();
  const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000).toISOString();
  await redis.setex(
    `${ATTEMPT_PREFIX}${attemptId}`,
    TTL_SECONDS,
    JSON.stringify({ ...input, createdAt: new Date().toISOString() }),
  );
  return { attemptId, expiresAt };
}

export async function completeMobileAuthAttempt(
  redis: MobileAuthRedis,
  input: { attemptId: string; userId: string; provider: MobileAuthProvider },
): Promise<{ handoffCode: string }> {
  const attemptKey = `${ATTEMPT_PREFIX}${input.attemptId}`;
  await assertMobileAuthAttempt(redis, input.attemptId, input.provider);

  const handoffCode = opaqueCode();
  const result = resultParts(
    await redis.eval(
      COMPLETE_SCRIPT,
      2,
      attemptKey,
      `${HANDOFF_PREFIX}${handoffCode}`,
      input.userId,
      TTL_SECONDS,
    ),
  );
  if (result[0] !== 'ok') {
    throw new AppError('mobile_auth_attempt_invalid', 'auth attempt expired', 404);
  }
  return { handoffCode };
}

export async function assertMobileAuthAttempt(
  redis: MobileAuthRedis,
  attemptId: string,
  provider: MobileAuthProvider,
): Promise<{ referralCode?: string; referralSource?: 'manual' | 'link'; referralIpHash?: string; referralInstallationHash?: string }> {
  const raw = await redis.get(`${ATTEMPT_PREFIX}${attemptId}`);
  if (!raw) throw new AppError('mobile_auth_attempt_invalid', 'auth attempt expired', 404);
  const attempt = JSON.parse(raw) as { provider?: string; referralCode?: string; referralSource?: 'manual' | 'link'; referralIpHash?: string; referralInstallationHash?: string };
  if (attempt.provider !== provider) {
    throw new AppError('mobile_auth_provider_mismatch', 'auth provider mismatch', 409);
  }
  return {
    ...(attempt.referralCode ? { referralCode: attempt.referralCode } : {}),
    ...(attempt.referralSource ? { referralSource: attempt.referralSource } : {}),
    ...(attempt.referralIpHash ? { referralIpHash: attempt.referralIpHash } : {}),
    ...(attempt.referralInstallationHash
      ? { referralInstallationHash: attempt.referralInstallationHash }
      : {}),
  };
}

export async function consumeMobileAuthHandoff(
  redis: MobileAuthRedis,
  input: { handoffCode: string; codeVerifier: string },
): Promise<string> {
  if (input.codeVerifier.length < 43 || input.codeVerifier.length > 128) {
    throw new AppError('mobile_auth_pkce_invalid', 'invalid PKCE verifier', 400);
  }
  const result = resultParts(
    await redis.eval(
      CONSUME_SCRIPT,
      2,
      `${HANDOFF_PREFIX}${input.handoffCode}`,
      `${USED_PREFIX}${input.handoffCode}`,
      verifierChallenge(input.codeVerifier),
      TTL_SECONDS,
    ),
  );
  if (result[0] === 'wrong') {
    throw new AppError('mobile_auth_pkce_invalid', 'PKCE verifier mismatch', 401);
  }
  if (result[0] === 'used') {
    throw new AppError('mobile_auth_used', 'auth handoff already used', 409);
  }
  if (result[0] !== 'ok' || !result[1]) {
    throw new AppError('mobile_auth_handoff_invalid', 'auth handoff expired', 404);
  }
  return result[1];
}
