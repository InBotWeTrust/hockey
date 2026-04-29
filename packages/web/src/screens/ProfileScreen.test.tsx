import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProfileScreen } from './ProfileScreen.js';
import { useAuthStore } from '../auth/authStore.js';

function renderProfile(): void {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ProfileScreen />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const telegramProfile = {
  id: 'u1',
  displayName: 'Alice T',
  avatarUrl: 'tg.png',
  grip: 'right',
  displaySource: 'telegram',
  linkedProviders: ['telegram', 'vk'],
  tgFirstName: 'Alice',
  tgLastName: 'T',
  tgAvatarUrl: 'tg.png',
  tgUsername: 'alice',
  vkFirstName: 'Vera',
  vkLastName: 'V',
  vkAvatarUrl: 'vk.png',
  vkUsername: 'vera',
};

describe('ProfileScreen display source switch', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.getState().setSession({
      accessToken: 'a',
      refreshToken: 'r',
      user: { id: 'u1', displayName: 'Alice T' },
    });
    vi.restoreAllMocks();
  });

  it('switches display source through PATCH /me', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify(telegramProfile), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ...telegramProfile,
            displayName: 'Vera V',
            avatarUrl: 'vk.png',
            displaySource: 'vk',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );

    renderProfile();
    const vkButton = await screen.findByRole('button', { name: /из вконтакте/i });
    fireEvent.click(vkButton);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const patchCall = fetchMock.mock.calls[1]!;
    expect(patchCall[0]).toBe('/api/me');
    expect((patchCall[1] as RequestInit).method).toBe('PATCH');
    expect((patchCall[1] as RequestInit).body).toBe(JSON.stringify({ displaySource: 'vk' }));
    await waitFor(() => expect(screen.getAllByText('Vera V').length).toBeGreaterThan(0));
  });
});
