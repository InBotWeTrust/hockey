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
  customFirstName: null,
  customLastName: null,
  customDisplayName: null,
  customAvatarUrl: null,
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
  customFirstName: null,
  customLastName: null,
  customDisplayName: null,
  customAvatarUrl: null,
  vkFirstName: 'Vera',
  vkLastName: 'V',
  vkAvatarUrl: 'vk.png',
  vkUsername: 'vera',
};

const pushPreferences = {
  chatNewDialogMessage: true,
  dailyGame: true,
  trainingAvailable: true,
  duelEvents: true,
  gameNews: true,
};

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function getFetchUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function parseJsonBody(init: RequestInit | undefined): Record<string, unknown> {
  if (typeof init?.body !== 'string') return {};
  return JSON.parse(init.body) as Record<string, unknown>;
}

function mockSettingsFetch(
  profile: typeof telegramProfile | typeof vkOnlyProfile = telegramProfile,
) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = getFetchUrl(input);

    if (url.endsWith('/api/me') && init?.method === 'PATCH') {
      const body = parseJsonBody(init);
      if (body.displaySource === 'vk') {
        return jsonResponse({
          ...telegramProfile,
          displayName: 'Vera V',
          avatarUrl: 'vk.png',
          displaySource: 'vk',
        });
      }
      if (body.displaySource === 'custom') {
        return jsonResponse({
          ...telegramProfile,
          displayName: `${body.customFirstName} ${body.customLastName}`,
          displaySource: 'custom',
          customDisplayName: `${body.customFirstName} ${body.customLastName}`,
          customFirstName: body.customFirstName,
          customLastName: body.customLastName,
        });
      }
      if (body.grip === 'left' || body.grip === 'right') {
        return jsonResponse({ grip: body.grip });
      }
    }

    if (url.endsWith('/api/me')) {
      return jsonResponse(profile);
    }

    if (url.endsWith('/api/auth/telegram') && init?.method === 'POST') {
      return jsonResponse({
        accessToken: 'next-a',
        refreshToken: 'next-r',
        user: { id: 'u1', displayName: 'Vera V' },
      });
    }

    if (url.endsWith('/api/push/config')) {
      return jsonResponse({ supported: true, publicKey: 'test-key' });
    }

    if (url.endsWith('/api/push/preferences')) {
      const patch = init?.method === 'PATCH' ? parseJsonBody(init) : {};
      return jsonResponse({ ...pushPreferences, ...patch });
    }

    if (url.endsWith('/api/feedback') && init?.method === 'POST') {
      const body = parseJsonBody(init);
      return jsonResponse({
        feedback: {
          id: 'feedback-1',
          ...body,
          rating: body.kind === 'review' ? body.rating : null,
          isRead: false,
          createdAt: '2026-05-03T08:00:00.000Z',
        },
      });
    }

    return jsonResponse({ error: { code: 'not_found', message: 'not found' } }, 404);
  });
}

