import { describe, it, expect } from 'vitest';
import {
  createJwt,
  verifyAccessToken,
  verifyRefreshToken,
  type JwtService,
} from '../../src/auth/jwt.js';

const jwt: JwtService = createJwt({
  accessSecret: 'access-secret-1234567890abcdef',
  refreshSecret: 'refresh-secret-1234567890abcdef',
});

describe('JwtService', () => {
  it('issues + verifies access token with 15m exp', async () => {
    const token = await jwt.issueAccessToken({ sub: 'user-1' });
    const payload = await verifyAccessToken(token, 'access-secret-1234567890abcdef');
    expect(payload.sub).toBe('user-1');
    expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(payload.exp).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + 15 * 60 + 5);
  });

  it('issues refresh token with jti and 30d exp', async () => {
    const { token, jti } = await jwt.issueRefreshToken({ sub: 'user-1' });
    expect(jti).toMatch(/^[0-9a-f-]{36}$/i);
    const payload = await verifyRefreshToken(token, 'refresh-secret-1234567890abcdef');
    expect(payload.sub).toBe('user-1');
    expect(payload.jti).toBe(jti);
    expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000) + 29 * 24 * 60 * 60);
  });

  it('verifyAccessToken rejects a refresh token (wrong secret)', async () => {
    const { token } = await jwt.issueRefreshToken({ sub: 'user-1' });
    await expect(
      verifyAccessToken(token, 'access-secret-1234567890abcdef'),
    ).rejects.toThrow();
  });

  it('rejects tampered token', async () => {
    const token = await jwt.issueAccessToken({ sub: 'user-1' });
    const tampered = token.slice(0, -4) + 'xxxx';
    await expect(
      verifyAccessToken(tampered, 'access-secret-1234567890abcdef'),
    ).rejects.toThrow();
  });
});
