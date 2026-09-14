import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AndroidAppCard } from './AndroidAppCard.js';

vi.mock('../platform/runtime.js', () => ({ isNativeAndroid: () => false }));

describe('AndroidAppCard in an Android browser', () => {
  const originalUserAgent = navigator.userAgent;

  function useAndroidBrowser(): void {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Linux; Android 15)',
    });
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: originalUserAgent,
    });
  });

  it('shows the compact download action when a release is available', async () => {
    useAndroidBrowser();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

    render(<AndroidAppCard />);

    expect(screen.getByRole('heading', { name: 'Приложение для Android' })).toBeInTheDocument();
    expect(
      screen.getByText('Установите игру на телефон и получайте мобильные уведомления.'),
    ).toBeInTheDocument();
    const link = await screen.findByRole('link', { name: 'Скачать' });
    expect(link).toHaveAttribute('href', '/api/mobile/android/download');
    expect(link).toHaveClass('android-app-card__action');
  });

  it('does not navigate when no release has been published', async () => {
    useAndroidBrowser();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    render(<AndroidAppCard />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Пока недоступно' })).toBeDisabled();
    });
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
