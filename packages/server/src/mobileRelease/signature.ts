import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import {
  parseSignedAndroidReleaseManifest,
  parseUnsignedAndroidReleaseManifest,
  type SignedAndroidReleaseManifest,
  type UnsignedAndroidReleaseManifest,
} from './schema.js';

export function canonicalizeReleaseManifest(value: UnsignedAndroidReleaseManifest): Uint8Array {
  const manifest = parseUnsignedAndroidReleaseManifest(value);
  return Buffer.from(
    JSON.stringify({
      versionName: manifest.versionName,
      latestVersionCode: manifest.latestVersionCode,
      minimumSupportedVersionCode: manifest.minimumSupportedVersionCode,
      apkUrl: manifest.apkUrl,
      apkSizeBytes: manifest.apkSizeBytes,
      apkSha256: manifest.apkSha256,
      releaseNotes: manifest.releaseNotes,
      publishedAt: manifest.publishedAt,
      keyId: manifest.keyId,
    }),
    'utf8',
  );
}

export function signReleaseManifest(
  value: UnsignedAndroidReleaseManifest,
  privateKeyPem: string,
): SignedAndroidReleaseManifest {
  const manifest = parseUnsignedAndroidReleaseManifest(value);
  const signature = sign(
    null,
    canonicalizeReleaseManifest(manifest),
    createPrivateKey(privateKeyPem),
  );
  return { ...manifest, signature: signature.toString('base64') };
}

export function verifyReleaseManifest(
  value: SignedAndroidReleaseManifest,
  publicKeyPem: string,
): boolean {
  try {
    const manifest = parseSignedAndroidReleaseManifest(value);
    const { signature, ...unsigned } = manifest;
    return verify(
      null,
      canonicalizeReleaseManifest(unsigned),
      createPublicKey(publicKeyPem),
      Buffer.from(signature, 'base64'),
    );
  } catch {
    return false;
  }
}