function findFetchCall(
  fetchMock: ReturnType<typeof mockSettingsFetch>,
  matcher: (url: string, init: RequestInit | undefined) => boolean,
) {
  return fetchMock.mock.calls.find((call) =>
    matcher(getFetchUrl(call[0]), call[1] as RequestInit | undefined),
  );
}

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
    const fetchMock = mockSettingsFetch();

    renderProfileSettings();
    expect(await screen.findByText('ID игрока')).toBeInTheDocument();
    expect(screen.getByText('u1')).toBeInTheDocument();
    const vkButton = await screen.findByRole('button', { name: /из вконтакте/i });
    fireEvent.click(vkButton);

    await waitFor(() =>
      expect(
        findFetchCall(
          fetchMock,
          (url, init) => url.endsWith('/api/me') && init?.method === 'PATCH',
        ),
      ).toBeTruthy(),
    );
    const patchCall = findFetchCall(
      fetchMock,
      (url, init) => url.endsWith('/api/me') && init?.method === 'PATCH',
    )!;
    expect(patchCall[0]).toBe('/api/me');
    expect((patchCall[1] as RequestInit).method).toBe('PATCH');
    expect((patchCall[1] as RequestInit).body).toBe(JSON.stringify({ displaySource: 'vk' }));
    await waitFor(() => expect(screen.getAllByText('Vera V').length).toBeGreaterThan(0));
  });

  it('links Telegram from a VK-only profile through Telegram widget payload', async () => {
    const fetchMock = mockSettingsFetch(vkOnlyProfile);

    renderProfileSettings();
    expect(await screen.findByText('Привязать Telegram')).toBeInTheDocument();
    const script = screen.getByTestId('telegram-login-container').querySelector('script')!;
    const cbName = script.getAttribute('data-onauth')!.replace('(user)', '');
    const cb = (window as WindowWithCallbacks)[cbName]!;
    cb({ id: 42, first_name: 'Alice', photo_url: 'tg.png', auth_date: 1, hash: 'h' });

    await waitFor(() =>
      expect(
        findFetchCall(
          fetchMock,
          (url, init) => url.endsWith('/api/auth/telegram') && init?.method === 'POST',
        ),
      ).toBeTruthy(),
    );
    const postCall = findFetchCall(
      fetchMock,
      (url, init) => url.endsWith('/api/auth/telegram') && init?.method === 'POST',
    )!;
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

  it('saves custom profile name through PATCH /me', async () => {
    const fetchMock = mockSettingsFetch();

    renderProfileSettings();
    fireEvent.change(await screen.findByLabelText('Кастомное имя'), {
      target: { value: 'Егор' },
    });
    fireEvent.change(screen.getByLabelText('Кастомная фамилия'), {
      target: { value: 'Гуменюк' },
    });
    fireEvent.click(screen.getByRole('button', { name: /сохранить кастомный профиль/i }));

    await waitFor(() =>
      expect(
        findFetchCall(
          fetchMock,
          (url, init) =>
            url.endsWith('/api/me') &&
            init?.method === 'PATCH' &&
            parseJsonBody(init).displaySource === 'custom',
        ),
      ).toBeTruthy(),
    );
    const patchCall = findFetchCall(
      fetchMock,
      (url, init) =>
        url.endsWith('/api/me') &&
        init?.method === 'PATCH' &&
        parseJsonBody(init).displaySource === 'custom',
    )!;
    expect(patchCall[0]).toBe('/api/me');
    expect((patchCall[1] as RequestInit).method).toBe('PATCH');
    expect(JSON.parse((patchCall[1] as RequestInit).body as string)).toMatchObject({
      displaySource: 'custom',
      customFirstName: 'Егор',
      customLastName: 'Гуменюк',
    });
    await waitFor(() => expect(screen.getAllByText('Егор Гуменюк').length).toBeGreaterThan(0));
  });

  it('shows notification and feedback controls in settings', async () => {
    mockSettingsFetch();

    renderProfileSettings();

    expect(await screen.findByText('Пуш-уведомления')).toBeInTheDocument();
    expect(screen.getByText('Обратная связь')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Написать в обратную связь' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Настройки уведомлений' }));

    expect(screen.getByRole('switch', { name: 'Первое сообщение в личке' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Дуэли' })).toBeInTheDocument();
  });

  it('saves push preference switches from settings', async () => {
    const fetchMock = mockSettingsFetch();

    renderProfileSettings();
    fireEvent.click(await screen.findByRole('button', { name: 'Настройки уведомлений' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Первое сообщение в личке' }));

    await waitFor(() =>
      expect(
        findFetchCall(
          fetchMock,
          (url, init) => url.endsWith('/api/push/preferences') && init?.method === 'PATCH',
        ),
      ).toBeTruthy(),
    );
    const patchCall = findFetchCall(
      fetchMock,
      (url, init) => url.endsWith('/api/push/preferences') && init?.method === 'PATCH',
    )!;
    expect(JSON.parse((patchCall[1] as RequestInit).body as string)).toEqual({
      chatNewDialogMessage: false,
    });
  });

  it('submits feedback from settings modal', async () => {
    const fetchMock = mockSettingsFetch();

    renderProfileSettings();
    fireEvent.click(await screen.findByRole('button', { name: 'Написать в обратную связь' }));
    fireEvent.click(screen.getByRole('radio', { name: '5 из 5' }));
    fireEvent.change(screen.getByLabelText('Сообщение'), {
      target: { value: 'Все работает бодро.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));

    await waitFor(() =>
      expect(
        findFetchCall(
          fetchMock,
          (url, init) => url.endsWith('/api/feedback') && init?.method === 'POST',
        ),
      ).toBeTruthy(),
    );
    const postCall = findFetchCall(
      fetchMock,
      (url, init) => url.endsWith('/api/feedback') && init?.method === 'POST',
    )!;
    expect(JSON.parse((postCall[1] as RequestInit).body as string)).toMatchObject({
      kind: 'review',
      rating: 5,
      message: 'Все работает бодро.',
    });
  });
});
