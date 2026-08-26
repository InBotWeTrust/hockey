import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LoginScreen } from './LoginScreen.js';
import { useAuthStore } from '../auth/authStore.js';

type AuthCallback = (payload: Record<string, unknown>) => void;
type WindowWithCallbacks = typeof window & Record<string, AuthCallback | undefined>;
type TelegramWebAppWindow = typeof window & {
  Telegram?: {
    WebApp?: {
      initData?: string;
      ready?: () => void;
      expand?: () => void;
    };
  };
};

function renderWith(): { client: QueryClient } {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginScreen />} />
          <Route path="/" element={<div>home</div>} />
          <Route path="/demo" element={<div>demo mode</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { client };
}

describe('LoginScreen', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.getState().clearSession();
    delete (window as TelegramWebAppWindow).Telegram;
    vi.unstubAllEnvs();
    vi.stubEnv('VITE_TELEGRAM_BOT_USERNAME', 'test_bot');
    vi.restoreAllMocks();
  });

  it('renders the Telegram button', () => {
    renderWith();
    expect(screen.getByRole('heading', { name: 'Ультимейт Хоккей' })).toBeInTheDocument();
    expect(screen.getByAltText('Ультимейт Хоккей')).toBeInTheDocument();
    expect(screen.getByTestId('telegram-login-container')).toBeInTheDocument();
    const vkButton = screen.getByRole('button', { name: /войти через вконтакте/i });
    expect(vkButton).toBeInTheDocument();
    expect(vkButton).toHaveStyle({ width: '242px', height: '40px', background: '#0077ff' });
    expect(screen.getByRole('button', { name: /демо-режим/i })).toBeInTheDocument();
    expect(vkButton.closest('main')).toHaveStyle({ height: '100dvh', overflow: 'hidden' });
  });

  it('opens demo mode without creating an auth session', () => {
    renderWith();
    fireEvent.click(screen.getByRole('button', { name: /демо-режим/i }));
    expect(screen.getByText('demo mode')).toBeInTheDocument();
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it('exchanges payload for session and navigates home', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          accessToken: 'a',
          refreshToken: 'r',
          user: { id: 'u1', displayName: 'Alice' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    renderWith();
    const script = screen.getByTestId('telegram-login-container').querySelector('script')!;
    const cbName = script.getAttribute('data-onauth')!.replace('(user)', '');
    const cb = (window as WindowWithCallbacks)[cbName]!;
    cb({ id: 42, first_name: 'Alice', auth_date: 1, hash: 'x' });

    await waitFor(() => {
      expect(useAuthStore.getState().accessToken).toBe('a');
    });
    await waitFor(() => {
      expect(screen.getByText('home')).toBeInTheDocument();
    });
  });

  it('automatically logs in with Telegram Mini App initData', async () => {
    const ready = vi.fn();
    const expand = vi.fn();
    (window as TelegramWebAppWindow).Telegram = {
      WebApp: {
        initData: 'query_id=q&user=%7B%22id%22%3A42%7D&auth_date=1&hash=h',
        ready,
        expand,
      },
    };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          accessToken: 'mini-access',
          refreshToken: 'mini-refresh',
          user: { id: 'u-mini', displayName: 'Mini Player', grip: 'right' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    renderWith();

    await waitFor(() => expect(useAuthStore.getState().accessToken).toBe('mini-access'));
    expect(useAuthStore.getState().user?.grip).toBe('right');
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/auth/telegram-mini-app',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('query_id=q'),
      }),
    );
    expect(ready).toHaveBeenCalled();
    expect(expand).toHaveBeenCalled();
    expect(screen.getByText('home')).toBeInTheDocument();
  });

  it('shows an error message on failed login', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'unauthenticated', message: 'bad hash' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    );

    renderWith();
    const script = screen.getByTestId('telegram-login-container').querySelector('script')!;
    const cbName = script.getAttribute('data-onauth')!.replace('(user)', '');
    const cb = (window as WindowWithCallbacks)[cbName]!;
    cb({ id: 42, first_name: 'Alice', auth_date: 1, hash: 'bad' });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/bad hash|unauthenticated|login failed/i);
    });
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it('shows a Russian message when the account is already linked', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ error: { code: 'conflict', message: 'telegram_already_linked' } }),
        {
          status: 409,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );

    renderWith();
    const script = screen.getByTestId('telegram-login-container').querySelector('script')!;
    const cbName = script.getAttribute('data-onauth')!.replace('(user)', '');
    const cb = (window as WindowWithCallbacks)[cbName]!;
    cb({ id: 42, first_name: 'Alice', auth_date: 1, hash: 'x' });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Аккаунт уже занят');
    });
    expect(useAuthStore.getState().accessToken).toBeNull();
  });
});
