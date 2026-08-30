import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LoginScreen } from './LoginScreen.js';
import { useAuthStore } from '../auth/authStore.js';

const designSystemCss = readFileSync(resolve(process.cwd(), 'src/app/design-system.css'), 'utf8');

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
    vi.unstubAllGlobals();
    localStorage.clear();
    useAuthStore.getState().clearSession();
    delete (window as TelegramWebAppWindow).Telegram;
    vi.unstubAllEnvs();
    vi.stubEnv('VITE_TELEGRAM_BOT_USERNAME', 'test_bot');
    vi.restoreAllMocks();
  });

  it('renders the Telegram button', () => {
    renderWith();
    const heading = screen.getByRole('heading', { name: 'Ультимейт Хоккей' });
    expect(heading).toHaveClass('login-screen__title');
    expect(screen.getByAltText('Ультимейт Хоккей')).toHaveClass('login-screen__logo');
    expect(heading.closest('main')).toHaveClass('login-screen');
    expect(screen.getByText(/Нажимая «Войти»/)).toHaveClass('login-screen__terms');
    expect(screen.getByText('Живи жизнью профессионального хоккеиста')).toHaveClass(
      'login-screen__tagline',
    );
    for (const benefit of ['тренировки', 'игры', 'соревнования', 'призы']) {
      expect(screen.getByText(benefit)).toHaveClass('login-screen__benefit');
    }
    expect(screen.getByTestId('telegram-login-container')).toBeInTheDocument();
    const vkButton = screen.getByRole('button', { name: /войти через вконтакте/i });
    expect(vkButton).toBeInTheDocument();
    expect(vkButton).toHaveClass('login-screen__auth-button');
    expect(vkButton).toHaveStyle({ background: '#0077ff' });
    expect(screen.getByRole('button', { name: /демо-режим/i })).toHaveClass(
      'login-screen__auth-button',
    );
    expect(screen.getByRole('button', { name: /войти как dev/i })).toHaveClass(
      'login-screen__auth-button',
    );
    expect(vkButton.closest('main')).toHaveStyle({
      height: 'var(--app-viewport-height, 100dvh)',
      overflow: 'hidden',
    });
  });

  it('keeps the brand compact so benefit pills stay above the rink safety net', () => {
    expect(designSystemCss).toMatch(
      /\.login-screen__logo\s*{[^}]*width:\s*clamp\(76px,\s*12dvh,\s*96px\);[^}]*height:\s*clamp\(76px,\s*12dvh,\s*96px\);/s,
    );
  });

  it('keeps the dev-code form inside the visual viewport when the soft keyboard opens', () => {
    vi.stubEnv('VITE_DEV_ACCESS_CODE_LOGIN_ENABLED', 'true');
    renderWith();

    expect(screen.getByRole('textbox', { name: 'Код доступа' }).closest('main')).toHaveStyle({
      height: 'var(--app-viewport-height, 100dvh)',
      overflow: 'hidden',
    });
  });

  it('hides secondary dev-code actions in a keyboard-sized visual viewport', () => {
    vi.stubGlobal('visualViewport', {
      height: 330,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.stubEnv('VITE_DEV_ACCESS_CODE_LOGIN_ENABLED', 'true');
    renderWith();

    expect(screen.getByRole('textbox', { name: 'Код доступа' }).closest('main')).toHaveClass(
      'login-screen--compact-code',
    );
    expect(designSystemCss).toMatch(
      /\.login-screen--compact-code \.login-screen__actions > \.btn--ghost,[\s\S]*?\.login-screen--compact-code \.login-screen__terms\s*{[^}]*display:\s*none;/,
    );
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
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Не удалось выполнить запрос. Попробуйте ещё раз.',
      );
    });
    expect(screen.queryByText(/bad hash|unauthenticated/i)).toBeNull();
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
