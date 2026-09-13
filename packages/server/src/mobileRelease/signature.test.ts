import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { signReleaseManifest, verifyReleaseManifest } from './signature.js';

describe('Android release manifest signature', () => {
  it('verifies every signed field and rejects a changed field', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const unsigned = {
      versionName: '1.0.0',
      latestVersionCode: 1,
      minimumSupportedVersionCode: 1,
      apkUrl: 'https://ultimatehockey.ru/mobile/android/ultimate-hockey-1.apk',
      apkSizeBytes: 100,
      apkSha256: 'b'.repeat(64),
      releaseNotes: 'Первый релиз',
      publishedAt: '2026-09-13T12:00:00.000Z',
      keyId: 'test-key',
    };
    const signed = signReleaseManifest(
      unsigned,
      privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    );
    const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    expect(verifyReleaseManifest(signed, publicPem)).toBe(true);
    expect(verifyReleaseManifest({ ...signed, releaseNotes: 'Подмена' }, publicPem)).toBe(false);
  });
});
