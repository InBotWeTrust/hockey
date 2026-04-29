import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProfileSettingsScreen } from './ProfileSettingsScreen.js';
import { useAuthStore } from '../auth/authStore.js';

type AuthCallback = (payload: Record<string, unknown>) => void;
type WindowWithCallbacks = typeof window & Record<string, AuthCallback | undefined>;

function renderProfileSettings(): void {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/profile/settings']}>
        <ProfileSettingsScreen />
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

const vkOnlyProfile = {
  id: 'u1',
  displayName: 'Vera V',
  avatarUrl: 'vk.png',
  grip: 'right',
  displaySource: 'vk',
  linkedProviders: ['vk'],
  vkFirstName: 'Vera',
  vkLastName: 'V',
  vkAvatarUrl: 'vk.png',
  vkUsername: 'vera',
};

describe('ProfileSettingsScreen', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllEnvs();
    vi.stubEnv('VITE_TELEGRAM_BOT_USERNAME', 'test_bot');
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

    renderProfileSettings();
    const vkButton = await screen.findByRole('button', { name: /из вконтакте/i });
    fireEvent.click(vkButton);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const patchCall = fetchMock.mock.calls[1]!;
    expect(patchCall[0]).toBe('/api/me');
    expect((patchCall[1] as RequestInit).method).toBe('PATCH');
    expect((patchCall[1] as RequestInit).body).toBe(JSON.stringify({ displaySource: 'vk' }));
    await waitFor(() => expect(screen.getAllByText('Vera V').length).toBeGreaterThan(0));
  });

  it('links Telegram from a VK-only profile through Telegram widget payload', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify(vkOnlyProfile), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            accessToken: 'next-a',
            refreshToken: 'next-r',
            user: { id: 'u1', displayName: 'Vera V' },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ...vkOnlyProfile,
            linkedProviders: ['telegram', 'vk'],
            tgFirstName: 'Alice',
            tgAvatarUrl: 'tg.png',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );

    renderProfileSettings();
    expect(await screen.findByText('Привязать Telegram')).toBeInTheDocument();
    const script = screen.getByTestId('telegram-login-container').querySelector('script')!;
    const cbName = script.getAttribute('data-onauth')!.replace('(user)', '');
    const cb = (window as WindowWithCallbacks)[cbName]!;
    cb({ id: 42, first_name: 'Alice', photo_url: 'tg.png', auth_date: 1, hash: 'h' });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const postCall = fetchMock.mock.calls[1]!;
    expect(postCall[0]).toBe('/api/auth/telegram');
    const init = postCall[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer a');
    expect(JSON.parse(init.body as string)).toMatchObject({
      id: 42,
      first_name: 'Alice',
      photo_url: 'tg.png',
    });
    expect(useAuthStore.getState().accessToken).toBe('next-a');
  });
});
