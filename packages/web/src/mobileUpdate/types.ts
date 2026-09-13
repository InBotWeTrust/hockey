export interface UnsignedAndroidReleaseManifest {
  versionName: string;
  latestVersionCode: number;
  minimumSupportedVersionCode: number;
  apkUrl: string;
  apkSizeBytes: number;
  apkSha256: string;
  releaseNotes: string;
  publishedAt: string;
  keyId: string;
}

export interface SignedAndroidReleaseManifest extends UnsignedAndroidReleaseManifest {
  signature: string;
}

export type UpdatePolicy = 'current' | 'optional' | 'mandatory';
