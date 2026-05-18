import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { PrivateRoute } from './PrivateRoute.js';
import { useAuthStore } from './authStore.js';

type TelegramWebAppWindow = typeof window & {
  Telegram?: {
    WebApp?: {
      initData?: string;
      ready?: () => void;
      expand?: () => void;
    };
  };
};

function renderAt(path: string): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<div>login page</div>} />
          <Route
            path="/"
            element={
              <PrivateRoute>
                <div>secret</div>
              </PrivateRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('PrivateRoute', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.getState().clearSession();
    delete (window as TelegramWebAppWindow).Telegram;
    vi.restoreAllMocks();
  });

  it('renders children when authenticated', () => {
    useAuthStore.getState().setSession({
      accessToken: 'a',
      refreshToken: 'r',
      user: { id: 'u', displayName: 'A' },
    });
    renderAt('/');
    expect(screen.getByText('secret')).toBeInTheDocument();
  });

  it('redirects to /login when not authenticated', () => {
    renderAt('/');
    expect(screen.getByText('login page')).toBeInTheDocument();
    expect(screen.queryByText('secret')).toBeNull();
  });

  it('authenticates Telegram Mini App users without showing the login page', async () => {
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
          accessToken: 'mini-a',
          refreshToken: 'mini-r',
          user: { id: 'u-mini', displayName: 'Mini Player' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    renderAt('/');

    expect(screen.queryByText('login page')).toBeNull();
    expect(screen.getByText('Входим через Telegram...')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('secret')).toBeInTheDocument());
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/auth/telegram-mini-app',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('query_id=q'),
      }),
    );
    expect(ready).toHaveBeenCalled();
    expect(expand).toHaveBeenCalled();
  });
});
