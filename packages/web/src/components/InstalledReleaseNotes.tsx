import { useState } from 'react';
import releaseNotes from '../../release-notes.json';
import { isNativeAndroid } from '../platform/runtime.js';
import { AccessibleModal } from './AccessibleModal.js';
import { ReleaseNotesDisclosure } from './ReleaseNotesDisclosure.js';

const SEEN_RELEASE_KEY = 'hockey.release-notes.seen';

export function InstalledReleaseNotes() {
  const releaseId = import.meta.env.VITE_RELEASE_ID || JSON.stringify(releaseNotes.items);
  const [open, setOpen] = useState(() => {
    if (!isNativeAndroid() && !navigator.serviceWorker?.controller) return false;
    try { return localStorage.getItem(SEEN_RELEASE_KEY) !== releaseId; }
    catch { return true; }
  });
  const close = () => {
    try { localStorage.setItem(SEEN_RELEASE_KEY, releaseId); }
    catch { /* Keep the acknowledgement for this mount when storage is unavailable. */ }
    setOpen(false);
  };
  if (!open) return null;
  return (
    <AccessibleModal title="Приложение обновлено" onRequestClose={close}
      cardStyle={{ maxHeight: 'calc(100dvh - 40px)', overflowY: 'auto' }}>
      <ReleaseNotesDisclosure items={releaseNotes.items} initiallyExpanded />
      <div className="modal-actions">
        <button type="button" className="modal-primary btn--cta" onClick={close}>Продолжить</button>
      </div>
    </AccessibleModal>
  );
}
