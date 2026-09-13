interface ApkUpdaterPlugin {
  getInstalledVersion(): Promise<{ versionCode: number; versionName: string }>;
  downloadApk(options: {
    url: string;
    sizeBytes: number;
    sha256: string;
    versionCode: number;
  }): Promise<{ path: string }>;
  cancelDownload(): Promise<void>;
  canInstallPackages(): Promise<{ allowed: boolean }>;
  openInstallPermission(): Promise<void>;
  installDownloadedApk(): Promise<void>;
  addListener(
    event: 'downloadProgress',
    callback: (progress: { bytesDownloaded: number; totalBytes: number }) => void,
  ): Promise<{ remove(): Promise<void> }>;
}

function plugin(): ApkUpdaterPlugin {
  const value = (
    globalThis as typeof globalThis & {
      Capacitor?: { Plugins?: { ApkUpdater?: ApkUpdaterPlugin } };
    }
  ).Capacitor?.Plugins?.ApkUpdater;
  if (value === undefined) throw new Error('APK updater bridge is unavailable');
  return value;
}

export const nativeUpdater = {
  getInstalledVersion: () => plugin().getInstalledVersion(),
  download: (manifest: {
    apkUrl: string;
    apkSizeBytes: number;
    apkSha256: string;
    latestVersionCode: number;
  }) =>
    plugin().downloadApk({
      url: manifest.apkUrl,
      sizeBytes: manifest.apkSizeBytes,
      sha256: manifest.apkSha256,
      versionCode: manifest.latestVersionCode,
    }),
  cancelDownload: () => plugin().cancelDownload(),
  async ensureInstallPermission(): Promise<boolean> {
    if ((await plugin().canInstallPackages()).allowed) return true;
    await plugin().openInstallPermission();
    return false;
  },
  install: () => plugin().installDownloadedApk(),
  onProgress: (callback: (progress: { bytesDownloaded: number; totalBytes: number }) => void) =>
    plugin().addListener('downloadProgress', callback),
};
