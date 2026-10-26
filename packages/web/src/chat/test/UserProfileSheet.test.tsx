import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { UserProfileSheet } from '../components/UserProfileSheet.js';
import * as api from '../api.js';
import { socialApi } from '../../social/api.js';
import * as amateurDuelApi from '../../api/amateurDuel.js';
import { ApiError } from '../../api/apiFetch.js';
import { useAuthStore } from '../../auth/authStore.js';
import type { DailyStateResponse } from '../../api/duel.js';
import { useDailyStore } from '../../stores/dailyStore.js';
import { userKeys } from '../../lib/queryKeys.js';

const publicProfile: api.UserPublicProfileDTO = {
  id: 'u1',
  displayName: 'Иван Петров',
  avatarUrl: null,
  competitionLevel: 'amateur',
  currencyBalance: 220,
  starBalance: 20,
  experienceBalance: 100000,
  trophySummary: {
    regularSeasonWins: 1,
    tournamentChampionships: 2,
    tournamentPodiums: 3,
    completedChallenges: 4,
  },
  trophyDetails: {
    regularSeasonWins: [
      {
        id: 'r1',
        title: 'Кубок открытия',
        imageUrl: '/cup.webp',
        startsAt: '2026-08-01T10:00:00.000Z',
        endsAt: '2026-08-08T10:00:00.000Z',
        result: 'Победа в регулярном чемпионате',
      },
    ],
    tournamentChampionships: [],
    tournamentPodiums: [],
    completedChallenges: [],
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

function CurrentChatPath(): JSX.Element { return <output data-testid="chat-path">{useLocation().pathname}</output>; }

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
          <CurrentChatPath />
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
  it('closes the player sheet after opening the personal conversation', async () => {
    const onClose = vi.fn();
    vi.spyOn(socialApi, 'summary').mockResolvedValue({followersCount: 1, followingCount: 0, following: false, canFollow: true});
    useAuthStore.setState({user: {id: 'viewer'} as never});
    await renderSheet({sender: {userId: 'u1', displayName: 'Иван Петров', avatarUrl: null, accountKind: 'player'}, onClose});
    fireEvent.click(await screen.findByRole('button', {name: 'Написать'}, {timeout:5000}));
    await waitFor(() => expect(api.findOrCreateDM).toHaveBeenCalledWith('u1'));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('chat-path')).toHaveTextContent('/chat/dm1'));
  });

  it('requests the summary before loading trophy history on demand', async () => {
    const summary = {...publicProfile};
    delete summary.trophyDetails;
    vi.mocked(api.fetchUserProfile).mockResolvedValue(summary);
    await renderSheet({sender:{userId:'u1',displayName:'Иван Петров',avatarUrl:null,accountKind:'player'},onClose:vi.fn()});
    await screen.findByText('Иван Петров');
    expect(api.fetchUserProfile).toHaveBeenCalledWith('u1', expect.objectContaining({summary:true,countersOnly:true}));
  });

  it('loads trophy history only after opening a trophy', async () => {
    const {trophyDetails, ...summary} = publicProfile;
    vi.mocked(api.fetchUserProfile).mockResolvedValue(summary);
    const history = vi.spyOn(api,'fetchUserTrophyDetails').mockResolvedValue(trophyDetails!);
    await renderSheet({sender:{userId:'u1',displayName:'Иван Петров',avatarUrl:null,accountKind:'player'},onClose:vi.fn()});
    await screen.findByText('Иван Петров');
    expect(history).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:/Победы в регулярке/}));
    expect(await screen.findByText('Кубок открытия')).toBeInTheDocument();
    expect(history).toHaveBeenCalledTimes(1);
  });

  it('uses fan counts from the profile without issuing a duplicate summary request', async () => {
    useAuthStore.setState({user:{id:'viewer'} as never});
    vi.mocked(api.fetchUserProfile).mockResolvedValue({...publicProfile,social:{followersCount:2,followingCount:0,following:false,canFollow:true}});
    const summary = vi.spyOn(socialApi,'summary');
    await renderSheet({sender:{userId:'u1',displayName:'Иван Петров',avatarUrl:null,accountKind:'player'},onClose:vi.fn()});
    await screen.findByText('Иван Петров');
    expect(summary).not.toHaveBeenCalled();
  });

  it('keeps the profile visible when trophy history fails and allows retry', async () => {
    const {trophyDetails,...summary} = publicProfile;
    vi.mocked(api.fetchUserProfile).mockResolvedValue(summary);
    const history = vi.spyOn(api,'fetchUserTrophyDetails').mockRejectedValue(new Error('Offline'));
    await renderSheet({sender:{userId:'u1',displayName:'Иван Петров',avatarUrl:null,accountKind:'player'},onClose:vi.fn()});
    await screen.findByText('Иван Петров');
    fireEvent.click(screen.getByRole('button',{name:/Победы в регулярке/}));
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить награды');
    history.mockResolvedValue(trophyDetails!);
    fireEvent.click(screen.getByRole('button',{name:'Повторить'}));
    expect(await screen.findByText('Кубок открытия')).toBeInTheDocument();
    expect(screen.getByText('Иван Петров')).toBeInTheDocument();
  });

  beforeEach(() => {
    useAuthStore.setState({ accessToken: null, refreshToken: null, user: null });
    useDailyStore.setState({ data: null, loading: false, inFlight: false, error: null });
    vi.spyOn(api, 'findOrCreateDM').mockResolvedValue({ chatId: 'dm1', created: false });
    vi.spyOn(api, 'fetchUserProfile').mockResolvedValue(publicProfile);
    vi.spyOn(amateurDuelApi, 'fetchAmateurMatches').mockResolvedValue({ matches: [] });
    vi.spyOn(amateurDuelApi, 'checkAmateurDuelChallengeAvailability').mockResolvedValue({
      available: true,
    });
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

  it('opens the same tournament history modal from a public profile', async () => {
    await renderSheet({
      sender: { userId: 'u1', displayName: 'Иван Петров', avatarUrl: null },
      onClose: vi.fn(),
    });

    fireEvent.click(await screen.findByRole('button', { name: /победы в регулярке/i }));

    expect(await screen.findByRole('dialog', { name: 'Победы в регулярке (1)' })).toHaveTextContent(
      'Кубок открытия',
    );
  });

  it('reveals completed challenge tasks from a public profile only after selecting a challenge', async () => {
    vi.mocked(api.fetchUserProfile).mockResolvedValueOnce({
      ...publicProfile,
      trophySummary: {
        regularSeasonWins: publicProfile.trophySummary?.regularSeasonWins ?? 0,
        tournamentChampionships: publicProfile.trophySummary?.tournamentChampionships ?? 0,
        tournamentPodiums: publicProfile.trophySummary?.tournamentPodiums ?? 0,
        completedChallenges: 1,
      },
      trophyDetails: {
        regularSeasonWins: publicProfile.trophyDetails?.regularSeasonWins ?? [],
        tournamentChampionships: publicProfile.trophyDetails?.tournamentChampionships ?? [],
        tournamentPodiums: publicProfile.trophyDetails?.tournamentPodiums ?? [],
        completedChallenges: [
          {
            id: 'challenge-1',
            title: 'Неделя точности',
            startsAt: '2026-08-10T10:00:00.000Z',
            endsAt: '2026-08-17T10:00:00.000Z',
            tasks: [{ title: 'Забросить шайбы', progress: 41, target: 25 }],
          },
        ],
      },
    });
    await renderSheet({
      sender: { userId: 'u1', displayName: 'Иван Петров', avatarUrl: null },
      onClose: vi.fn(),
    });

    fireEvent.click(await screen.findByRole('button', { name: /пройденные челленджи/i }));

    const dialog = await screen.findByRole('dialog', { name: 'Пройденные челленджи (1)' });
    expect(within(dialog).queryByRole('listitem')).not.toBeInTheDocument();

    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Завершён 17 августа, 13:00 МСК' }),
    );
    expect(within(dialog).getByRole('listitem')).toHaveTextContent('Забросить шайбы');
    expect(within(dialog).getByRole('listitem')).toHaveTextContent('41 / 25');
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
    await waitFor(() => expect(screen.getByText('Иван Петров')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /написать в личку/i })).not.toBeInTheDocument();
    expect(await screen.findByText('Любитель')).toBeInTheDocument();
    expect(screen.getByText('Шайбы')).toBeInTheDocument();
    expect(screen.getByText('64')).toBeInTheDocument();
    expect(screen.getByText('(12)')).toBeInTheDocument();
    expect(screen.getByText('Задания · 1/1, уровни · 1/1')).toBeInTheDocument();
    expect(screen.getByLabelText('Публичный спортивный паспорт')).toBeInTheDocument();
    expect(screen.queryByLabelText('Монеты: 220')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Звёзды: 20')).not.toBeInTheDocument();
    const experienceBadge = screen.getByLabelText('Опыт: 100000');
    expect(experienceBadge).toHaveTextContent('100 000');
    expect(experienceBadge.querySelector('.public-profile-experience__value')).toBeInTheDocument();
    expect(screen.getByLabelText('Витрина наград')).toHaveTextContent('Чемпионства');
    expect(
      screen.getByLabelText('Витрина наград').querySelectorAll('.profile-fitted-number'),
    ).toHaveLength(4);
    expect(screen.getByText('Любитель')).toHaveClass('public-profile-status');
    expect(screen.queryByRole('button', { name: /Первая шайба.*получено/i })).not.toBeInTheDocument();
    const identity = screen.getByText('Иван Петров').closest('.public-profile-social-identity')?.querySelector('.profile-identity__main');
    expect(identity).toHaveClass('public-profile-identity');
    expect(identity?.querySelector('[aria-hidden="true"]')).toHaveStyle({
      width: '80px',
      height: '80px',
    });
    expect(identity?.querySelector('.public-profile-experience')).toBeInTheDocument();
    expect(screen.getByText('Иван Петров')).toHaveClass('public-profile-name-text');
    expect(screen.getByRole('dialog', { name: 'Профиль игрока' })).toHaveClass('sheet-card');
    expect(screen.getByRole('dialog', { name: 'Профиль игрока' }).firstElementChild).toHaveClass(
      'sheet-drag-handle',
    );
    expect(
      screen
        .getByRole('heading', { name: 'Профиль игрока' })
        .parentElement?.querySelector(':scope > button[aria-label="Закрыть"]'),
    ).toBeInTheDocument();
  });

  it('explains the early player status from a public profile in third person', async () => {
    await renderSheet({
      sender: { userId: 'u1', displayName: 'Иван Петров', avatarUrl: null },
      onClose: () => {},
    });

    const statusButton = await screen.findByRole('button', { name: 'Статус: У истоков' });
    const statusIcon = within(statusButton).getByTestId('public-profile-early-player-icon');
    expect(statusIcon).toHaveAttribute('width', '21');
    expect(statusIcon).toHaveAttribute('height', '21');
    expect(statusIcon).toHaveAttribute('stroke-width', '1.8');

    fireEvent.click(statusButton);

    const dialog = screen.getByRole('dialog', { name: 'Ранний игрок' });
    expect(dialog).toHaveTextContent(
      'Игрок присоединился к игре «Ультимейт Хоккей» на старте проекта.',
    );
    expect(within(dialog).getByRole('button', { name: 'Понятно' })).toBeInTheDocument();
  });

  it('explains the early player status in first person when opening yourself from chat', async () => {
    useAuthStore.setState({
      accessToken: 'token',
      refreshToken: 'refresh',
      user: { id: 'u1', displayName: 'Иван Петров', grip: 'right' },
    });
    await renderSheet({
      sender: { userId: 'u1', displayName: 'Иван Петров', avatarUrl: null },
      onClose: () => {},
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Статус: У истоков' }));

    const dialog = screen.getByRole('dialog', { name: 'Ранний игрок' });
    expect(dialog).toHaveTextContent(
      'Вы присоединились к игре «Ультимейт Хоккей» на старте проекта.',
    );
    expect(dialog).not.toHaveTextContent('Игрок присоединился');
  });

  it('shows started task chains with their completed level in a public profile', async () => {
    vi.mocked(api.fetchUserProfile).mockResolvedValueOnce({
      ...publicProfile,
      achievements: [
        ...publicProfile.achievements,
        {
          id: 'career-goals',
          photoUrl: '/achievements/goals.webp',
          title: 'Заброшено шайб',
          description: 'Карьерная цепочка',
          requirement: 'Забросить 10 000 шайб',
          status: 'locked',
          isUnlocked: false,
          stage: {
            current: 3,
            total: 8,
            requirement: 'Забросить 10 000 шайб',
            progressValue: 6000,
            targetValue: 10000,
            history: [
              { stageNumber: 1, claimedAt: '2026-09-01T00:00:00.000Z', requirement: '1 000 шайб' },
              { stageNumber: 2, claimedAt: '2026-09-02T00:00:00.000Z', requirement: '5 000 шайб' },
            ],
          },
        },
      ],
    });

    await renderSheet({
      sender: { userId: 'u1', displayName: 'Иван Петров', avatarUrl: null },
      onClose: () => {},
    });

    expect(await screen.findByText('Задания · 1/2, уровни · 3/9')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Заброшено шайб/ })).not.toBeInTheDocument();
    expect(document.querySelector('img[src="/achievements/goals.webp"]')).toBeNull();
  });

  it('uses the compact achievement title treatment for training monster', async () => {
    useAuthStore.setState({ user: { id: 'u1', displayName: 'Иван Петров' } });
    vi.spyOn(api, 'fetchUserProfile').mockResolvedValue({
      ...publicProfile,
      achievements: [
        {
          ...publicProfile.achievements[0]!,
          id: 'training-monster',
          title: 'Тренировочный монстр',
        },
      ],
    });

    await renderSheet({
      sender: { userId: 'u1', displayName: 'Иван Петров', avatarUrl: null },
      onClose: () => {},
    });

    const achievement = await screen.findByRole('button', {
      name: /Тренировочный монстр.*получено/i,
    });
    expect(achievement.querySelector('.profile-achievement-title')).toHaveClass(
      'profile-achievement-title--compact',
    );
  });

  it('renders an official account card without loading a player profile', async () => {
    await renderSheet({
      sender: {
        userId: 'official-1',
        displayName: 'Ультимейт Хоккей',
        avatarUrl: null,
        accountKind: 'official',
      },
      onClose: vi.fn(),
    });

    expect(screen.getByRole('heading', { name: 'Ультимейт Хоккей' })).toBeInTheDocument();
    expect(screen.getByText('Официальный аккаунт')).toBeInTheDocument();
    expect(screen.getByTestId('official-account-hero')).toHaveStyle({
      backgroundImage: 'url("/icons/official-account-cover.webp")',
    });
    expect(screen.queryByRole('img', { name: 'Ультимейт Хоккей' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Открыть сообщество ВКонтакте' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Открыть канал в Telegram' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Написать в личку' })).toBeInTheDocument();
    expect(api.fetchUserProfile).not.toHaveBeenCalled();
  });

  it('hides the message action when the official dialog is already open', async () => {
    await renderSheet({
      sender: {
        userId: 'official-1',
        displayName: 'Ультимейт Хоккей',
        avatarUrl: null,
        accountKind: 'official',
      },
      onClose: vi.fn(),
      hideMessageAction: true,
    });

    expect(screen.queryByRole('button', { name: 'Написать в личку' })).not.toBeInTheDocument();
  });

  it('opens achievement details without a completion badge and with a square full-width image', async () => {
    useAuthStore.setState({ user: { id: 'u1', displayName: 'Иван Петров' } });
    await renderSheet({
      sender: { userId: 'u1', displayName: 'Иван Петров', avatarUrl: null },
      onClose: () => {},
    });

    fireEvent.click(await screen.findByRole('button', { name: /Первая шайба.*получено/i }));

    const dialog = screen.getByRole('dialog', { name: 'Первая шайба' });
    expect(dialog).toHaveClass('achievement-details-modal');
    expect(dialog).toHaveClass('achievement-details-modal--crisp');
    expect(screen.getByRole('img', { name: 'Первая шайба' })).toHaveClass(
      'achievement-details-modal__image',
    );
    expect(screen.queryByText('Выполнено')).not.toBeInTheDocument();
  });

  it('shows the same tier progress details in a own profile opened from chat', async () => {
    useAuthStore.setState({ user: { id: 'u1', displayName: 'Иван Петров' } });
    vi.mocked(api.fetchUserProfile).mockResolvedValue({
      ...publicProfile,
      achievements: [
        {
          ...publicProfile.achievements[0]!,
          id: 'career-goals',
          title: 'Заброшено шайб',
          status: 'locked',
          isUnlocked: false,
          stage: {
            current: 3,
            total: 8,
            requirement: 'Забросить 10 000 шайб',
            progressValue: 6000,
            targetValue: 10000,
            history: [
              { stageNumber: 1, claimedAt: '2026-09-01T00:00:00.000Z', requirement: '1 000 шайб' },
              { stageNumber: 2, claimedAt: '2026-09-02T00:00:00.000Z', requirement: '5 000 шайб' },
            ],
          },
        },
      ],
    });
    await renderSheet({
      sender: { userId: 'u1', displayName: 'Иван Петров', avatarUrl: null },
      onClose: () => {},
    });

    fireEvent.click(await screen.findByRole('button', { name: /Заброшено шайб.*не получено/i }));
    const details = within(screen.getByRole('dialog', { name: 'Заброшено шайб' }));
    expect(details.getByText('Текущий уровень — 2/8')).toHaveClass('achievement-details-modal__level');
    expect(details.queryByText('Пройдено 2 из 8 уровней')).toBeNull();
    expect(details.getByText('Задание для уровня 3')).toBeInTheDocument();
    expect(details.getByText('6 000 / 10 000')).toBeInTheDocument();
    expect(details.queryByText('Далее — уровень 4')).toBeNull();
  });

  it('keeps zero achievement counters without an empty artwork panel', async () => {
    vi.mocked(api.fetchUserProfile).mockResolvedValue({
      ...publicProfile,
      achievements: [],
    });

    await renderSheet({
      sender: { userId: 'u1', displayName: 'Иван Петров', avatarUrl: null },
      onClose: () => {},
    });

    await waitFor(() => expect(screen.getByText('Иван Петров')).toBeInTheDocument());
    expect(screen.getByText('Задания · 0/0, уровни · 0/0')).toBeInTheDocument();
  });

  it('shows stored counters without loading or recounting achievement artwork', async () => {
    vi.mocked(api.fetchUserProfile).mockResolvedValue({
      ...publicProfile, achievements: [],
      achievementSummary: { completed: 10, total: 53, levels: { completed: 120, total: 281 } },
    });
    await renderSheet({ sender: { userId: 'u1', displayName: 'Иван Петров', avatarUrl: null }, onClose: vi.fn() });
    expect(await screen.findByText('Задания · 10/53, уровни · 120/281')).toBeInTheDocument();
    expect(screen.queryByText('Первая шайба')).not.toBeInTheDocument();
    expect(document.querySelector('img[src="/sprites/gate.webp"]')).toBeNull();
  });

  it('does not duplicate the message action below the profile',async()=>{
    await renderSheet({sender:{userId:'u1',displayName:'Иван',avatarUrl:null},onClose:()=>{}});
    expect(screen.queryByRole('button',{name:/написать в личку/i})).not.toBeInTheDocument();
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
        queryClient.setQueryData(userKeys.summary('me','me'), {
          ...publicProfile,
          id: 'me',
          competitionLevel: 'beginner',
        });
        queryClient.setQueryData(userKeys.summary('me','u1'), publicProfile);
      },
    );

    expect(await screen.findByText('Любитель')).toBeInTheDocument();
    await waitFor(() => expect(qc.isFetching()).toBe(0));
    await waitFor(() => expect(qc.isMutating()).toBe(0));
    expect(screen.queryByRole('button', { name: /вызвать на дуэль/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /написать в личку/i })).not.toBeInTheDocument();
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
        queryClient.setQueryData(userKeys.summary('me','u1'), publicProfile);
      },
    );

    expect(await screen.findByText('Это ваш профиль')).toBeInTheDocument();
    await waitFor(() => expect(qc.isFetching()).toBe(0));
    expect(screen.queryByRole('button', { name: /написать в личку/i })).not.toBeInTheDocument();
  });

  it('refreshes an open duel status while the profile stays open', async () => {
    vi.mocked(amateurDuelApi.fetchAmateurMatches).mockResolvedValueOnce({ matches: [
      { id: 'duel', status: 'active', opponent: { user_id: 'u1' } } as amateurDuelApi.AmateurDuelMatch,
    ] });
    useAuthStore.setState({ accessToken: 'tok', refreshToken: null,
      user: { id: 'me', displayName: 'Me', competitionLevel: 'amateur' } });
    const { qc } = await renderSheet({
      sender: { userId: 'u1', displayName: 'Иван', avatarUrl: null }, onClose: vi.fn(),
    }, (client) => {
      client.setQueryData(userKeys.summary('me', 'me'), { ...publicProfile, id: 'me' });
      client.setQueryData(userKeys.summary('me', 'u1'), publicProfile);
      client.setQueryData(['amateur-duel', 'matches'], {
        matches: [{ id: 'duel', status: 'active', opponent: { user_id: 'u1' } }],
      });
    });
    expect(await screen.findByText('Дуэль уже открыта')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Дуэль уже открыта')).not.toBeInTheDocument(), { timeout: 4500 });
    expect(amateurDuelApi.fetchAmateurMatches).toHaveBeenCalled();
    qc.clear();
  });

  it('lets amateur users choose duel type before challenging from the profile sheet', async () => {
    useAuthStore.setState({
      accessToken: 'tok',
      refreshToken: 'rtok',
      user: { id: 'me', displayName: 'Me', competitionLevel: 'amateur' },
    });
    useDailyStore.setState({
      data: {
        lifetime_total_goals: 300,
        amateur_unlock_goals_required: 300,
      } as DailyStateResponse,
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
        queryClient.setQueryData(userKeys.summary('me','me'), { ...publicProfile, id: 'me' });
        queryClient.setQueryData(userKeys.summary('me','u1'), publicProfile);
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

  it('shows a toast without opening duel setup for a future playoff opponent', async () => {
    useAuthStore.setState({
      accessToken: 'tok',
      refreshToken: 'rtok',
      user: { id: 'me', displayName: 'Me' },
    });
    vi.mocked(api.fetchUserProfile).mockImplementation(async (userId) =>
      userId === 'me' ? { ...publicProfile, id: 'me' } : publicProfile,
    );
    vi.mocked(amateurDuelApi.checkAmateurDuelChallengeAvailability).mockRejectedValueOnce(
      new ApiError(
        409,
        'playoff_opponent_blocked',
        'Сегодня у вас игровой день серии плей-офф с этим соперником. Обычные дуэли между вами недоступны.',
      ),
    );

    await renderSheet({
      sender: { userId: 'u1', displayName: 'Иван', avatarUrl: null },
      onClose: vi.fn(),
    });
    fireEvent.click(await screen.findByRole('button', { name: /вызвать на дуэль/i }));

    const toast = await screen.findByRole('status');
    expect(toast).toHaveClass('achievement-reward-toast');
    expect(toast).toHaveTextContent(
      'Сегодня у вас игровой день серии плей-офф с этим соперником. Обычные дуэли между вами недоступны.',
    );
    expect(screen.queryByRole('dialog', { name: 'Выбор типа дуэли' })).not.toBeInTheDocument();
    expect(amateurDuelApi.challengeAmateurDuel).not.toHaveBeenCalled();
  });

  it('shows a reward-style toast when the opponent has no open duel places', async () => {
    useAuthStore.setState({ accessToken: 'tok', refreshToken: 'rtok',
      user: { id: 'me', displayName: 'Me', competitionLevel: 'amateur' } });
    vi.mocked(api.fetchUserProfile).mockImplementation(async (userId) =>
      userId === 'me' ? { ...publicProfile, id: 'me' } : publicProfile);
    vi.mocked(amateurDuelApi.checkAmateurDuelChallengeAvailability).mockResolvedValue({
      available: false,
      formats: { express: { available: false, reason: 'open_slots', retryAt: null, player: 'opponent' },
        express_plus: { available: false, reason: 'open_slots', retryAt: null, player: 'opponent' },
        classic: { available: false, reason: 'open_slots', retryAt: null, player: 'opponent' } },
    });
    await renderSheet({ sender: { userId: 'u1', displayName: 'Иван', avatarUrl: null }, onClose: vi.fn() });
    const button = await screen.findByRole('button', { name: /вызвать на дуэль/i });
    await waitFor(() => expect(button).toHaveAttribute('aria-disabled', 'true'));
    fireEvent.click(button);
    expect(await screen.findByRole('status')).toHaveClass('achievement-reward-toast');
    expect(screen.getByText('Дуэль недоступна')).toHaveClass('achievement-reward-toast__status');
    expect(screen.getByRole('status')).toHaveTextContent('У соперника уже две открытые дуэли.');
    expect(screen.queryByRole('dialog', { name: 'Выбор типа дуэли' })).not.toBeInTheDocument();
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
