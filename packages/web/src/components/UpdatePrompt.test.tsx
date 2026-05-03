import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pwaRegisterMock } from '../test/pwaRegisterMock.js';
import { UpdatePrompt } from './UpdatePrompt.js';

describe('UpdatePrompt', () => {
  beforeEach(() => {
    pwaRegisterMock.reset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders a manual update dialog and asks the service worker to update', () => {
    pwaRegisterMock.needRefresh = true;

    render(<UpdatePrompt />);

    expect(screen.getByRole('dialog', { name: 'Доступно обновление' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Обновить приложение' }));

    expect(pwaRegisterMock.updateServiceWorkerCalls).toEqual([true]);
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
