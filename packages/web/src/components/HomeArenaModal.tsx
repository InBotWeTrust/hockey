import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { ApiError } from '../api/apiFetch.js';
import { selectHomeArena, type HomeArena } from '../api/arenas.js';

const GENERIC_HOME_ARENA_ERROR = 'Не удалось выполнить запрос. Попробуйте ещё раз.';
const FOCUSABLE_SELECTOR =
  'button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])';

function safeErrorMessage(error: Error): string {
  return error instanceof ApiError ? error.message : GENERIC_HOME_ARENA_ERROR;
}

function enabledFocusableElements(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

export function HomeArenaModal({
  arenas,
  selectedArena,
  onSaved,
  onClose,
}: {
  arenas: HomeArena[];
  selectedArena: HomeArena;
  onSaved: (arena: HomeArena) => void;
  onClose: () => void;
}): JSX.Element {
  const [selectedId, setSelectedId] = useState<string | null>(selectedArena.selection_id);
  const dialogRef = useRef<HTMLElement | null>(null);
  const selection = useMutation({
    mutationFn: () => selectHomeArena(selectedId),
    onSuccess: ({ selected_arena }) => {
      onSaved(selected_arena);
      onClose();
    },
  });

  function selectDraft(nextId: string | null): void {
    selection.reset();
    setSelectedId(nextId);
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;

    const selectedRadio = dialog.querySelector<HTMLInputElement>(
      'input[type="radio"]:checked:not(:disabled)',
    );
    (selectedRadio ?? enabledFocusableElements(dialog)[0])?.focus();
  }, []);

  function handleDialogKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;

    const dialog = dialogRef.current;
    if (dialog === null) return;
    const focusable = enabledFocusableElements(dialog);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (first === undefined || last === undefined) return;

    const activeElement = document.activeElement;
    if (event.shiftKey && (activeElement === first || !dialog.contains(activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (activeElement === last || !dialog.contains(activeElement))) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 420 }}>
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="home-arena-modal-title"
        className="modal-card home-arena-modal-card"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleDialogKeyDown}
      >
        <button
          type="button"
          className="icon-btn home-arena-modal-close"
          aria-label="Закрыть"
          onClick={onClose}
        >
          <X size={15} />
        </button>
        <div className="home-arena-modal-header">
          <h2 id="home-arena-modal-title" className="modal-title">
            Домашняя площадка
          </h2>
          <p className="modal-copy">
            Выберите фон для домашней площадки. Доступны только уже открытые площадки.
          </p>
        </div>

        <fieldset
          className="home-arena-options"
          aria-label="Выбор домашней площадки"
          disabled={selection.isPending}
        >
          {arenas.map((arena) => {
            const selected = selectedId === arena.selection_id;
            return (
              <label key={arena.id} className="home-arena-option" data-no-drag-scroll="true">
                <input
                  type="radio"
                  name="home-arena"
                  checked={selected}
                  onChange={() => selectDraft(arena.selection_id)}
                />
                <img src={arena.thumbnail_url} alt="" />
                <span>{arena.title}</span>
              </label>
            );
          })}
        </fieldset>

        {selection.isError && (
          <p className="home-arena-modal-error" role="alert">
            {safeErrorMessage(selection.error)}
          </p>
        )}

        <div className="modal-actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Отмена
          </button>
          <button
            type="button"
            className="modal-primary btn btn--cta"
            disabled={selection.isPending}
            onClick={() => selection.mutate()}
          >
            {selection.isPending ? 'Сохраняем...' : 'Сохранить'}
          </button>
        </div>
      </section>
    </div>
  );
}
