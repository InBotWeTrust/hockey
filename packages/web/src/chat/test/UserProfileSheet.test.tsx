import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { UserProfileSheet } from '../components/UserProfileSheet.js';
import * as api from '../api.js';
import * as amateurDuelApi from '../../api/amateurDuel.js';
import { useAuthStore } from '../../auth/authStore.js';

const publicProfile: api.UserPublicProfileDTO = {
  id: 'u1',
  displayName: 'Иван Петров',
  avatarUrl: null,
  competitionLevel: 'amateur',
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

function renderSheet(props: Parameters<typeof UserProfileSheet>[0]): { qc: QueryClient } {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/chat/c1']}>
        <Routes>
          <Route path="/chat/:chatId" element={<UserProfileSheet {...props} />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
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
    useAuthStore.setState({ accessToken: null, refreshToken: null, user: null });
  });

  it('returns null when sender is null', () => {
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <UserProfileSheet sender={null} onClose={() => {}} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders displayName, public stats and achievements when sender is provided', async () => {
    renderSheet({
      sender: { userId: 'u1', displayName: 'Иван Петров', avatarUrl: null },
      onClose: () => {},
    });
    expect(screen.getByText('Иван Петров')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /написать в личку/i })).toBeInTheDocument();
    expect(await screen.findByText('Любитель')).toBeInTheDocument();
    expect(screen.getByText('Броски')).toBeInTheDocument();
    expect(screen.getByText('128')).toBeInTheDocument();
    expect(screen.getByText('Голы')).toBeInTheDocument();
    expect(screen.getByText('64')).toBeInTheDocument();
    expect(screen.getByText('(12)')).toBeInTheDocument();
    expect(screen.getByText('Достижения (1/1)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Первая шайба.*получено/i })).toBeInTheDocument();
  });

  it('clicking "Написать в личку" calls findOrCreateDM and closes the sheet', async () => {
    const onClose = vi.fn();
    renderSheet({
      sender: { userId: 'u1', displayName: 'Иван', avatarUrl: null },
      onClose,
    });
    fireEvent.click(screen.getByRole('button', { name: /написать в личку/i }));
    await waitFor(() => expect(api.findOrCreateDM).toHaveBeenCalledWith('u1'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
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

    renderSheet({
      sender: { userId: 'u1', displayName: 'Иван', avatarUrl: null },
      onClose: () => {},
    });

    expect(await screen.findByText('Любитель')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /вызвать на дуэль/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /написать в личку/i })).toBeInTheDocument();
  });

  it('does not show a DM action when the sheet is opened for myself', async () => {
    useAuthStore.setState({
      accessToken: 'tok',
      refreshToken: 'rtok',
      user: { id: 'u1', displayName: 'Иван Петров' },
    });

    renderSheet({
      sender: { userId: 'u1', displayName: 'Иван Петров', avatarUrl: null },
      onClose: () => {},
    });

    expect(await screen.findByText('Это ваш профиль')).toBeInTheDocument();
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

    renderSheet({
      sender: { userId: 'u1', displayName: 'Иван', avatarUrl: null },
      onClose,
    });

    fireEvent.click(await screen.findByRole('button', { name: /вызвать на дуэль/i }));
    expect(await screen.findByRole('dialog', { name: 'Выбор типа дуэли' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Классика/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Вызвать$/i }));

    await waitFor(() =>
      expect(amateurDuelApi.challengeAmateurDuel).toHaveBeenCalledWith({
        template_id: 'template-classic',
        opponent_user_id: 'u1',
      }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('clicking the backdrop calls onClose', () => {
    const onClose = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <UserProfileSheet
            sender={{ userId: 'u1', displayName: 'Иван', avatarUrl: null }}
            onClose={onClose}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const backdrop = document.body.querySelector<HTMLElement>(
      '[data-testid="profile-sheet-backdrop"]',
    );
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalled();
  });
});
