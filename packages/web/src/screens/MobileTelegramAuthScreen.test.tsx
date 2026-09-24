import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MobileTelegramAuthScreen } from './MobileTelegramAuthScreen.js';

type AuthCallback = (payload: Record<string, unknown>) => void;

describe('MobileTelegramAuthScreen', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubEnv('VITE_TELEGRAM_BOT_USERNAME', 'test_bot');
  });

  it('completes the browser login and follows only the server handoff URL', async () => {
    const navigateTo = vi.fn();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          redirectUrl: `https://ultimatehockey.ru/mobile/auth/complete?code=${'c'.repeat(43)}`,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    render(
      <MemoryRouter initialEntries={[`/mobile-auth/telegram?attempt=${'a'.repeat(43)}`]}>
        <MobileTelegramAuthScreen navigateTo={navigateTo} />
      </MemoryRouter>,
    );

    const script = screen.getByTestId('telegram-login-container').querySelector('script')!;
    const callbackName = script.getAttribute('data-onauth')!.replace('(user)', '');
    await act(async () => {
      (window as typeof window & Record<string, AuthCallback>)[callbackName]!({
        id: 42,
        first_name: 'Egor',
        auth_date: 1,
        hash: 'signed',
      });
    });

    await waitFor(() =>
      expect(navigateTo).toHaveBeenCalledWith(
        `https://ultimatehockey.ru/mobile/auth/complete?code=${'c'.repeat(43)}`,
      ),
    );
  });

  it('follows the verified invalid-referral completion URL', async () => {
    const navigateTo = vi.fn();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          redirectUrl:
            'https://ultimatehockey.ru/mobile/auth/complete?error=referral_code_invalid',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    render(
      <MemoryRouter initialEntries={[`/mobile-auth/telegram?attempt=${'a'.repeat(43)}`]}>
        <MobileTelegramAuthScreen navigateTo={navigateTo} />
      </MemoryRouter>,
    );

    const script = screen.getByTestId('telegram-login-container').querySelector('script')!;
    const callbackName = script.getAttribute('data-onauth')!.replace('(user)', '');
    await act(async () => {
      (window as typeof window & Record<string, AuthCallback>)[callbackName]!({
        id: 42,
        first_name: 'Egor',
        auth_date: 1,
        hash: 'signed',
      });
    });

    await waitFor(() =>
      expect(navigateTo).toHaveBeenCalledWith(
        'https://ultimatehockey.ru/mobile/auth/complete?error=referral_code_invalid',
      ),
    );
  });
});
