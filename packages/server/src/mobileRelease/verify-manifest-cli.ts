import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { parseSignedAndroidReleaseManifest } from './schema.js';
import { verifyReleaseManifest } from './signature.js';

export async function verifyManifestFile(
  manifestPath: string,
  publicKeysJson: string,
): Promise<void> {
  const manifest = parseSignedAndroidReleaseManifest(
    JSON.parse(await readFile(manifestPath, 'utf8')),
  );
  const publicKeys = JSON.parse(publicKeysJson) as unknown;
  if (publicKeys === null || typeof publicKeys !== 'object' || Array.isArray(publicKeys)) {
    throw new Error('invalid Android manifest public keys');
  }
  const publicKey = (publicKeys as Record<string, unknown>)[manifest.keyId];
  if (typeof publicKey !== 'string' || !verifyReleaseManifest(manifest, publicKey)) {
    throw new Error('Android release manifest signature verification failed');
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [manifestPath] = process.argv.slice(2);
  const publicKeysJson = process.env.ANDROID_MANIFEST_PUBLIC_KEYS_JSON;
  if (!manifestPath || !publicKeysJson) {
    console.error('usage: mobile:verify-release-manifest <manifest-json>');
    process.exitCode = 1;
  } else {
    verifyManifestFile(manifestPath, publicKeysJson).catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : 'manifest verification failed');
      process.exitCode = 1;
    });
  }
}
