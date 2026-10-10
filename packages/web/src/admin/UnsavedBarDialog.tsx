import { X } from 'lucide-react';
import { AccessibleModal } from '../components/AccessibleModal.js';
export function UnsavedBarDialog({
  title,
  discardLabel,
  onCancel,
  onDiscard,
}: {
  title: string;
  discardLabel: string;
  onCancel: () => void;
  onDiscard: () => void;
}) {
  return (
    <AccessibleModal
      title={title}
      onClose={onCancel}
      headerAction={
        <button className="icon-btn" aria-label="Закрыть" onClick={onCancel}>
          <X size={16} />
        </button>
      }
    >
      <p className="modal-copy">Несохранённые изменения расстановки будут отменены.</p>
      <div className="modal-actions">
        <button className="btn btn--ghost" onClick={onCancel}>
          Оставить правки
        </button>
        <button className="modal-primary btn btn--cta" onClick={onDiscard}>
          {discardLabel}
        </button>
      </div>
    </AccessibleModal>
  );
}
