import { useStore } from 'zustand';
import { AccessibleModal } from './AccessibleModal.js';
import { androidUpdateStore } from '../mobileUpdate/store.js';
import { nativeUpdater } from '../mobileUpdate/nativeUpdater.js';

export function MandatoryAndroidUpdateModal(): JSX.Element | null {
  const state = useStore(androidUpdateStore);
  if (state.policy !== 'mandatory' || state.manifest === null) return null;
  const update = async () => {
    if (state.status !== 'downloaded') await state.download();
    if (androidUpdateStore.getState().status !== 'downloaded') return;
    if (await nativeUpdater.ensureInstallPermission()) await nativeUpdater.install();
  };
  return (
    <AccessibleModal
      title="Нужно обновить приложение"
      copy={`Для продолжения установите версию ${state.manifest.versionName}.`}
      closeBlocked
    >
      {state.status === 'downloading' && <p>Загрузка: {state.progress}%</p>}
      {state.error !== null && <p className="modal-error">Не удалось скачать обновление</p>}
      <div className="modal-actions">
        <button
          type="button"
          className="modal-primary btn btn--cta"
          disabled={state.status === 'checking' || state.status === 'downloading'}
          onClick={() => void update()}
        >
          {state.status === 'error' ? 'Попробовать снова' : 'Обновить'}
        </button>
      </div>
    </AccessibleModal>
  );
}
