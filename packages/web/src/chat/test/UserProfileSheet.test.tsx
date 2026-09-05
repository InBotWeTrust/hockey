import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { UserProfileSheet } from '../components/UserProfileSheet.js';
import * as api from '../api.js';
import * as amateurDuelApi from '../../api/amateurDuel.js';
import { useAuthStore } from '../../auth/authStore.js';
import { userKeys } from '../../lib/queryKeys.js';

const publicProfile: api.UserPublicProfileDTO = {
  id: 'u1',
  displayName: 'Иван Петров',
  avatarUrl: null,
  competitionLevel: 'amateur',
  currencyBalance: 220,
  starBalance: 20,
  experienceBalance: 1090,
  trophySummary: {
    regularSeasonWins: 1,
    tournamentChampionships: 2,
    tournamentPodiums: 3,
    completedChallenges: 4,
  },
  stats: {
    shots: 128,
    goals: 64,
    accuracy: 50,
    playStreakDays: 7,
    bestPlayStreakDays: 12,
  },
  achievements: [
    {
      id: 'first-goal',
      photoUrl: '/sprites/gate.webp',
      title: 'Первая шайба',
      description: 'Первый гол всегда самый шумный.',
      requirement: 'Забить 1 гол в дневной игре.',
      isUnlocked: true,
      unlockedAt: '2026-05-02T08:00:00.000Z',
    },
  ],
  createdAt: '2026-05-01T08:00:00.000Z',
  lastSeenAt: null,
};

