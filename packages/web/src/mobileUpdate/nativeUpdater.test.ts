import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nativeUpdater } from './nativeUpdater.js';

describe('nativeUpdater', () => {
  const plugin = {
    getInstalledVersion: vi.fn(async () => ({ versionCode: 1, versionName: '1.0' })),
    downloadApk: vi.fn(async () => ({ path: 'updates/app.apk' })),
    cancelDownload: vi.fn(async () => undefined),
    canInstallPackages: vi.fn(async () => ({ allowed: false })),
    openInstallPermission: vi.fn(async () => undefined),
    installDownloadedApk: vi.fn(async () => undefined),
    addListener: vi.fn(async () => ({ remove: vi.fn(async () => undefined) })),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('Capacitor', { Plugins: { ApkUpdater: plugin } });
  });

  it('passes only verified download metadata to the native bridge', async () => {
    await nativeUpdater.download({
      apkUrl: 'https://ultimatehockey.ru/mobile/android/app-2.apk',
      apkSizeBytes: 42,
      apkSha256: 'a'.repeat(64),
      latestVersionCode: 2,
    });
    expect(plugin.downloadApk).toHaveBeenCalledWith({
      url: 'https://ultimatehockey.ru/mobile/android/app-2.apk',
      sizeBytes: 42,
      sha256: 'a'.repeat(64),
      versionCode: 2,
    });
  });

  it('opens package-source settings when installation is denied', async () => {
    await expect(nativeUpdater.ensureInstallPermission()).resolves.toBe(false);
    expect(plugin.openInstallPermission).toHaveBeenCalledTimes(1);
  });
});
