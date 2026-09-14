import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { isNativeAndroid } from '../platform/runtime.js';
import { androidUpdateStore } from '../mobileUpdate/store.js';
import { nativeUpdater } from '../mobileUpdate/nativeUpdater.js';

function isAndroidBrowser(): boolean {
  return !isNativeAndroid() && /Android/i.test(navigator.userAgent);
}

async function updateNativeApp(): Promise<void> {
  await androidUpdateStore.getState().download();
  if (androidUpdateStore.getState().status !== 'downloaded') return;
  if (await nativeUpdater.ensureInstallPermission()) await nativeUpdater.install();
}

export function AndroidAppCard(): JSX.Element {
  const state = useStore(androidUpdateStore);
  const native = isNativeAndroid();
  const androidBrowser = isAndroidBrowser();
  const [browserReleaseAvailable, setBrowserReleaseAvailable] = useState<boolean | null>(null);
  const outdated = state.policy === 'optional' || state.policy === 'mandatory';

  useEffect(() => {
    if (!androidBrowser) return;
    const controller = new AbortController();
    void fetch('/api/mobile/android/release', {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
      .then((response) => setBrowserReleaseAvailable(response.ok))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setBrowserReleaseAvailable(false);
        }
      });
    return () => controller.abort();
  }, [androidBrowser]);

  return (
    <section className="glass android-app-card" aria-labelledby="android-app-card-title">
      <div>
        <h3 id="android-app-card-title">Приложение для Android</h3>
        <p>
          {native
            ? `Установлена ${state.installedVersionName ?? '—'}${state.manifest ? ` · актуальная ${state.manifest.versionName}` : ''}`
            : 'Установите игру на телефон и получайте мобильные уведомления.'}
        </p>
      </div>
      {native ? (
        <button
          type="button"
          className="btn btn--cta"
          disabled={state.status === 'checking' || state.status === 'downloading'}
          onClick={() => void (outdated ? updateNativeApp() : state.check())}
        >
          {outdated ? 'Обновить' : 'Проверить обновления'}
        </button>
      ) : androidBrowser ? (
        browserReleaseAvailable ? (
          <a
            className="btn btn--cta android-app-card__action"
            href="/api/mobile/android/download"
          >
            Скачать
          </a>
        ) : (
          <button
            type="button"
            className="btn btn--cta android-app-card__action"
            disabled
          >
            {browserReleaseAvailable === null ? 'Проверяем…' : 'Пока недоступно'}
          </button>
        )
      ) : (
        <span className="android-app-card__note">Доступно для Android</span>
      )}
    </section>
  );
}
