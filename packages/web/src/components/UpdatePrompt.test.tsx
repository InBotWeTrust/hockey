import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pwaRegisterMock } from '../test/pwaRegisterMock.js';
import { UpdatePrompt } from './UpdatePrompt.js';
import { AccessibleModal } from './AccessibleModal.js';

describe('UpdatePrompt', () => {
  beforeEach(() => {
    pwaRegisterMock.reset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
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
