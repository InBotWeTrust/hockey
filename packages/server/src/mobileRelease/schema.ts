import { z } from 'zod';

const canonicalApkUrl = z
  .string()
  .url()
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        url.protocol === 'https:' &&
        url.hostname === 'ultimatehockey.ru' &&
        url.port === '' &&
        url.username === '' &&
        url.password === '' &&
        url.search === '' &&
        url.hash === '' &&
        url.pathname.startsWith('/mobile/android/') &&
        url.pathname.endsWith('.apk') &&
        url.toString() === value
      );
    } catch {
      return false;
    }
  }, 'invalid canonical APK URL');

const manifestFields = {
  versionName: z.string().min(1).max(64),
  latestVersionCode: z.number().int().safe().positive().max(2_100_000_000),
  minimumSupportedVersionCode: z.number().int().safe().positive().max(2_100_000_000),
  apkUrl: canonicalApkUrl,
  apkSizeBytes: z.number().int().safe().positive(),
  apkSha256: z.string().regex(/^[0-9a-f]{64}$/),
  releaseNotes: z.string().max(10_000),
  publishedAt: z.string().datetime({ offset: true }),
  keyId: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,127}$/i),
};

const manifestObject = z.object(manifestFields).strict();
const versionRefinement = (value: {
  minimumSupportedVersionCode: number;
  latestVersionCode: number;
}) => value.minimumSupportedVersionCode <= value.latestVersionCode;

const unsignedSchema = manifestObject.refine(versionRefinement, {
  message: 'minimum version exceeds latest version',
  path: ['minimumSupportedVersionCode'],
});

export type UnsignedAndroidReleaseManifest = z.infer<typeof unsignedSchema>;
export type SignedAndroidReleaseManifest = UnsignedAndroidReleaseManifest & { signature: string };

const signedSchema = manifestObject
  .extend({ signature: z.string().min(1).max(512) })
  .refine(versionRefinement, {
    message: 'minimum version exceeds latest version',
    path: ['minimumSupportedVersionCode'],
  });

export function parseUnsignedAndroidReleaseManifest(
  value: unknown,
): UnsignedAndroidReleaseManifest {
  return unsignedSchema.parse(value);
}

export function parseSignedAndroidReleaseManifest(value: unknown): SignedAndroidReleaseManifest {
  return signedSchema.parse(value);
}
