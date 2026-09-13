import type { UpdatePolicy } from './types.js';

const MAX_VERSION_CODE = 2_100_000_000;

function validVersion(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0 && value <= MAX_VERSION_CODE;
}

export function resolveUpdatePolicy(
  installedVersionCode: number,
  manifest: { latestVersionCode: number; minimumSupportedVersionCode: number },
): UpdatePolicy {
  if (
    !validVersion(installedVersionCode) ||
    !validVersion(manifest.latestVersionCode) ||
    !validVersion(manifest.minimumSupportedVersionCode) ||
    manifest.minimumSupportedVersionCode > manifest.latestVersionCode
  ) {
    throw new Error('Invalid Android version policy');
  }
  if (installedVersionCode < manifest.minimumSupportedVersionCode) return 'mandatory';
  if (installedVersionCode < manifest.latestVersionCode) return 'optional';
  return 'current';
}
