import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppHeader } from './AppHeader.js';
import { useAuthStore } from '../auth/authStore.js';

describe('AppHeader', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.getState().clearSession();
    vi.restoreAllMocks();
  });

  it('renders nothing when no user', () => {
    render(
      <MemoryRouter>
        <AppHeader />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('banner')).toBeNull();
  });

  it('shows display name and a logout button', async () => {
    useAuthStore.getState().setSession({
      accessToken: 'a',
      refreshToken: 'r',
      user: { id: 'u', displayName: 'Alice' },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));

    render(
      <MemoryRouter>
        <AppHeader />
      </MemoryRouter>,
    );

    expect(screen.getByText('Alice')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /logout|выйти/i }));
    await waitFor(() => {
      expect(useAuthStore.getState().accessToken).toBeNull();
    });
  });
});
