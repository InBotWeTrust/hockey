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
} = {}): { onSaved: (arena: HomeArena) => void; onClose: () => void; unmount: () => void } {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <HomeArenaModal
        arenas={[defaultArena, beachArena]}
        selectedArena={selectedArena}
        onSaved={onSaved}
        onClose={onClose}
      />
    </QueryClientProvider>,
  );
  return { onSaved, onClose, unmount: rendered.unmount };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function deferredResponse(): { promise: Promise<Response>; resolve: (response: Response) => void } {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return { promise, resolve };
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

  it('makes the page behind the modal inert while the selector is open', async () => {
    // Break caught: assistive technology and keyboard input must not reach the profile behind it.
    const background = document.createElement('main');
    background.setAttribute('aria-label', 'Профиль под модалкой');
    document.body.append(background);

    const { unmount } = renderModal();

    await waitFor(() => expect(background).toHaveAttribute('inert'));
    expect(background).toHaveAttribute('aria-hidden', 'true');

    unmount();
    expect(background).not.toHaveAttribute('inert');
    expect(background).not.toHaveAttribute('aria-hidden');
    background.remove();
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

  it('moves Save focus to the pending status and keeps Tab in the dialog', async () => {
    // Break caught: a disabled Save could retain focus and let Tab escape into the locker.
    const deferred = deferredResponse();
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => deferred.promise);
    renderModal();

    fireEvent.click(screen.getByRole('radio', { name: 'Пляж' }));
    const saveButton = screen.getByRole('button', { name: 'Сохранить' });
    saveButton.focus();
    fireEvent.click(saveButton);

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('Сохраняем выбор…');
    expect(status).toHaveFocus();
    expect(saveButton).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Закрыть' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Отмена' })).toBeDisabled();

    fireEvent.keyDown(status, { key: 'Tab' });
    expect(status).toHaveFocus();
    fireEvent.keyDown(status, { key: 'Tab', shiftKey: true });
    expect(status).toHaveFocus();

    const outside = document.createElement('button');
    document.body.append(outside);
    const dialog = screen.getByRole('dialog', { name: 'Домашняя площадка' });
    outside.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(status).toHaveFocus();
    outside.focus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(status).toHaveFocus();
    outside.remove();
  });

  it('does not close or send another request during a pending save', async () => {
    // Break caught: a pending request must not allow Escape, backdrop, close, or Cancel to dismiss it.
    const deferred = deferredResponse();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => deferred.promise);
    const { onClose } = renderModal();

    fireEvent.click(screen.getByRole('radio', { name: 'Пляж' }));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    const status = await screen.findByRole('status');

    fireEvent.keyDown(status, { key: 'Escape' });
    fireEvent.mouseDown(document.querySelector('.modal-backdrop') as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));

    expect(screen.getByRole('dialog', { name: 'Домашняя площадка' })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('ignores a late successful response after the modal unmounts', async () => {
    // Break caught: stale async success could update a new screen or steal focus after navigation.
    const deferred = deferredResponse();
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => deferred.promise);
    const { onSaved, onClose, unmount } = renderModal();
    const outside = document.createElement('button');
    document.body.append(outside);

    fireEvent.click(screen.getByRole('radio', { name: 'Пляж' }));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await screen.findByRole('status');
    outside.focus();
    unmount();
    deferred.resolve(json({ selected_arena: beachArena }));
    await Promise.resolve();
    await Promise.resolve();

    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(outside).toHaveFocus();
    outside.remove();
  });

  it('restores safe controls after a failed save', async () => {
    // Break caught: a failed save must not strand focus on stale status or leave the modal locked.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      json({ error: { code: 'unexpected', message: 'internal failure' } }, 500),
    );
    const { onClose } = renderModal();

    fireEvent.click(screen.getByRole('radio', { name: 'Пляж' }));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Пляж' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Закрыть' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Отмена' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
