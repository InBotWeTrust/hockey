import type { SignedAndroidReleaseManifest, UnsignedAndroidReleaseManifest } from './types.js';

const FIELDS = [
  'versionName',
  'latestVersionCode',
  'minimumSupportedVersionCode',
  'apkUrl',
  'apkSizeBytes',
  'apkSha256',
  'releaseNotes',
  'publishedAt',
  'keyId',
  'signature',
] as const;
const MAX_VERSION_CODE = 2_100_000_000;

function decodeBase64(value: string): Uint8Array {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new Error('Invalid base64');
  }
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function asCryptoBufferSource(value: Uint8Array): BufferSource {
  const nodeBuffer = (
    globalThis as typeof globalThis & {
      Buffer?: { from(bytes: Uint8Array): Uint8Array };
    }
  ).Buffer;
  if (nodeBuffer !== undefined) return nodeBuffer.from(value) as BufferSource;
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}

function parseManifest(value: unknown): SignedAndroidReleaseManifest {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid release manifest');
  }
  const data = value as Record<string, unknown>;
  if (
    Object.keys(data).length !== FIELDS.length ||
    Object.keys(data).some((key) => !FIELDS.includes(key as (typeof FIELDS)[number]))
  ) {
    throw new Error('Invalid release manifest fields');
  }
  const latest = data.latestVersionCode;
  const minimum = data.minimumSupportedVersionCode;
  const size = data.apkSizeBytes;
  if (
    typeof data.versionName !== 'string' ||
    data.versionName.length < 1 ||
    data.versionName.length > 64 ||
    typeof latest !== 'number' ||
    !Number.isSafeInteger(latest) ||
    latest < 1 ||
    latest > MAX_VERSION_CODE ||
    typeof minimum !== 'number' ||
    !Number.isSafeInteger(minimum) ||
    minimum < 1 ||
    minimum > latest ||
    typeof size !== 'number' ||
    !Number.isSafeInteger(size) ||
    size < 1 ||
    typeof data.apkSha256 !== 'string' ||
    !/^[0-9a-f]{64}$/.test(data.apkSha256) ||
    typeof data.releaseNotes !== 'string' ||
    data.releaseNotes.length > 10_000 ||
    typeof data.publishedAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      data.publishedAt,
    ) ||
    Number.isNaN(Date.parse(data.publishedAt)) ||
    typeof data.keyId !== 'string' ||
    !/^[a-z0-9][a-z0-9._-]{0,127}$/i.test(data.keyId) ||
    typeof data.signature !== 'string'
  ) {
    throw new Error('Invalid release manifest values');
  }
  const apkUrl = typeof data.apkUrl === 'string' ? new URL(data.apkUrl) : null;
  if (
    apkUrl === null ||
    apkUrl.protocol !== 'https:' ||
    apkUrl.hostname !== 'ultimatehockey.ru' ||
    apkUrl.port !== '' ||
    apkUrl.username !== '' ||
    apkUrl.password !== '' ||
    apkUrl.search !== '' ||
    apkUrl.hash !== '' ||
    !apkUrl.pathname.startsWith('/mobile/android/') ||
    !apkUrl.pathname.endsWith('.apk') ||
    apkUrl.toString() !== data.apkUrl
  ) {
    throw new Error('Invalid APK URL');
  }
  return data as unknown as SignedAndroidReleaseManifest;
}

export function canonicalizeReleaseManifest(manifest: UnsignedAndroidReleaseManifest): Uint8Array {
  return new TextEncoder().encode(
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
  );
}

export async function verifyReleaseManifest(
  value: unknown,
  publicKeys: Readonly<Record<string, string>>,
): Promise<SignedAndroidReleaseManifest> {
  const manifest = parseManifest(value);
  const publicKey = publicKeys[manifest.keyId];
  if (publicKey === undefined) throw new Error('Unknown manifest signing key');
  const signature = decodeBase64(manifest.signature);
  if (signature.byteLength !== 64) throw new Error('Invalid manifest signature');
  const unsigned: UnsignedAndroidReleaseManifest = {
    versionName: manifest.versionName,
    latestVersionCode: manifest.latestVersionCode,
    minimumSupportedVersionCode: manifest.minimumSupportedVersionCode,
    apkUrl: manifest.apkUrl,
    apkSizeBytes: manifest.apkSizeBytes,
    apkSha256: manifest.apkSha256,
    releaseNotes: manifest.releaseNotes,
    publishedAt: manifest.publishedAt,
    keyId: manifest.keyId,
  };
  const key = await crypto.subtle.importKey(
    'spki',
    asCryptoBufferSource(decodeBase64(publicKey)),
    { name: 'Ed25519' },
    false,
    ['verify'],
  );
  const valid = await crypto.subtle.verify(
    { name: 'Ed25519' },
    key,
    asCryptoBufferSource(signature),
    asCryptoBufferSource(canonicalizeReleaseManifest(unsigned)),
  );
  if (!valid) throw new Error('Invalid manifest signature');
  return manifest;
}

export async function fetchVerifiedManifest(
  url: string,
  publicKeys: Readonly<Record<string, string>>,
  signal?: AbortSignal,
): Promise<SignedAndroidReleaseManifest> {
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    ...(signal === undefined ? {} : { signal }),
  });
  if (!response.ok) throw new Error('Release manifest unavailable');
  return verifyReleaseManifest(await response.json(), publicKeys);
}
