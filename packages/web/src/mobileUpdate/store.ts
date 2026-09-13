import { createStore, type StoreApi } from 'zustand/vanilla';
import { getApiBaseUrl, isNativeAndroid } from '../platform/runtime.js';
import { fetchVerifiedManifest, verifyReleaseManifest } from './manifest.js';
import { nativeUpdater } from './nativeUpdater.js';
import type { SignedAndroidReleaseManifest, UpdatePolicy } from './types.js';
import { resolveUpdatePolicy } from './versionPolicy.js';

const CACHE_KEY = 'hockey.androidUpdate.verifiedManifest.v1';
const DISMISSED_KEY = 'hockey.androidUpdate.dismissedVersion.v1';
const CHECK_INTERVAL_MS = 5 * 60_000;
const REQUEST_TIMEOUT_MS = 8_000;
export const ANDROID_MANIFEST_PUBLIC_KEYS = {
  'android-manifest-640cae20c448426f':
    'MCowBQYDK2VwAyEAouJVfx/XA7gg2z0RaxdS3hzR+9+Glpfu6p43uF//wAM=',
} as const;

export interface AndroidUpdateState {
  status: 'idle' | 'checking' | 'ready' | 'downloading' | 'downloaded' | 'error';
  manifest: SignedAndroidReleaseManifest | null;
  policy: UpdatePolicy | null;
  progress: number;
  error: string | null;
  installedVersionCode: number | null;
  installedVersionName: string | null;
  dismissedVersionCode: number | null;
  check(): Promise<void>;
  dismissOptional(): void;
  download(): Promise<void>;
}

interface Dependencies {
  fetchManifest(): Promise<SignedAndroidReleaseManifest>;
  getInstalledVersion(): Promise<{ versionCode: number; versionName: string }>;
  loadCachedManifest?(): Promise<SignedAndroidReleaseManifest | null>;
}

function readDismissed(): number | null {
  const value = Number(localStorage.getItem(DISMISSED_KEY));
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export function createAndroidUpdateStore(dependencies: Dependencies): StoreApi<AndroidUpdateState> {
  let inFlight: Promise<void> | null = null;
  let downloadInFlight: Promise<void> | null = null;
  return createStore<AndroidUpdateState>((set, get) => ({
    status: 'idle',
    manifest: null,
    policy: null,
    progress: 0,
    error: null,
    installedVersionCode: null,
    installedVersionName: null,
    dismissedVersionCode: readDismissed(),
    async check() {
      if (inFlight !== null) return inFlight;
      inFlight = (async () => {
        set({ status: 'checking', error: null });
        try {
          const installed = await dependencies.getInstalledVersion();
          let manifest: SignedAndroidReleaseManifest;
          try {
            manifest = await dependencies.fetchManifest();
          } catch (networkError) {
            const cached = await dependencies.loadCachedManifest?.();
            if (cached === null || cached === undefined) throw networkError;
            manifest = cached;
          }
          const current = get().manifest;
          if (current !== null && manifest.latestVersionCode < current.latestVersionCode) {
            set({ status: 'ready' });
            return;
          }
          const policy = resolveUpdatePolicy(installed.versionCode, manifest);
          localStorage.setItem(CACHE_KEY, JSON.stringify(manifest));
          const dismissedVersionCode =
            get().dismissedVersionCode === manifest.latestVersionCode
              ? get().dismissedVersionCode
              : null;
          if (dismissedVersionCode === null) localStorage.removeItem(DISMISSED_KEY);
          set({
            status: 'ready',
            manifest,
            policy,
            installedVersionCode: installed.versionCode,
            installedVersionName: installed.versionName,
            dismissedVersionCode,
          });
        } catch (error) {
          set({ status: get().manifest === null ? 'error' : 'ready', error: String(error) });
        } finally {
          inFlight = null;
        }
      })();
      return inFlight;
    },
    dismissOptional() {
      const { manifest, policy } = get();
      if (manifest === null || policy !== 'optional') return;
      localStorage.setItem(DISMISSED_KEY, String(manifest.latestVersionCode));
      set({ dismissedVersionCode: manifest.latestVersionCode });
    },
    async download() {
      if (downloadInFlight !== null) return downloadInFlight;
      const manifest = get().manifest;
      if (manifest === null) return;
      downloadInFlight = (async () => {
        set({ status: 'downloading', progress: 0, error: null });
        let listener: { remove(): Promise<void> } | null = null;
        try {
          listener = await nativeUpdater.onProgress(({ bytesDownloaded, totalBytes }) => {
            set({
              progress: totalBytes > 0 ? Math.floor((bytesDownloaded / totalBytes) * 100) : 0,
            });
          });
          await nativeUpdater.download(manifest);
          set({ status: 'downloaded', progress: 100 });
        } catch (error) {
          set({ status: 'error', error: String(error) });
        } finally {
          try {
            await listener?.remove();
          } catch {
            // Listener cleanup must not replace the download outcome.
          }
          downloadInFlight = null;
        }
      })();
      return downloadInFlight;
    },
  }));
}

async function fetchProductionManifest(): Promise<SignedAndroidReleaseManifest> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetchVerifiedManifest(
      `${getApiBaseUrl()}/mobile/android/release`,
      ANDROID_MANIFEST_PUBLIC_KEYS,
      controller.signal,
    );
  } finally {
    window.clearTimeout(timeout);
  }
}

async function loadCachedProductionManifest(): Promise<SignedAndroidReleaseManifest | null> {
  const raw = localStorage.getItem(CACHE_KEY);
  if (raw === null) return null;
  try {
    return await verifyReleaseManifest(JSON.parse(raw), ANDROID_MANIFEST_PUBLIC_KEYS);
  } catch {
    localStorage.removeItem(CACHE_KEY);
    return null;
  }
}

export const androidUpdateStore = createAndroidUpdateStore({
  fetchManifest: fetchProductionManifest,
  getInstalledVersion: nativeUpdater.getInstalledVersion,
  loadCachedManifest: loadCachedProductionManifest,
});

export function initializeAndroidUpdateChecks(): () => void {
  if (!isNativeAndroid()) return () => undefined;
  void androidUpdateStore.getState().check();
  const interval = window.setInterval(
    () => void androidUpdateStore.getState().check(),
    CHECK_INTERVAL_MS,
  );
  const onResume = () => {
    if (document.visibilityState === 'visible') void androidUpdateStore.getState().check();
  };
  document.addEventListener('visibilitychange', onResume);
  let disposed = false;
  let appListener: { remove(): Promise<void> } | null = null;
  const appPlugin = (
    globalThis as typeof globalThis & {
      Capacitor?: {
        Plugins?: {
          App?: {
            addListener(
              event: 'appStateChange',
              callback: (state: { isActive: boolean }) => void,
            ): Promise<{ remove(): Promise<void> }>;
          };
        };
      };
    }
  ).Capacitor?.Plugins?.App;
  void appPlugin
    ?.addListener('appStateChange', ({ isActive }) => {
      if (isActive) void androidUpdateStore.getState().check();
    })
    .then((listener) => {
      if (disposed) void listener.remove();
      else appListener = listener;
    })
    .catch(() => undefined);
  return () => {
    disposed = true;
    window.clearInterval(interval);
    document.removeEventListener('visibilitychange', onResume);
    void appListener?.remove();
  };
}
