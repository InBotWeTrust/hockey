import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { ApiError } from '../api/apiFetch.js';
import { selectHomeArena, type HomeArena } from '../api/arenas.js';
import { AccessibleModal } from './AccessibleModal.js';

const GENERIC_HOME_ARENA_ERROR = 'Не удалось выполнить запрос. Попробуйте ещё раз.';

function safeErrorMessage(error: Error): string {
  return error instanceof ApiError ? error.message : GENERIC_HOME_ARENA_ERROR;
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
  const selectedRadioRef = useRef<HTMLInputElement | null>(null);
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

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      activeRequestRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (selection.isPending) {
      savingStatusRef.current?.focus();
      return;
    }
    if (selection.isError) {
      selectedRadioRef.current?.focus();
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

  return (
    <AccessibleModal
      title="Домашняя площадка"
      copy="Выберите фон для домашней площадки. Доступны только уже открытые площадки."
      onRequestClose={requestClose}
      closeBlocked={selection.isPending}
      initialFocusRef={selectedRadioRef}
      cardClassName="home-arena-modal-card"
      backdropStyle={{ zIndex: 420 }}
      headerAction={
        <button
          type="button"
          className="icon-btn"
          aria-label="Закрыть"
          disabled={selection.isPending}
          onClick={requestClose}
        >
          <X size={15} />
        </button>
      }
    >
      <div style={{ display: 'grid', gap: 14 }}>
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
                  ref={selected ? selectedRadioRef : undefined}
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
      </div>
    </AccessibleModal>
  );
}
