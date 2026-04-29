import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProfileScreen } from './ProfileScreen.js';
import { useAuthStore } from '../auth/authStore.js';

function renderProfile(): void {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/profile']}>
        <Routes>
          <Route path="/profile" element={<ProfileScreen />} />
          <Route path="/profile/settings" element={<div>settings screen</div>} />
        </Routes>
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

describe('ProfileScreen', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.getState().setSession({
      accessToken: 'a',
      refreshToken: 'r',
      user: { id: 'u1', displayName: 'Alice T' },
    });
    vi.restoreAllMocks();
  });

  it('shows stats before the settings entry and navigates into settings', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(telegramProfile), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    renderProfile();

    const statsLabel = await screen.findByText('Статистика');
    const settingsLabel = screen.getAllByText('Настройки')[0]!;
    expect(statsLabel.compareDocumentPosition(settingsLabel)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

    const settingsButton = screen.getByRole('button', { name: /настройки/i });
    fireEvent.click(settingsButton);

    expect(screen.getByText('settings screen')).toBeInTheDocument();
  });
});
