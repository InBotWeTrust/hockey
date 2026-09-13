import { describe, expect, it } from 'vitest';
import { parseSignedAndroidReleaseManifest } from './schema.js';

const valid = {
  versionName: '1.2.3',
  latestVersionCode: 12,
  minimumSupportedVersionCode: 10,
  apkUrl: 'https://ultimatehockey.ru/mobile/android/ultimate-hockey-12.apk',
  apkSizeBytes: 1024,
  apkSha256: 'a'.repeat(64),
  releaseNotes: 'Исправления',
  publishedAt: '2026-09-13T12:00:00.000Z',
  keyId: 'android-manifest-test',
  signature: 'c2ln',
};

describe('Android release manifest schema', () => {
  it('accepts the strict canonical manifest', () => {
    expect(parseSignedAndroidReleaseManifest(valid)).toEqual(valid);
  });

  it.each([
    { extra: true },
    { apkUrl: 'http://ultimatehockey.ru/app.apk' },
    { apkUrl: 'https://evil.example/app.apk' },
    { apkSha256: 'A'.repeat(64) },
    { publishedAt: 'yesterday' },
    { latestVersionCode: 0 },
    { latestVersionCode: 2_100_000_001 },
    { minimumSupportedVersionCode: 2_100_000_001, latestVersionCode: 2_100_000_001 },
    { apkSizeBytes: 0 },
    { apkSizeBytes: Number.MAX_SAFE_INTEGER + 1 },
    { latestVersionCode: 10, minimumSupportedVersionCode: 11 },
  ])('rejects an invalid manifest %#', (patch) => {
    expect(() => parseSignedAndroidReleaseManifest({ ...valid, ...patch })).toThrow();
  });
});
