import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AchievementDto } from '../api/achievements.js';
import type { RegularSeasonPodiumCongratulation } from '../api/tournament.js';
import { useDailyStore } from '../stores/dailyStore.js';
import { useTrainingSessionStore } from '../stores/trainingSessionStore.js';
import { SectionsScreen } from './SectionsScreen.js';

interface MockSectionsData {
  achievements?: AchievementDto[];
  achievementsUnclaimedCount?: number;
  weeklyChallenge?: Record<string, unknown> | null;
  weeklyPendingRewards?: Array<Record<string, unknown>>;
  dailyLifetimeTotalGoals?: number;
  dailyAmateurUnlockGoalsRequired?: number;
  dailyTotalShots?: number;
  profileCompetitionLevel?: 'beginner' | 'amateur' | 'professional';
  profileRequest?: 'error' | 'loading';
  pendingTournamentCongratulations?: RegularSeasonPodiumCongratulation[];
  acknowledgementRequest?: 'error';
}

function renderSections(): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/sections']}>
        <SectionsScreen />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function LocationProbe(): JSX.Element {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

function mockSectionsApi({
  achievements = [],
  achievementsUnclaimedCount = 1,
  weeklyChallenge = null,
  weeklyPendingRewards = [],
  dailyLifetimeTotalGoals = 300,
  dailyAmateurUnlockGoalsRequired = 300,
  dailyTotalShots = 0,
  profileCompetitionLevel,
  profileRequest,
  pendingTournamentCongratulations = [],
  acknowledgementRequest,
}: MockSectionsData = {}): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/api/achievements')) {
      return Promise.resolve(
        new Response(
          JSON.stringify({ achievements, unclaimedCount: achievementsUnclaimedCount }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );
    }
    if (url.endsWith('/api/weekly-challenge/current')) {
      return Promise.resolve(
        new Response(
          JSON.stringify({ challenge: weeklyChallenge, pendingRewards: weeklyPendingRewards }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );
    }
    if (url.endsWith('/api/duel/daily/state')) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            state: 'idle',
            shots_per_period: 30,
            total_periods: 3,
            daily_total_shots: dailyTotalShots,
            lifetime_total_goals: dailyLifetimeTotalGoals,
            amateur_unlock_goals_required: dailyAmateurUnlockGoalsRequired,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    }
    if (url.includes('/api/me')) {
      if (profileRequest === 'loading') return new Promise<Response>(() => undefined);
      if (profileRequest === 'error') {
        return Promise.resolve(
          new Response(JSON.stringify({ error: 'profile unavailable' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            competitionLevel: profileCompetitionLevel,
            pendingTournamentCongratulations,
          }),
          {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          },
        ),
      );
    }
    if (url.includes('/api/tournaments/congratulations/') && url.endsWith('/read')) {
      return Promise.resolve(
        new Response(
          JSON.stringify(
            acknowledgementRequest === 'error'
              ? { error: { code: 'internal', message: 'failed' } }
              : { acknowledged: true },
          ),
          {
            status: acknowledgementRequest === 'error' ? 500 : 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );
    }
    if (url.endsWith('/api/duel/training/state')) {
      return Promise.resolve(
        new Response(JSON.stringify({ state: 'idle', shots_limit: 500, shots_taken: 0 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }
    return Promise.resolve(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });
}

function sectionAchievement(
  id: string,
  status: AchievementDto['status'],
): AchievementDto {
  return {
    id,
    photoUrl: '/achievements/first-goal.webp',
    title: id,
    description: 'Описание',
    requirement: 'Условие',
    category: 'daily',
    availability: 'active',
    futureTag: null,
    rewardCurrency: 0,
    rewardStars: 0,
    rewardExperience: 0,
    status,
    isUnlocked: status !== 'locked',
    isClaimable: status === 'completed_unclaimed',
  };
}

describe('SectionsScreen', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useDailyStore.setState({ data: null, loading: false, error: null, inFlight: false });
    useTrainingSessionStore.setState({ data: null, loading: false, error: null, inFlight: false });
  });

  it('shows today after the current daily shot progress', async () => {
    mockSectionsApi({ dailyTotalShots: 50 });
    renderSections();

    expect(await screen.findByText('50/90 бросков сегодня')).toBeInTheDocument();
  });

  it('shows pending podium congratulations oldest first and advances after acknowledgement', async () => {
    mockSectionsApi({
      pendingTournamentCongratulations: [
        {
          id: '00000000-0000-4000-8000-000000000951',
          tournamentId: '00000000-0000-4000-8000-000000000961',
          tournamentTitle: 'Первый турнир',
          place: 1,
          reward: { coins: 5000, stars: 25, experience: 1500 },
          createdAt: '2026-09-02T21:00:00.000Z',
        },
        {
          id: '00000000-0000-4000-8000-000000000952',
          tournamentId: '00000000-0000-4000-8000-000000000962',
          tournamentTitle: 'Второй турнир',
          place: 2,
          reward: { coins: 3000, stars: 15, experience: 900 },
          createdAt: '2026-09-03T21:00:00.000Z',
        },
      ],
    });
    renderSections();

    expect(await screen.findByText('Первый турнир')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      '/api/me?includeTournamentCongratulations=true',
      expect.anything(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));

    expect(await screen.findByText('Второй турнир')).toBeInTheDocument();
    expect(screen.queryByText('Первый турнир')).toBeNull();
  });

  it('keeps the same congratulation open when acknowledgement fails', async () => {
    mockSectionsApi({
      acknowledgementRequest: 'error',
      pendingTournamentCongratulations: [
        {
          id: '00000000-0000-4000-8000-000000000953',
          tournamentId: '00000000-0000-4000-8000-000000000963',
          tournamentTitle: 'Турнир с ошибкой сети',
          place: 3,
          reward: { coins: 0, stars: 0, experience: 0 },
          createdAt: '2026-09-03T21:00:00.000Z',
        },
      ],
    });
    renderSections();

    expect(await screen.findByText('Турнир с ошибкой сети')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось закрыть. Попробуйте ещё раз.',
    );
    expect(screen.getByText('Турнир с ошибкой сети')).toBeInTheDocument();
  });

  it('marks the achievements section when an achievement reward is waiting', async () => {
    mockSectionsApi({
      achievements: [
        sectionAchievement('claimed', 'claimed'),
        sectionAchievement('waiting', 'completed_unclaimed'),
        sectionAchievement('locked', 'locked'),
      ],
    });
    renderSections();

    expect(await screen.findByText('2/3 наград')).toBeInTheDocument();
    expect(screen.getByLabelText('Требуется действие')).toBeInTheDocument();
  });

  it('keeps the weekly challenge out of the sections list', async () => {
    mockSectionsApi({
      achievementsUnclaimedCount: 0,
      weeklyChallenge: { id: 'challenge-1', title: 'Неделя снайпера', canJoin: true },
    });
    renderSections();

    expect(await screen.findByRole('button', { name: 'Задания' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Челлендж недели' })).toBeNull();
  });

  it('groups frequent actions before the longer game modes', async () => {
    // Break caught: the shop must not fall below the long list of progression modes on phones.
    mockSectionsApi();
    renderSections();

    const quickAccess = await screen.findByRole('region', { name: 'Быстрый доступ' });
    expect(
      within(quickAccess).getAllByRole('button').map((button) => button.getAttribute('aria-label')),
    ).toEqual(['Ежедневная игра', 'Тренировка', 'Задания', 'Магазин']);

    const modes = screen.getByRole('region', { name: 'Игровые режимы' });
    expect(within(modes).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual([
      'Любители',
      'Профессионалы',
    ]);
    within(quickAccess)
      .getAllByRole('button')
      .forEach((button) => expect(button).toHaveClass('section-card-surface'));
    within(modes)
      .getAllByRole('button')
      .forEach((button) => {
        expect(button).toHaveClass('section-card-surface');
        expect(button.querySelector('svg')).toHaveClass('card-chevron');
      });
  });

  it('uses wide daily and shop cards around one compact training and tasks row', async () => {
    // Break caught: all four quick actions used the same half-width card and lost hierarchy.
    mockSectionsApi();
    renderSections();

    const quickAccess = await screen.findByRole('region', { name: 'Быстрый доступ' });
    expect(within(quickAccess).getByRole('button', { name: 'Ежедневная игра' })).toHaveClass(
      'sections-quick-card--wide',
    );
    expect(within(quickAccess).getByRole('button', { name: 'Магазин' })).toHaveClass(
      'sections-quick-card--wide',
    );
    expect(within(quickAccess).getByRole('button', { name: 'Тренировка' })).not.toHaveClass(
      'sections-quick-card--wide',
    );
    expect(within(quickAccess).getByRole('button', { name: 'Задания' })).not.toHaveClass(
      'sections-quick-card--wide',
    );
    ['Ежедневная игра', 'Магазин'].forEach((name) => {
      expect(
        within(quickAccess).getByRole('button', { name }).querySelector('.card-chevron'),
      ).toBeInTheDocument();
    });
    ['Тренировка', 'Задания'].forEach((name) => {
      expect(
        within(quickAccess).getByRole('button', { name }).querySelector('.card-chevron'),
      ).toBeNull();
    });
  });

  it('starts directly with quick access without a duplicate page label', async () => {
    // Break caught: the redundant page label would waste vertical space above the first action.
    mockSectionsApi();
    renderSections();

    await screen.findByRole('region', { name: 'Быстрый доступ' });
    expect(screen.queryByText('Разделы')).toBeNull();
  });

  it('keeps bonus games and tournaments inside the amateur parent section', async () => {
    mockSectionsApi();
    renderSections();

    const amateur = await screen.findByRole('button', { name: 'Любители' });
    expect(amateur).toHaveTextContent('Дуэли, бонусные игры и турниры');
    expect(amateur).not.toHaveTextContent('Раздел открыт');
    expect(screen.queryByRole('button', { name: 'Бонусные игры' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Турниры' })).toBeNull();
  });

  it('shows only server-configured goal progress while the amateur section is locked', async () => {
    mockSectionsApi({
      dailyLifetimeTotalGoals: 42,
      dailyAmateurUnlockGoalsRequired: 750,
      profileCompetitionLevel: 'beginner',
    });
    renderSections();

    const amateur = await screen.findByRole('button', { name: 'Любители' });
    expect(amateur).toHaveTextContent('42/750 до открытия');
    expect(amateur).not.toHaveTextContent('Дуэли, бонусные игры и турниры');
    expect(amateur).not.toHaveTextContent('Раздел открыт');
  });

  it('keeps a single supporting line on the professional card', async () => {
    mockSectionsApi();
    renderSections();

    const professional = await screen.findByRole('button', { name: 'Профессионалы' });
    expect(within(professional).getByText('Игры самого высокого уровня')).toHaveStyle({
      fontSize: '12px',
      fontWeight: '850',
    });
    expect(professional).not.toHaveTextContent('Раздел в разработке');
  });

  it('opens the amateur section chooser for an unlocked player', async () => {
    mockSectionsApi({ profileCompetitionLevel: 'amateur' });
    renderSections();

    fireEvent.click(await screen.findByRole('button', { name: 'Любители' }));

    expect(screen.getByTestId('location')).toHaveTextContent(
      '/?view=amateur&from=sections',
    );
  });

  it('keeps the amateur parent locked until the amateur level is available', async () => {
    mockSectionsApi({ dailyLifetimeTotalGoals: 0, profileCompetitionLevel: 'beginner' });
    renderSections();

    fireEvent.click(await screen.findByRole('button', { name: 'Любители' }));

    expect(screen.getByTestId('location')).toHaveTextContent('/sections');
    expect(screen.getByRole('dialog', { name: 'Не хватает шайб' })).toBeInTheDocument();
  });

  it('opens the amateur parent for a server-authorized amateur below the daily goal threshold', async () => {
    mockSectionsApi({ dailyLifetimeTotalGoals: 0, profileCompetitionLevel: 'amateur' });
    renderSections();

    fireEvent.click(await screen.findByRole('button', { name: 'Любители' }));

    expect(screen.getByTestId('location')).toHaveTextContent(
      '/?view=amateur&from=sections',
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('focuses locked info and restores the exact section card after Escape', async () => {
    mockSectionsApi({ dailyLifetimeTotalGoals: 0, profileCompetitionLevel: 'beginner' });
    renderSections();
    const trigger = await screen.findByRole('button', { name: 'Любители' });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole('dialog', { name: 'Не хватает шайб' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Понятно' })).toHaveFocus());
    fireEvent.keyDown(dialog, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(trigger).toHaveFocus();
  });

  it.each([{ profileRequest: 'loading' as const }, { profileRequest: 'error' as const }])(
    'keeps the daily-goal fallback when the profile request is $profileRequest',
    async ({ profileRequest }) => {
      mockSectionsApi({
        dailyLifetimeTotalGoals: 300,
        profileRequest,
      });
      renderSections();

      fireEvent.click(await screen.findByRole('button', { name: 'Любители' }));

      expect(screen.getByTestId('location')).toHaveTextContent(
        '/?view=amateur&from=sections',
      );
      expect(screen.queryByRole('dialog')).toBeNull();
    },
  );

  it('keeps achievement progress visible while rewards and weekly actions need attention', async () => {
    mockSectionsApi({
      achievements: [
        sectionAchievement('claimed', 'claimed'),
        sectionAchievement('waiting', 'completed_unclaimed'),
        sectionAchievement('locked', 'locked'),
      ],
      achievementsUnclaimedCount: 2,
      weeklyChallenge: { id: 'challenge-1', title: 'Неделя снайпера', canJoin: true },
      weeklyPendingRewards: [{ id: 'challenge-old', title: 'Прошлая неделя' }],
    });
    renderSections();

    expect(await screen.findByText('2/3 наград')).toBeInTheDocument();
    expect(screen.getByLabelText('Требуется действие')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Челлендж недели' })).toBeNull();
  });
});
