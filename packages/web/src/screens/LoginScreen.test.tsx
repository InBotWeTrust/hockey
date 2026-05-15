import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LoginScreen } from './LoginScreen.js';
import { useAuthStore } from '../auth/authStore.js';

type AuthCallback = (payload: Record<string, unknown>) => void;
type WindowWithCallbacks = typeof window & Record<string, AuthCallback | undefined>;

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
    vi.unstubAllEnvs();
    vi.stubEnv('VITE_TELEGRAM_BOT_USERNAME', 'test_bot');
    vi.restoreAllMocks();
  });

  it('renders the Telegram button', () => {
    renderWith();
    expect(screen.getByRole('heading', { name: 'Хоккейный Ультиматум' })).toBeInTheDocument();
    expect(screen.getByAltText('Хоккейный Ультиматум')).toBeInTheDocument();
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