async function renderSheet(
  props: Parameters<typeof UserProfileSheet>[0],
  configure?: (queryClient: QueryClient) => void,
): Promise<{ qc: QueryClient }> {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  configure?.(qc);
  await act(async () => {
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter
          initialEntries={['/chat/c1']}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <Routes>
            <Route path="/chat/:chatId" element={<UserProfileSheet {...props} />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await Promise.resolve();
  });
  return { qc };
}

describe('UserProfileSheet', () => {
  beforeEach(() => {
    useAuthStore.setState({ accessToken: null, refreshToken: null, user: null });
    vi.spyOn(api, 'findOrCreateDM').mockResolvedValue({ chatId: 'dm1', created: false });
    vi.spyOn(api, 'fetchUserProfile').mockResolvedValue(publicProfile);
    vi.spyOn(amateurDuelApi, 'fetchAmateurMatches').mockResolvedValue({ matches: [] });
    vi.spyOn(amateurDuelApi, 'fetchAmateurTemplates').mockResolvedValue({
      templates: [
        {
          id: 'template-express',
          title: 'Экспресс',
          description: '',
          difficulty: 'easy',
          duel_kind: 'express',
          duel_variant: 'time_attack',
          ranked_enabled: true,
          matchmaking_enabled: true,
          starts_at: '2026-01-01T00:00:00.000Z',
          ends_at: '2100-01-01T00:00:00.000Z',
          total_periods: 1,
          shots_per_period: 30,
          period_duration_ms: 180_000,
          break_duration_ms: 0,
          challenge_ttl_ms: 900_000,
          ready_duration_ms: 900_000,
          ready_no_show_cooldown_ms: 900_000,
          matchmaking_timeout_ms: 300_000,
          ranked_daily_limit: 20,
          ranked_same_opponent_limit: 5,
          power_cap: 100,
          goalie_id: 'rookie',
          period_speed_presets: [],
          period_rules: [
            { periodNumber: 1, mode: 'time_attack', durationMs: 180_000, shotsLimit: null },
          ],
          stake_amount: 0,
          entry_fee_amount: 0,
          required_inventory_item_id: null,
          inventory_charges_per_period: 0,
          win_points: 3,
          draw_points: 1,
          win_currency_reward: 0,
          draw_currency_reward: 0,
          win_star_reward: 0,
        },
        {
          id: 'template-classic',
          title: 'Классика',
          description: '',
          difficulty: 'hard',
          duel_kind: 'classic',
          duel_variant: 'classic',
          ranked_enabled: true,
          matchmaking_enabled: true,
          starts_at: '2026-01-01T00:00:00.000Z',
          ends_at: '2100-01-01T00:00:00.000Z',
          total_periods: 3,
          shots_per_period: 30,
          period_duration_ms: 1_200_000,
          break_duration_ms: 120_000,
          challenge_ttl_ms: 900_000,
          ready_duration_ms: 900_000,
          ready_no_show_cooldown_ms: 900_000,
          matchmaking_timeout_ms: 300_000,
          ranked_daily_limit: 20,
          ranked_same_opponent_limit: 5,
          power_cap: 100,
          goalie_id: 'rookie',
          period_speed_presets: [],
          period_rules: [{ periodNumber: 1, mode: 'quota', durationMs: 1_200_000, shotsLimit: 30 }],
          stake_amount: 0,
          entry_fee_amount: 0,
          required_inventory_item_id: null,
          inventory_charges_per_period: 0,
          win_points: 3,
          draw_points: 1,
          win_currency_reward: 0,
          draw_currency_reward: 0,
          win_star_reward: 0,
        },
      ],
    });
    vi.spyOn(amateurDuelApi, 'challengeAmateurDuel').mockResolvedValue({
      match: {} as amateurDuelApi.AmateurDuelMatch,
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    act(() => {
      useAuthStore.setState({ accessToken: null, refreshToken: null, user: null });
    });
  });

  it('returns null without loading profiles when sender is null', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    useAuthStore.setState({
      accessToken: 'token',
      refreshToken: 'refresh',
      user: { id: 'me', displayName: 'Me', grip: 'right' },
    });
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <UserProfileSheet sender={null} onClose={() => {}} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(container.firstChild).toBeNull();
    await act(async () => {
      await Promise.resolve();
    });
    expect(api.fetchUserProfile).not.toHaveBeenCalled();
    expect(
      consoleError.mock.calls.some(([message]) => String(message).includes('not wrapped in act')),
    ).toBe(false);
  });

  it('renders displayName, public stats and achievements when sender is provided', async () => {
    await renderSheet({
      sender: { userId: 'u1', displayName: 'Иван Петров', avatarUrl: null },
      onClose: () => {},
    });
    expect(await screen.findByText('Иван Петров')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /написать в личку/i })).toBeInTheDocument();
    expect(await screen.findByText('Любитель')).toBeInTheDocument();
    expect(screen.getByText('Голы')).toBeInTheDocument();
    expect(screen.getByText('64')).toBeInTheDocument();
    expect(screen.getByText('(12)')).toBeInTheDocument();
    expect(screen.getByText('Выполненные задания (1)')).toBeInTheDocument();
    expect(screen.getByLabelText('Публичный спортивный паспорт')).toBeInTheDocument();
    expect(screen.getByLabelText('Монеты: 220')).toBeInTheDocument();
    expect(screen.getByLabelText('Звёзды: 20')).toBeInTheDocument();
    expect(screen.getByLabelText('Опыт: 1090')).toBeInTheDocument();
    expect(screen.getByLabelText('Витрина наград')).toHaveTextContent('Чемпионства');
    expect(screen.getByText('Любитель')).toHaveClass('profile-identity__level');
    expect(screen.getByRole('button', { name: /Первая шайба.*получено/i })).toBeInTheDocument();
    const identity = screen.getByText('Иван Петров').closest('.profile-identity__main');
    expect(identity).toHaveClass('public-profile-identity');
    expect(identity?.querySelector('[aria-hidden="true"]')).toHaveStyle({
      width: '80px',
      height: '80px',
    });
    expect(screen.getByText('Иван Петров')).toHaveClass('public-profile-identity__name');
    expect(screen.getByRole('dialog', { name: 'Профиль игрока' })).toHaveClass('sheet-card');
    expect(screen.getByRole('dialog', { name: 'Профиль игрока' }).firstElementChild).toHaveClass(
      'sheet-grabber',
    );
    expect(
      screen
        .getByRole('heading', { name: 'Профиль игрока' })
        .parentElement?.querySelector(':scope > button[aria-label="Закрыть"]'),
    ).toBeInTheDocument();
  });

  it('opens achievement details without a completion badge and with a square full-width image', async () => {
    await renderSheet({
      sender: { userId: 'u1', displayName: 'Иван Петров', avatarUrl: null },
      onClose: () => {},
    });

    fireEvent.click(await screen.findByRole('button', { name: /Первая шайба.*получено/i }));

    const dialog = screen.getByRole('dialog', { name: 'Первая шайба' });
    expect(dialog).toHaveClass('achievement-details-modal');
    expect(screen.getByRole('img', { name: 'Первая шайба' })).toHaveClass(
      'achievement-details-modal__image',
    );
    expect(screen.queryByText('Выполнено')).not.toBeInTheDocument();
  });

  it('hides the achievements section when the player has no completed achievements', async () => {
    vi.mocked(api.fetchUserProfile).mockResolvedValue({
      ...publicProfile,
      achievements: [],
    });

    await renderSheet({
      sender: { userId: 'u1', displayName: 'Иван Петров', avatarUrl: null },
      onClose: () => {},
    });

    expect(await screen.findByText('Иван Петров')).toBeInTheDocument();
    expect(screen.queryByText(/Выполненные задания/)).not.toBeInTheDocument();
  });

  it('clicking "Написать в личку" calls findOrCreateDM and closes the sheet', async () => {
    const onClose = vi.fn();
    const { qc } = await renderSheet({
      sender: { userId: 'u1', displayName: 'Иван', avatarUrl: null },
      onClose,
    });
    fireEvent.click(screen.getByRole('button', { name: /написать в личку/i }));
    await waitFor(() => expect(api.findOrCreateDM).toHaveBeenCalledWith('u1'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    await waitFor(() => expect(qc.isMutating()).toBe(0));
  });

  it('does not show duel action when current user is a beginner', async () => {
    useAuthStore.setState({
      accessToken: 'tok',
      refreshToken: 'rtok',
      user: { id: 'me', displayName: 'Me' },
    });
    vi.mocked(api.fetchUserProfile).mockImplementation(async (userId) =>
      userId === 'me'
        ? { ...publicProfile, id: 'me', competitionLevel: 'beginner' }
        : publicProfile,
    );

    const { qc } = await renderSheet(
      {
        sender: { userId: 'u1', displayName: 'Иван', avatarUrl: null },
        onClose: () => {},
      },
      (queryClient) => {
        queryClient.setQueryData(userKeys.profile('me'), {
          ...publicProfile,
          id: 'me',
          competitionLevel: 'beginner',
        });
        queryClient.setQueryData(userKeys.profile('u1'), publicProfile);
      },
    );

    expect(await screen.findByText('Любитель')).toBeInTheDocument();
    await waitFor(() => expect(qc.isFetching()).toBe(0));
    await waitFor(() => expect(qc.isMutating()).toBe(0));
    expect(screen.queryByRole('button', { name: /вызвать на дуэль/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /написать в личку/i })).toBeInTheDocument();
  });

  it('does not show a DM action when the sheet is opened for myself', async () => {
    useAuthStore.setState({
      accessToken: 'tok',
      refreshToken: 'rtok',
      user: { id: 'u1', displayName: 'Иван Петров' },
    });

    const { qc } = await renderSheet(
      {
        sender: { userId: 'u1', displayName: 'Иван Петров', avatarUrl: null },
        onClose: () => {},
      },
      (queryClient) => {
        queryClient.setQueryData(userKeys.profile('u1'), publicProfile);
      },
    );

    expect(await screen.findByText('Это ваш профиль')).toBeInTheDocument();
    await waitFor(() => expect(qc.isFetching()).toBe(0));
    expect(screen.queryByRole('button', { name: /написать в личку/i })).not.toBeInTheDocument();
  });

  it('lets amateur users choose duel type before challenging from the profile sheet', async () => {
    useAuthStore.setState({
      accessToken: 'tok',
      refreshToken: 'rtok',
      user: { id: 'me', displayName: 'Me' },
    });
    vi.mocked(api.fetchUserProfile).mockImplementation(async (userId) =>
      userId === 'me' ? { ...publicProfile, id: 'me' } : publicProfile,
    );
    const onClose = vi.fn();

    const { qc } = await renderSheet(
      {
        sender: { userId: 'u1', displayName: 'Иван', avatarUrl: null },
        onClose,
      },
      (queryClient) => {
        queryClient.setQueryData(userKeys.profile('me'), { ...publicProfile, id: 'me' });
        queryClient.setQueryData(userKeys.profile('u1'), publicProfile);
        queryClient.setQueryData(['amateur-duel', 'matches'], { matches: [] });
      },
    );

    fireEvent.click(await screen.findByRole('button', { name: /вызвать на дуэль/i }));
    expect(await screen.findByRole('dialog', { name: 'Выбор типа дуэли' })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: /Классика/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Вызвать$/i }));

    await waitFor(() =>
      expect(amateurDuelApi.challengeAmateurDuel).toHaveBeenCalledWith({
        template_id: 'template-classic',
        opponent_user_id: 'u1',
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Выбор типа дуэли' })).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(qc.isFetching()).toBe(0));
    await waitFor(() => expect(qc.isMutating()).toBe(0));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes the duel type modal with Escape without closing the profile sheet', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    useAuthStore.setState({
      accessToken: 'tok',
      refreshToken: 'rtok',
      user: { id: 'me', displayName: 'Me' },
    });
    vi.mocked(api.fetchUserProfile).mockImplementation(async (userId) =>
      userId === 'me' ? { ...publicProfile, id: 'me' } : publicProfile,
    );
    const onClose = vi.fn();

    await renderSheet({
      sender: { userId: 'u1', displayName: 'Иван', avatarUrl: null },
      onClose,
    });

    fireEvent.click(await screen.findByRole('button', { name: /вызвать на дуэль/i }));
    expect(await screen.findByRole('dialog', { name: 'Выбор типа дуэли' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: 'Выбор типа дуэли' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Профиль игрока' })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(
      consoleError.mock.calls.some(([message]) => String(message).includes('not wrapped in act')),
    ).toBe(false);
  });

  it('clicking the backdrop calls onClose', () => {
    const onClose = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <UserProfileSheet
            sender={{ userId: 'u1', displayName: 'Иван', avatarUrl: null }}
            onClose={onClose}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const backdrop = document.body.querySelector<HTMLElement>('.modal-backdrop--sheet');
    expect(backdrop).not.toBeNull();
    fireEvent.mouseDown(backdrop!);
    expect(onClose).toHaveBeenCalled();
  });
});
