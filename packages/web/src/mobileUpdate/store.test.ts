import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAndroidUpdateStore } from './store.js';
import { nativeUpdater } from './nativeUpdater.js';
import type { SignedAndroidReleaseManifest } from './types.js';

const manifest: SignedAndroidReleaseManifest = {
  versionName: '2.0',
  latestVersionCode: 2,
  minimumSupportedVersionCode: 2,
  apkUrl: 'https://ultimatehockey.ru/mobile/android/app-2.apk',
  apkSizeBytes: 42,
  apkSha256: 'a'.repeat(64),
  releaseNotes: '',
  publishedAt: '2026-09-13T12:00:00.000Z',
  keyId: 'test',
  signature: 'x',
};

describe('Android update store', () => {
  beforeEach(() => localStorage.clear());

  it('keeps an already verified mandatory gate after a network failure', async () => {
    const fetchManifest = vi
      .fn<[], Promise<SignedAndroidReleaseManifest>>()
      .mockResolvedValueOnce(manifest)
      .mockRejectedValueOnce(new Error('offline'));
    const store = createAndroidUpdateStore({
      fetchManifest,
      getInstalledVersion: async () => ({ versionCode: 1, versionName: '1.0' }),
    });
    await store.getState().check();
    expect(store.getState().policy).toBe('mandatory');
    await store.getState().check();
    expect(store.getState()).toMatchObject({ policy: 'mandatory', manifest });
  });

  it('dismisses only one optional release and shows the next release', async () => {
    const fetchManifest = vi
      .fn<[], Promise<SignedAndroidReleaseManifest>>()
      .mockResolvedValueOnce({ ...manifest, minimumSupportedVersionCode: 1 })
      .mockResolvedValueOnce({
        ...manifest,
        latestVersionCode: 3,
        minimumSupportedVersionCode: 1,
      });
    const store = createAndroidUpdateStore({
      fetchManifest,
      getInstalledVersion: async () => ({ versionCode: 1, versionName: '1.0' }),
    });
    await store.getState().check();
    store.getState().dismissOptional();
    expect(store.getState().dismissedVersionCode).toBe(2);
    await store.getState().check();
    expect(store.getState().dismissedVersionCode).toBeNull();
    expect(store.getState().policy).toBe('optional');
  });

  it('restores a verified cached mandatory release while offline', async () => {
    const store = createAndroidUpdateStore({
      fetchManifest: async () => {
        throw new Error('offline');
      },
      loadCachedManifest: async () => manifest,
      getInstalledVersion: async () => ({ versionCode: 1, versionName: '1.0' }),
    });
    await store.getState().check();
    expect(store.getState()).toMatchObject({ manifest, policy: 'mandatory', status: 'ready' });
  });

  it('coalesces overlapping checks', async () => {
    let resolve!: (value: SignedAndroidReleaseManifest) => void;
    const fetchManifest = vi.fn(
      () => new Promise<SignedAndroidReleaseManifest>((done) => (resolve = done)),
    );
    const store = createAndroidUpdateStore({
      fetchManifest,
      getInstalledVersion: async () => ({ versionCode: 1, versionName: '1.0' }),
    });
    const first = store.getState().check();
    const second = store.getState().check();
    await vi.waitFor(() => expect(fetchManifest).toHaveBeenCalledTimes(1));
    resolve(manifest);
    await Promise.all([first, second]);
    expect(fetchManifest).toHaveBeenCalledTimes(1);
  });

  it('leaves downloading state when progress listener registration fails', async () => {
    vi.spyOn(nativeUpdater, 'onProgress').mockRejectedValue(new Error('bridge unavailable'));
    const store = createAndroidUpdateStore({
      fetchManifest: async () => manifest,
      getInstalledVersion: async () => ({ versionCode: 1, versionName: '1.0' }),
    });
    await store.getState().check();
    await store.getState().download();
    expect(store.getState()).toMatchObject({ status: 'error', error: 'Error: bridge unavailable' });
  });
});
