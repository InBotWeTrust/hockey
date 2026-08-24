import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { AccessibleModal } from './AccessibleModal.js';

export interface SettingsSheetProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
}

export function SettingsSheet({
  open,
  onClose,
  children,
  title = 'Настройки',
}: SettingsSheetProps): JSX.Element | null {
  if (!open) return null;

  return (
    <AccessibleModal
      open
      title={title}
      onRequestClose={() => onClose()}
      cardStyle={{ width: 'min(380px, calc(100vw - 32px))' }}
      headerAction={
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">
          <X size={16} />
        </button>
      }
    >
      {children}
    </AccessibleModal>
  );
}
