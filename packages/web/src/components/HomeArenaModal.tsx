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
  const savingStatusRef = useRef<HTMLParagraphElement | null>(null);
  const mountedRef = useRef(true);
  const activeRequestRef = useRef<number | null>(null);
  const requestSequenceRef = useRef(0);
  const selection = useMutation({
    mutationFn: ({
      selectedId: requestSelectedId,
    }: {
      selectedId: string | null;
      requestId: number;
    }) => selectHomeArena(requestSelectedId),
    onSuccess: ({ selected_arena }, request) => {
      if (!mountedRef.current || activeRequestRef.current !== request.requestId) return;
      activeRequestRef.current = null;
      onSaved(selected_arena);
      onClose();
    },
  });

  function selectDraft(nextId: string | null): void {
    if (selection.isPending) return;
    selection.reset();
    setSelectedId(nextId);
  }

  function focusSelectedOrFirstControl(): void {
    const dialog = dialogRef.current;
    if (dialog === null) return;

    const selectedRadio = dialog.querySelector<HTMLInputElement>(
      'input[type="radio"]:checked:not(:disabled)',
    );
    (selectedRadio ?? enabledFocusableElements(dialog)[0])?.focus();
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      activeRequestRef.current = null;
    };
  }, []);

  useEffect(() => {
    focusSelectedOrFirstControl();
  }, []);

  useEffect(() => {
    if (selection.isPending) {
      savingStatusRef.current?.focus();
      return;
    }
    if (selection.isError) {
      focusSelectedOrFirstControl();
    }
  }, [selection.isError, selection.isPending]);

  function requestClose(): void {
    if (!selection.isPending) onClose();
  }

  function saveSelection(): void {
    if (selection.isPending) return;
    const requestId = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestId;
    activeRequestRef.current = requestId;
    selection.mutate({ selectedId, requestId });
  }

  function handleDialogKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      requestClose();
      return;
    }
    if (event.key !== 'Tab') return;

    const dialog = dialogRef.current;
    if (dialog === null) return;
    const focusable = enabledFocusableElements(dialog);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (first === undefined || last === undefined) return;

    const activeIndex = focusable.indexOf(document.activeElement as HTMLElement);
    if (event.shiftKey && activeIndex <= 0) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (activeIndex === -1 || activeIndex >= focusable.length - 1)) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="modal-backdrop" onClick={requestClose} style={{ zIndex: 420 }}>
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
          disabled={selection.isPending}
          onClick={requestClose}
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

        {selection.isPending && (
          <p ref={savingStatusRef} className="home-arena-modal-status" role="status" tabIndex={0}>
            Сохраняем выбор…
          </p>
        )}

        <div className="modal-actions">
          <button
            type="button"
            className="btn btn--ghost"
            disabled={selection.isPending}
            onClick={requestClose}
          >
            Отмена
          </button>
          <button
            type="button"
            className="modal-primary btn btn--cta"
            disabled={selection.isPending}
            onClick={saveSelection}
          >
            {selection.isPending ? 'Сохраняем...' : 'Сохранить'}
          </button>
        </div>
      </section>
    </div>
  );
}
