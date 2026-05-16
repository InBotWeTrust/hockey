import { createHmac, timingSafeEqual } from 'node:crypto';

export function createMediaAccessToken(secret: string, mediaId: string): string {
  return createHmac('sha256', secret).update(mediaId).digest('base64url');
}

export function verifyMediaAccessToken(secret: string, mediaId: string, token: string): boolean {
  const expected = Buffer.from(createMediaAccessToken(secret, mediaId));
  const actual = Buffer.from(token);
  if (expected.byteLength !== actual.byteLength) return false;
  return timingSafeEqual(expected, actual);
}

export function createMediaProxyUrl(secret: string, mediaId: string): string {
  const token = createMediaAccessToken(secret, mediaId);
  return `/api/media/${mediaId}?t=${encodeURIComponent(token)}`;
}
