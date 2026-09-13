import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildManifestFile } from './build-manifest-cli.js';

describe('buildManifestFile', () => {
  it('writes a signed mode-0600 file and refuses to overwrite it', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'manifest-cli-test-'));
    const metadataPath = path.join(directory, 'metadata.json');
    const outputPath = path.join(directory, 'release.json');
    const { privateKey } = generateKeyPairSync('ed25519');
    await writeFile(
      metadataPath,
      JSON.stringify({
        versionName: '1.0.0',
        latestVersionCode: 1,
        minimumSupportedVersionCode: 1,
        apkUrl: 'https://ultimatehockey.ru/mobile/android/app-1.apk',
        apkSizeBytes: 42,
        apkSha256: 'd'.repeat(64),
        releaseNotes: '',
        publishedAt: '2026-09-13T12:00:00.000Z',
        keyId: 'test',
      }),
    );
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    await buildManifestFile(metadataPath, outputPath, pem);
    expect(JSON.parse(await readFile(outputPath, 'utf8')).signature).toBeTypeOf('string');
    expect((await stat(outputPath)).mode & 0o777).toBe(0o600);
    await expect(buildManifestFile(metadataPath, outputPath, pem)).rejects.toMatchObject({
      code: 'EEXIST',
    });
  });
});
