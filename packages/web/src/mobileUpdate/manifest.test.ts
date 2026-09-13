import { generateKeyPairSync, sign } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { canonicalizeReleaseManifest, fetchVerifiedManifest } from './manifest.js';
import type { UnsignedAndroidReleaseManifest } from './types.js';

const unsigned: UnsignedAndroidReleaseManifest = {
  versionName: '1.2.3',
  latestVersionCode: 3,
  minimumSupportedVersionCode: 2,
  apkUrl: 'https://ultimatehockey.ru/mobile/android/ultimate-hockey-3.apk',
  apkSizeBytes: 123,
  apkSha256: 'a'.repeat(64),
  releaseNotes: 'Исправления',
  publishedAt: '2026-09-13T12:00:00.000Z',
  keyId: 'test-key',
};

describe('fetchVerifiedManifest', () => {
  const keys = generateKeyPairSync('ed25519');
  const publicDer = keys.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function signed(patch: Record<string, unknown> = {}) {
    return {
      ...unsigned,
      signature: sign(null, canonicalizeReleaseManifest(unsigned), keys.privateKey).toString(
        'base64',
      ),
      ...patch,
    };
  }

  it('accepts a strict manifest signed by its known key', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(signed())));
    await expect(
      fetchVerifiedManifest('/api/mobile/android/release', { 'test-key': publicDer }),
    ).resolves.toMatchObject(unsigned);
  });

  it.each([
    { latestVersionCode: 4 },
    { apkUrl: 'https://ultimatehockey.ru/mobile/android/other.apk' },
    { apkSizeBytes: 124 },
    { apkSha256: 'b'.repeat(64) },
    { releaseNotes: 'Подмена' },
    { publishedAt: '2026-09-14T12:00:00.000Z' },
    { signature: 'broken' },
    { keyId: 'unknown' },
  ])('rejects changed or untrusted data %#', async (patch) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(signed(patch))));
    await expect(
      fetchVerifiedManifest('/api/mobile/android/release', { 'test-key': publicDer }),
    ).rejects.toThrow();
  });
});
