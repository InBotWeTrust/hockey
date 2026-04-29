import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { VkAuthCallbackScreen } from './VkAuthCallbackScreen.js';
import { useAuthStore } from '../auth/authStore.js';

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock('../api/apiFetch.js', () => ({
  ApiError: class MockApiError extends Error {
    constructor(
      public readonly status: number,
      public readonly code: string,
      message: string,
    ) {
      super(message);
    }
  },
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

function renderAt(path: string, strict = false): void {
  window.history.pushState({}, '', path);
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const ui = (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/auth/vk/callback" element={<VkAuthCallbackScreen />} />
          <Route path="/" element={<div>home</div>} />
          <Route path="/login" element={<div>login</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  render(strict ? <StrictMode>{ui}</StrictMode> : ui);
}

describe('VkAuthCallbackScreen', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    useAuthStore.getState().clearSession();
    apiFetchMock.mockReset();
  });

  it('exchanges code once even under StrictMode and navigates home', async () => {
    sessionStorage.setItem('vk_code_verifier', 'V');
    sessionStorage.setItem('vk_oauth_state', 'S');
    apiFetchMock.mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'r',
      user: { id: 'u1', displayName: 'Vera' },
    });

    renderAt('/auth/vk/callback?code=C&device_id=D&state=S', true);

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));
    expect(apiFetchMock).toHaveBeenCalledWith(
      '/auth/vk',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(useAuthStore.getState().accessToken).toBe('a');
    expect(await screen.findByText('home')).toBeInTheDocument();
  });

  it('rejects state mismatch without POSTing', async () => {
    sessionStorage.setItem('vk_code_verifier', 'V');
    sessionStorage.setItem('vk_oauth_state', 'S');

    renderAt('/auth/vk/callback?code=C&device_id=D&state=OTHER');

    expect(await screen.findByRole('alert')).toHaveTextContent(/state/i);
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('shows VK error from URL', async () => {
    renderAt('/auth/vk/callback?error=access_denied&error_description=Denied');

    expect(await screen.findByRole('alert')).toHaveTextContent('Denied');
    expect(apiFetchMock).not.toHaveBeenCalled();
  });
});
