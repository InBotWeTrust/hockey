import { SignJWT, jwtVerify } from 'jose';
import { randomUUID } from 'node:crypto';

export interface AccessTokenPayload {
  sub: string;
  exp: number;
  iat: number;
}

export interface RefreshTokenPayload extends AccessTokenPayload {
  jti: string;
}

export interface JwtServiceOptions {
  accessSecret: string;
  refreshSecret: string;
  accessTtlSec?: number;
  refreshTtlSec?: number;
}

export interface JwtService {
  issueAccessToken(input: { sub: string }): Promise<string>;
  issueRefreshToken(input: { sub: string }): Promise<{ token: string; jti: string; expSec: number }>;
  accessSecret: string;
  refreshSecret: string;
  refreshTtlSec: number;
}

const encoder = new TextEncoder();

export function createJwt(options: JwtServiceOptions): JwtService {
  const accessTtlSec = options.accessTtlSec ?? 15 * 60;
  const refreshTtlSec = options.refreshTtlSec ?? 30 * 24 * 60 * 60;
  const accessKey = encoder.encode(options.accessSecret);
  const refreshKey = encoder.encode(options.refreshSecret);

  return {
    accessSecret: options.accessSecret,
    refreshSecret: options.refreshSecret,
    refreshTtlSec,
    async issueAccessToken({ sub }) {
      return new SignJWT({})
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(sub)
        .setIssuedAt()
        .setExpirationTime(`${accessTtlSec}s`)
        .sign(accessKey);
    },
    async issueRefreshToken({ sub }) {
      const jti = randomUUID();
      const token = await new SignJWT({})
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(sub)
        .setJti(jti)
        .setIssuedAt()
        .setExpirationTime(`${refreshTtlSec}s`)
        .sign(refreshKey);
      return { token, jti, expSec: refreshTtlSec };
    },
  };
}

export async function verifyAccessToken(token: string, secret: string): Promise<AccessTokenPayload> {
  const { payload } = await jwtVerify(token, encoder.encode(secret), { algorithms: ['HS256'] });
  if (typeof payload.sub !== 'string' || typeof payload.exp !== 'number' || typeof payload.iat !== 'number') {
    throw new Error('jwt: invalid payload');
  }
  return { sub: payload.sub, exp: payload.exp, iat: payload.iat };
}

export async function verifyRefreshToken(token: string, secret: string): Promise<RefreshTokenPayload> {
  const { payload } = await jwtVerify(token, encoder.encode(secret), { algorithms: ['HS256'] });
  if (
    typeof payload.sub !== 'string' ||
    typeof payload.exp !== 'number' ||
    typeof payload.iat !== 'number' ||
    typeof payload.jti !== 'string'
  ) {
    throw new Error('jwt: invalid refresh payload');
  }
  return { sub: payload.sub, exp: payload.exp, iat: payload.iat, jti: payload.jti };
}
