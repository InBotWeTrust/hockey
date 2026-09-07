import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
  type RenderResult,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProfileSettingsScreen } from './ProfileSettingsScreen.js';
import { useAuthStore } from '../auth/authStore.js';

function renderProfileSettings(): RenderResult & { queryClient: QueryClient } {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return Object.assign(
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/profile/settings']}>
          <ProfileSettingsScreen />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
    { queryClient: qc },
  );
}

const telegramProfile = {
  id: 'u1',
  displayName: 'Alice T',
  avatarUrl: 'tg.png',
  grip: 'right',
  displaySource: 'telegram',
  registrationProvider: 'telegram',
  registrationProviderId: '42',
  competitionLevel: 'amateur',
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

const pushPreferences = {
  chatNewDialogMessage: true,
  dailyGame: true,
  trainingAvailable: true,
  duelEvents: true,
  tournamentEvents: true,
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

function mockSettingsFetch(profile: Record<string, unknown> = telegramProfile) {
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
      if (body.displaySource === 'telegram') {
        return jsonResponse({
          ...telegramProfile,
          displayName: 'Alice T',
          avatarUrl: 'tg.png',
          displaySource: 'telegram',
        });
      }
      if (
        body.displaySource === 'custom' ||
        (typeof body.customFirstName === 'string' && typeof body.customLastName === 'string')
      ) {
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

    if (url.endsWith('/api/me/avatar') && init?.method === 'POST') {
      return jsonResponse({
        avatarUrl: 'custom.webp',
        customAvatarUrl: 'custom.webp',
        displaySource: 'custom',
        media: { id: 'media-1' },
      });
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

    if (url.endsWith('/api/feedback/direct') && init?.method === 'POST') {
      return jsonResponse({ chatId: 'official-chat-1', messageId: 'message-1' });
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
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:avatar-preview'),
      revokeObjectURL: vi.fn(),
    });
  });

  it.each(['beginner', 'amateur', 'professional'] as const)(
    'uses the %s locker-room background in settings',
    async (competitionLevel) => {
      mockSettingsFetch({ ...telegramProfile, competitionLevel });

      renderProfileSettings();

      await screen.findByText('Аккаунт');
      expect(document.querySelector('main.profile-settings-screen')).toHaveClass(
        'profile-screen--locker-bg',
        `locker-room-bg--${competitionLevel}`,
      );
    },
  );

  it('shows the registration provider as a read-only account card', async () => {
    mockSettingsFetch();

    renderProfileSettings();

    expect(await screen.findByText('Аккаунт')).toBeInTheDocument();
    const account = screen.getByLabelText('Аккаунт Telegram');
    expect(account).toHaveTextContent('Alice T');
    expect(account).toHaveTextContent('TG ID 42');
    expect(account).not.toHaveTextContent('Telegram');
    expect(account.querySelector('img')).toHaveAttribute('src', 'tg.png');
    expect(screen.queryByText(/Привязать/)).not.toBeInTheDocument();
    expect(screen.queryByText('Кастом')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Из ВКонтакте/i })).not.toBeInTheDocument();
    const logoutButton = screen.getByRole('button', { name: 'Выйти' });
    expect(logoutButton).toHaveClass('profile-logout-btn--danger');
    expect(logoutButton).not.toHaveClass('glass');
    expect(screen.getByRole('button', { name: 'О хвате' })).toHaveClass(
      'profile-settings-grip-info',
    );
    expect(screen.getByRole('heading', { name: 'Настройки' })).toHaveClass('screen-title-on-arena');
  });

  it('marks both grip choices and checks only the selected one', async () => {
    mockSettingsFetch();

    renderProfileSettings();

    const left = await screen.findByRole('button', { name: /Левый Шайба слева/ });
    const right = screen.getByRole('button', { name: /Правый Шайба справа/ });
    expect(left).toHaveAttribute('aria-pressed', 'false');
    expect(right).toHaveAttribute('aria-pressed', 'true');
    expect(left.querySelector('.profile-settings-grip-option__indicator')).toHaveAttribute(
      'data-selected',
      'false',
    );
    expect(right.querySelector('.profile-settings-grip-option__indicator')).toHaveAttribute(
      'data-selected',
      'true',
    );
  });

  it('shows editable player identity separately from the login account', async () => {
    mockSettingsFetch();

    renderProfileSettings();

    expect(await screen.findByText('Профиль игрока')).toBeInTheDocument();
    expect(screen.getByLabelText('Имя')).toHaveValue('Alice');
    expect(screen.getByLabelText('Фамилия')).toHaveValue('T');
    expect(screen.getByRole('button', { name: 'Изменить аватар' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Сохранить профиль' })).toBeDisabled();
  });

  it('saves a custom first and last name and updates the active profile', async () => {
    const fetchMock = mockSettingsFetch();
    const { queryClient } = renderProfileSettings();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    fireEvent.change(await screen.findByLabelText('Имя'), { target: { value: 'Егор' } });
    fireEvent.change(screen.getByLabelText('Фамилия'), { target: { value: 'Гуменюк' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить профиль' }));

    await waitFor(() => {
      const call = findFetchCall(
        fetchMock,
        (url, init) => url.endsWith('/api/me') && init?.method === 'PATCH',
      );
      expect(parseJsonBody(call?.[1] as RequestInit | undefined)).toEqual({
        customFirstName: 'Егор',
        customLastName: 'Гуменюк',
      });
    });
    await waitFor(() => expect(useAuthStore.getState().user?.displayName).toBe('Егор Гуменюк'));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['chat'] });
  });

  it('previews and saves a WebP avatar and can restore the registration profile', async () => {
    const fetchMock = mockSettingsFetch({
      ...telegramProfile,
      displayName: 'Егор Гуменюк',
      avatarUrl: 'old-custom.webp',
      displaySource: 'custom',
      customFirstName: 'Егор',
      customLastName: 'Гуменюк',
      customDisplayName: 'Егор Гуменюк',
      customAvatarUrl: 'old-custom.webp',
    });
    renderProfileSettings();

    const avatarInput = await screen.findByLabelText('Загрузить аватар');
    fireEvent.change(avatarInput, {
      target: { files: [new File(['avatar'], 'avatar.webp', { type: 'image/webp' })] },
    });

    expect(screen.getByAltText('Текущий аватар')).toHaveAttribute('src', 'blob:avatar-preview');
    expect(
      findFetchCall(
        fetchMock,
        (url, init) => url.endsWith('/api/me/avatar') && init?.method === 'POST',
      ),
    ).toBeUndefined();

    fireEvent.click(screen.getByRole('button', { name: 'Сохранить профиль' }));
    await waitFor(() =>
      expect(
        findFetchCall(
          fetchMock,
          (url, init) => url.endsWith('/api/me/avatar') && init?.method === 'POST',
        ),
      ).toBeTruthy(),
    );
    expect(screen.getByAltText('Текущий аватар')).toHaveAttribute('src', 'custom.webp');

    const accountCard = screen.getByLabelText('Аккаунт Telegram');
    const restoreButton = within(accountCard).getByRole('button', {
      name: 'Вернуть профиль из Telegram',
    });
    expect(restoreButton).toHaveClass('icon-btn');
    expect(document.querySelector('.profile-customization-card__restore')).not.toBeInTheDocument();
    fireEvent.click(restoreButton);
    await waitFor(() => {
      const restoreCall = fetchMock.mock.calls.find(
        (call) =>
          getFetchUrl(call[0]).endsWith('/api/me') &&
          (call[1] as RequestInit | undefined)?.method === 'PATCH' &&
          parseJsonBody(call[1] as RequestInit).displaySource === 'telegram',
      );
      expect(restoreCall).toBeTruthy();
    });
  });

  it('shows notification and feedback controls in settings', async () => {
    mockSettingsFetch();

    renderProfileSettings();

    expect(await screen.findByText('Пуш-уведомления')).toBeInTheDocument();
    expect(screen.getByText('Обратная связь')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Написать в обратную связь' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Написать в обратную связь' }));
    expect(screen.getByRole('dialog', { name: 'Обратная связь' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Обратная связь' })).not.toBeInTheDocument();

    fireEvent.click(await screen.findByRole('button', { name: 'Настройки уведомлений' }));

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

  it('sends a non-empty message to the official account from the feedback card', async () => {
    const fetchMock = mockSettingsFetch();

    renderProfileSettings();

    const openButton = await screen.findByRole('button', { name: 'Написать в личку' });
    expect(screen.getByText('Официальный аккаунт')).toBeInTheDocument();
    expect(screen.getByAltText('Ультимейт Хоккей')).toHaveAttribute(
      'src',
      '/icons/official-account.webp?v=2',
    );
    fireEvent.click(openButton);

    const dialog = screen.getByRole('dialog', { name: 'Написать в личку' });
    expect(within(dialog).queryByText('Официальный аккаунт')).not.toBeInTheDocument();
    expect(within(dialog).getByText('Сообщение')).toHaveClass('section-label');
    const submitButton = within(dialog).getByRole('button', { name: 'Отправить' });
    expect(submitButton).toBeDisabled();

    fireEvent.change(within(dialog).getByLabelText('Сообщение'), {
      target: { value: 'Подскажите по турниру' },
    });
    expect(submitButton).toBeEnabled();
    fireEvent.click(submitButton);

    await waitFor(() =>
      expect(
        findFetchCall(
          fetchMock,
          (url, init) => url.endsWith('/api/feedback/direct') && init?.method === 'POST',
        ),
      ).toBeTruthy(),
    );
    const postCall = findFetchCall(
      fetchMock,
      (url, init) => url.endsWith('/api/feedback/direct') && init?.method === 'POST',
    )!;
    expect(JSON.parse((postCall[1] as RequestInit).body as string)).toEqual({
      message: 'Подскажите по турниру',
    });
  });
});
