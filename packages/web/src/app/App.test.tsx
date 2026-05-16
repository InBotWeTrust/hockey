import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LoginScreen } from '../screens/LoginScreen.js';
import { PrivateRoute } from '../auth/PrivateRoute.js';
import { useAuthStore } from '../auth/authStore.js';

function renderAt(path: string): void {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<LoginScreen />} />
          <Route
            path="/"
            element={
              <PrivateRoute>
                <main>home content</main>
              </PrivateRoute>
            }
          />
          <Route
            path="/duel/:goalieId"
            element={
              <PrivateRoute>
                <main>duel content</main>
              </PrivateRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('App routing + auth', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.getState().clearSession();
  });

  it('redirects unauthenticated users from / to /login', () => {
    renderAt('/');
    expect(screen.getByRole('heading', { name: /ультимейт хоккей/i })).toBeInTheDocument();
  });

  it('shows home content when authenticated', () => {
    useAuthStore.getState().setSession({
      accessToken: 'a',
      refreshToken: 'r',
      user: { id: 'u', displayName: 'A' },
    });
    renderAt('/');
    expect(screen.getByText('home content')).toBeInTheDocument();
  });

  it('guards /duel/:goalieId as well', () => {
    renderAt('/duel/rookie');
    expect(screen.queryByText('duel content')).toBeNull();
    expect(screen.getByRole('heading', { name: /ультимейт хоккей/i })).toBeInTheDocument();
  });
});
