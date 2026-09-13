import { useStore } from 'zustand';
import { androidUpdateStore } from '../mobileUpdate/store.js';
import { nativeUpdater } from '../mobileUpdate/nativeUpdater.js';

export function AndroidUpdateBanner(): JSX.Element | null {
  const state = useStore(androidUpdateStore);
  if (
    state.policy !== 'optional' ||
    state.manifest === null ||
    state.dismissedVersionCode === state.manifest.latestVersionCode
  )
    return null;
  const update = async () => {
    await state.download();
    if (androidUpdateStore.getState().status !== 'downloaded') return;
    if (await nativeUpdater.ensureInstallPermission()) await nativeUpdater.install();
  };
  return (
    <aside className="glass android-update-banner">
      <div>
        <strong>Доступно обновление {state.manifest.versionName}</strong>
        <span>{state.manifest.releaseNotes || 'Улучшения и исправления'}</span>
      </div>
      <div className="android-update-banner__actions">
        <button
          type="button"
          className="btn btn--ghost"
          disabled={state.status === 'downloading'}
          onClick={state.dismissOptional}
        >
          Позже
        </button>
        <button
          type="button"
          className="btn btn--cta"
          disabled={state.status === 'checking' || state.status === 'downloading'}
          onClick={() => void update()}
        >
          Обновить
        </button>
      </div>
    </aside>
  );
}
