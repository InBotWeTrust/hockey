import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pwaRegisterMock } from '../test/pwaRegisterMock.js';
import { UpdatePrompt } from './UpdatePrompt.js';
import { AccessibleModal } from './AccessibleModal.js';

describe('UpdatePrompt', () => {
  beforeEach(() => {
    pwaRegisterMock.reset();
    localStorage.removeItem('hockey.release-notes.seen');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it.each([null, 'previous-release'])('shows no modal after updating with stored release %s', seenRelease => {
    vi.stubGlobal('navigator', { serviceWorker: { controller: {} } });
    if (seenRelease) localStorage.setItem('hockey.release-notes.seen', seenRelease);
    render(<UpdatePrompt />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Что нового' })).not.toBeInTheDocument();
  });

  it('does not show an installed-update receipt on a fresh browser visit', () => {
    vi.stubGlobal('navigator', { serviceWorker: { controller: null } });
    render(<UpdatePrompt />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  function registerNotes(items?: string[]) {
    vi.stubGlobal('MessageChannel', class {
      port1 = { onmessage: null as ((event: { data: unknown }) => void) | null, close: vi.fn() };
      port2 = { close: vi.fn(), postMessage: (data: unknown) => this.port1.onmessage?.({ data }) };
    });
    const postMessage = vi.fn((_message: unknown, ports: MessagePort[]) => {
      if (items) ports[0]!.postMessage({ items });
    });
    pwaRegisterMock.options?.onRegisteredSW?.('/sw.js', {
      waiting: { postMessage },
      update: vi.fn(() => Promise.resolve()),
    } as unknown as ServiceWorkerRegistration);
    return postMessage;
  }

  it('expands the notes supplied by the waiting update and collapses them', async () => {
    pwaRegisterMock.needRefresh = true;
    render(<UpdatePrompt />);
    const request = registerNotes(['Исправлены приглашения в игры бара.', 'Улучшены правила морского боя.']);
    const toggle = screen.getByRole('button', { name: 'Что нового' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(request).not.toHaveBeenCalled();
    fireEvent.click(toggle);
    expect(await screen.findByText('Исправлены приглашения в игры бара.')).toBeVisible();
    expect(screen.getByText('Улучшены правила морского боя.')).toBeVisible();
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(request).toHaveBeenCalledWith({ type: 'HOCKEY_RELEASE_NOTES' }, expect.any(Array));
    fireEvent.click(toggle);
    expect(screen.queryByText('Улучшены правила морского боя.')).not.toBeInTheDocument();
    expect(pwaRegisterMock.updateServiceWorkerCalls).toEqual([]);
  });

  it('keeps updating available when an older worker cannot supply notes', async () => {
    vi.useFakeTimers();
    pwaRegisterMock.needRefresh = true;
    render(<UpdatePrompt />);
    registerNotes();
    fireEvent.click(screen.getByRole('button', { name: 'Что нового' }));
    await act(async () => { vi.advanceTimersByTime(5000); });
    expect(screen.getByText('Описание обновления недоступно.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Обновить приложение' })).toBeEnabled();
    registerNotes(['Описание загружено.']);
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(screen.getByText('Описание загружено.')).toBeVisible();
  });

  it('replaces the description when a newer waiting update arrives', async () => {
    pwaRegisterMock.needRefresh = true;
    render(<UpdatePrompt />);
    registerNotes(['Предыдущее описание.']);
    fireEvent.click(screen.getByRole('button', { name: 'Что нового' }));
    expect(screen.getByText('Предыдущее описание.')).toBeVisible();
    registerNotes(['Новое описание.']);
    await act(async () => { pwaRegisterMock.options?.onNeedRefresh?.(); });
    expect(screen.getByText('Новое описание.')).toBeVisible();
    expect(screen.queryByText('Предыдущее описание.')).not.toBeInTheDocument();
  });

  it('cycles keyboard focus through the update and notes controls', () => {
    pwaRegisterMock.needRefresh = true;
    render(<UpdatePrompt />);
    const update = screen.getByRole('button', { name: 'Обновить приложение' });
    const notes = screen.getByRole('button', { name: 'Что нового' });
    fireEvent.keyDown(update, { key: 'Tab' });
    expect(notes).toHaveFocus();
    fireEvent.keyDown(notes, { key: 'Tab', shiftKey: true });
    expect(update).toHaveFocus();
  });

  it('renders a manual update dialog and asks the service worker to update', () => {
    pwaRegisterMock.needRefresh = true;

    render(<UpdatePrompt />);
    pwaRegisterMock.options?.onRegisteredSW?.('/sw.js', {
      waiting: {} as ServiceWorker,
      update: vi.fn(() => Promise.resolve()),
    } as unknown as ServiceWorkerRegistration);

    expect(screen.getByRole('dialog', { name: 'Доступно обновление' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Обновить приложение' }));

    expect(pwaRegisterMock.updateServiceWorkerCalls).toEqual([true]);
  });

  it('keeps the update button outside the inert app background when a game modal is open', () => {
    pwaRegisterMock.needRefresh = true;

    const { container } = render(
      <>
        <AccessibleModal title="Игра пройдена" onClose={() => undefined}>
          Результат
        </AccessibleModal>
        <UpdatePrompt />
      </>,
    );

    const updateDialog = screen.getByRole('dialog', { name: 'Доступно обновление' });
    expect(container).toHaveAttribute('inert');
    expect(updateDialog.closest('[inert]')).toBeNull();
  });

  it('focuses and keeps keyboard focus on the update action above a game modal', () => {
    pwaRegisterMock.needRefresh = true;

    render(
      <>
        <AccessibleModal title="Игра пройдена" onClose={() => undefined}>
          <button type="button">К бонусным играм</button>
        </AccessibleModal>
        <UpdatePrompt />
      </>,
    );

    const updateButton = screen.getByRole('button', { name: 'Обновить приложение' });
    expect(updateButton).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(updateButton).toHaveFocus();
  });

  it('keeps the update action interactive if a game modal opens afterward', () => {
    pwaRegisterMock.needRefresh = true;
    const { rerender } = render(<UpdatePrompt />);
    const updateButton = screen.getByRole('button', { name: 'Обновить приложение' });

    rerender(
      <>
        <UpdatePrompt />
        <AccessibleModal title="Игра пройдена" onClose={() => undefined}>
          <button type="button">К бонусным играм</button>
        </AccessibleModal>
      </>,
    );

    expect(updateButton.closest('[inert]')).toBeNull();
    expect(updateButton).toHaveFocus();
  });

  it('reloads when the waiting worker has already disappeared', () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { reload });
    pwaRegisterMock.needRefresh = true;

    render(<UpdatePrompt />);
    pwaRegisterMock.options?.onRegisteredSW?.('/sw.js', {
      waiting: null,
      update: vi.fn(() => Promise.resolve()),
    } as unknown as ServiceWorkerRegistration);
    fireEvent.click(screen.getByRole('button', { name: 'Обновить приложение' }));

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads if a waiting worker does not take control after the update request', () => {
    vi.useFakeTimers();
    const reload = vi.fn();
    vi.stubGlobal('location', { reload });
    pwaRegisterMock.needRefresh = true;

    render(<UpdatePrompt />);
    pwaRegisterMock.options?.onRegisteredSW?.('/sw.js', {
      waiting: {} as ServiceWorker,
      update: vi.fn(() => Promise.resolve()),
    } as unknown as ServiceWorkerRegistration);
    fireEvent.click(screen.getByRole('button', { name: 'Обновить приложение' }));

    expect(reload).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5_000);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('checks for app updates after service worker registration', () => {
    vi.useFakeTimers();
    const registration = {
      update: vi.fn(() => Promise.resolve()),
    } as unknown as ServiceWorkerRegistration;

    render(<UpdatePrompt />);
    pwaRegisterMock.options?.onRegisteredSW?.('/sw.js', registration);

    expect(registration.update).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(5 * 60 * 1000);

    expect(registration.update).toHaveBeenCalledTimes(2);
  });
});
