import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HomeArena } from '../api/arenas.js';
import { HomeArenaModal } from './HomeArenaModal.js';

const defaultArena: HomeArena = {
  id: 'default-arena',
  selection_id: null,
  slug: 'default',
  title: 'По умолчанию',
  artwork_url: '/arenas/default.webp',
  thumbnail_url: '/arenas/default-thumb.webp',
};

const beachArena: HomeArena = {
  id: 'beach-arena',
  selection_id: 'a1e80a1d-5b27-470f-8e4d-2102b1c10222',
  slug: 'beach',
  title: 'Пляж',
  artwork_url: '/arenas/beach.webp',
  thumbnail_url: '/arenas/beach-thumb.webp',
};

function renderModal({
  selectedArena = defaultArena,
  onSaved = vi.fn(),
  onClose = vi.fn(),
}: {
  selectedArena?: HomeArena;
  onSaved?: (arena: HomeArena) => void;
  onClose?: () => void;
} = {}): { onSaved: (arena: HomeArena) => void; onClose: () => void } {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <HomeArenaModal
        arenas={[defaultArena, beachArena]}
        selectedArena={selectedArena}
        onSaved={onSaved}
        onClose={onClose}
      />
    </QueryClientProvider>,
  );
  return { onSaved, onClose };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('HomeArenaModal', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps the selected default option on null and offers only the supplied earned arenas', () => {
    // Break caught: deriving choices from a bonus catalog would expose unavailable themes.
    renderModal();

    const dialog = screen.getByRole('dialog', { name: 'Домашняя площадка' });
    expect(within(dialog).getByRole('radio', { name: 'По умолчанию' })).toBeChecked();
    expect(within(dialog).getByRole('radio', { name: 'Пляж' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('radio', { name: 'Космос' })).not.toBeInTheDocument();
  });

  it('saves a local radio draft only after the server confirms the selected arena', async () => {
    // Break caught: an optimistic close or preview could display an arena the server rejected.
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(json({ selected_arena: beachArena }));
    const { onSaved, onClose } = renderModal();

    fireEvent.click(screen.getByRole('radio', { name: 'Пляж' }));
    expect(screen.getByRole('radio', { name: 'Пляж' })).toBeChecked();
    expect(fetchSpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(beachArena));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/me/home-arena',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ arena_theme_id: beachArena.selection_id }),
      }),
    );
  });

  it('keeps the dialog open and does not leak an unknown server error on rejection', async () => {
    // Break caught: a rejected PATCH must not close the selector or disclose arbitrary server text.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      json({ error: { code: 'unexpected', message: 'database password leaked' } }, 500),
    );
    const { onSaved, onClose } = renderModal();

    fireEvent.click(screen.getByRole('radio', { name: 'Пляж' }));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось выполнить запрос. Попробуйте ещё раз.',
    );
    expect(screen.getByRole('dialog', { name: 'Домашняя площадка' })).toBeInTheDocument();
    expect(screen.queryByText('database password leaked')).not.toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('focuses the selected option and wraps Tab in both directions', async () => {
    // Break caught: keyboard users could start outside the dialog or tab into the locker behind it.
    renderModal();

    const selectedRadio = screen.getByRole('radio', { name: 'По умолчанию' });
    await waitFor(() => expect(selectedRadio).toHaveFocus());

    const closeButton = screen.getByRole('button', { name: 'Закрыть' });
    const saveButton = screen.getByRole('button', { name: 'Сохранить' });
    saveButton.focus();
    fireEvent.keyDown(saveButton, { key: 'Tab' });
    expect(closeButton).toHaveFocus();

    fireEvent.keyDown(closeButton, { key: 'Tab', shiftKey: true });
    expect(saveButton).toHaveFocus();
  });

  it('closes on Escape without sending a selection request', async () => {
    // Break caught: Escape must be a safe close path, not an implicit save.
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { onClose } = renderModal();
    const selectedRadio = screen.getByRole('radio', { name: 'По умолчанию' });

    await waitFor(() => expect(selectedRadio).toHaveFocus());
    fireEvent.keyDown(selectedRadio, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not retain an Escape close handler after an earlier modal unmounts', async () => {
    // Break caught: a leaked document listener would close the stale modal callback too.
    const firstOnClose = vi.fn();
    const secondOnClose = vi.fn();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <HomeArenaModal
          arenas={[defaultArena, beachArena]}
          selectedArena={defaultArena}
          onSaved={() => {}}
          onClose={firstOnClose}
        />
      </QueryClientProvider>,
    );

    rerender(<QueryClientProvider client={queryClient} />);
    rerender(
      <QueryClientProvider client={queryClient}>
        <HomeArenaModal
          arenas={[defaultArena, beachArena]}
          selectedArena={defaultArena}
          onSaved={() => {}}
          onClose={secondOnClose}
        />
      </QueryClientProvider>,
    );

    const selectedRadio = screen.getByRole('radio', { name: 'По умолчанию' });
    await waitFor(() => expect(selectedRadio).toHaveFocus());
    fireEvent.keyDown(selectedRadio, { key: 'Escape' });

    expect(firstOnClose).not.toHaveBeenCalled();
    expect(secondOnClose).toHaveBeenCalledTimes(1);
  });

  it('wraps pending-save focus around enabled controls without issuing a second request', async () => {
    // Break caught: disabled draft controls could break the trap or Escape could submit a duplicate PATCH.
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => new Promise<Response>(() => {}));
    const { onClose } = renderModal();

    fireEvent.click(screen.getByRole('radio', { name: 'Пляж' }));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    const cancelButton = screen.getByRole('button', { name: 'Отмена' });
    const closeButton = screen.getByRole('button', { name: 'Закрыть' });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Сохраняем...' })).toBeDisabled(),
    );

    cancelButton.focus();
    fireEvent.keyDown(cancelButton, { key: 'Tab' });
    expect(closeButton).toHaveFocus();
    fireEvent.keyDown(closeButton, { key: 'Tab', shiftKey: true });
    expect(cancelButton).toHaveFocus();

    fireEvent.keyDown(cancelButton, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('cancels a pending save without issuing a second request', async () => {
    // Break caught: Cancel while pending must only close and never start another PATCH.
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => new Promise<Response>(() => {}));
    const { onClose } = renderModal();

    fireEvent.click(screen.getByRole('radio', { name: 'Пляж' }));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Сохраняем...' })).toBeDisabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
