import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { signReleaseManifest } from './signature.js';
import { verifyManifestFile } from './verify-manifest-cli.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })));
});

describe('verifyManifestFile', () => {
  it('accepts only a manifest signed by the configured key id', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'android-manifest-'));
    temporaryDirectories.push(directory);
    const manifestPath = join(directory, 'current.json');
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const manifest = signReleaseManifest(
      {
        versionName: '1.0.0',
        latestVersionCode: 1,
        minimumSupportedVersionCode: 1,
        apkUrl: 'https://ultimatehockey.ru/mobile/android/ultimate-hockey-1.0.0-1.apk',
        apkSizeBytes: 100,
        apkSha256: 'a'.repeat(64),
        releaseNotes: 'Первый выпуск',
        publishedAt: '2026-09-13T00:00:00Z',
        keyId: 'key-1',
      },
      privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    );
    await writeFile(manifestPath, JSON.stringify(manifest));

    await expect(
      verifyManifestFile(manifestPath, JSON.stringify({ 'key-1': publicPem })),
    ).resolves.toBeUndefined();
    await expect(
      verifyManifestFile(manifestPath, JSON.stringify({ 'wrong-key': publicPem })),
    ).rejects.toThrow('signature verification failed');
  });
});
