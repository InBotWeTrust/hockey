import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AchievementDto } from '../api/achievements.js';
import { useAuthStore } from '../auth/authStore.js';
import { AchievementsScreen } from './AchievementsScreen.js';

function makeAchievement(overrides: Partial<AchievementDto>): AchievementDto {
  return {
    id: 'achievement',
    photoUrl: '/achievements/first-goal.webp',
    title: 'Задание',
    description: 'Описание',
    requirement: 'Условие',
    category: 'daily',
    availability: 'active',
    futureTag: null,
    rewardCurrency: 0,
    rewardStars: 0,
    rewardExperience: 0,
    status: 'locked',
    isUnlocked: false,
    isClaimable: false,
    ...overrides,
  };
}

function mockAchievementsApi(achievements: AchievementDto[], unclaimedCount = 0): void {
  vi.mocked(globalThis.fetch).mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/api/achievements')) {
      return Promise.resolve(
        new Response(JSON.stringify({ achievements, unclaimedCount }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }
    if (url.endsWith('/api/weekly-challenge/current')) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            challenge: {
              id: 'challenge-1',
              title: 'Неделя снайпера',
              status: 'running',
              canClaimReward: true,
            },
            pendingRewards: [],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
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

function renderAchievements(): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/achievements']}>
        <AchievementsScreen />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function ProfileAchievementCount(): JSX.Element {
  const profileQuery = useQuery<{ achievements: Array<{ id: string }> }>({
    queryKey: ['profile'],
    queryFn: async () => {
      const response = await globalThis.fetch('/api/me');
      return (await response.json()) as { achievements: Array<{ id: string }> };
    },
  });

  return (
    <output aria-label="Полученных достижений в профиле">
      {profileQuery.data?.achievements.length ?? 0}
    </output>
  );
}

function renderAchievementsWithCachedProfile(achievementCount: number): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  client.setQueryDefaults(['profile'], { staleTime: Infinity });
  client.setQueryData(['profile'], {
    achievements: Array.from({ length: achievementCount }, (_, index) => ({ id: `${index}` })),
  });
  render(
    <QueryClientProvider client={client}>
      <ProfileAchievementCount />
      <MemoryRouter initialEntries={['/achievements']}>
        <AchievementsScreen />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AchievementsScreen', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.setState({
      user: { id: 'u1', displayName: 'Игрок', competitionLevel: 'amateur' },
    });
    vi.spyOn(globalThis, 'fetch');
    mockAchievementsApi([]);
  });

  it('shows the challenge tab inside achievements', async () => {
    renderAchievements();

    expect(screen.getByRole('button', { name: 'Назад' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Задания' })).toBeInTheDocument();
    expect(await screen.findByRole('tab', { name: 'Задания', selected: true })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Челленджи' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Забрать' })).toBeNull();
    expect(await screen.findByLabelText('Требуется действие')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Челлендж недели' })).toBeNull();
  });

  it('does not show challenge attention for a beginner', async () => {
    useAuthStore.setState({
      user: { id: 'u1', displayName: 'Новичок', competitionLevel: 'beginner' },
    });
    renderAchievements();

    expect(await screen.findByRole('tab', { name: 'Челленджи' })).toBeInTheDocument();
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(screen.queryByLabelText('Требуется действие')).toBeNull();
  });

  it('does not show challenge attention for future or running challenges without a claimable reward', async () => {
    vi.mocked(globalThis.fetch).mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/weekly-challenge/current')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              challenge: { id: 'challenge-1', status: 'running', canClaimReward: false },
              pendingRewards: [{ id: 'challenge-future', status: 'future', canClaimReward: false }],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ achievements: [], unclaimedCount: 0 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });
    renderAchievements();

    await screen.findByRole('tab', { name: 'Челленджи' });
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByLabelText('Требуется действие')).toBeNull());
  });

  it('marks the achievements tab when an achievement reward is waiting', async () => {
    mockAchievementsApi(
      [
        makeAchievement({
          id: 'daily-ready',
          title: 'День 2',
          category: 'daily',
          status: 'completed_unclaimed',
          isUnlocked: true,
          isClaimable: true,
        }),
      ],
      1,
    );
    renderAchievements();

    expect(await screen.findByRole('tab', { name: 'Задания', selected: true })).toBeInTheDocument();
    expect(await screen.findByText('Задания · 1/1, уровни · 1/1')).toBeInTheDocument();
    expect((await screen.findAllByLabelText('Требуется действие')).length).toBeGreaterThanOrEqual(
      1,
    );
  });

  it('defers list artwork so an achievements catalog does not decode every card at once', async () => {
    mockAchievementsApi([makeAchievement({ title: 'Первая шайба' })]);
    renderAchievements();

    const card = (await screen.findByText('Первая шайба')).closest('.achievement-card');
    expect(card).not.toBeNull();
    const artwork = within(card as HTMLElement).getByRole('img', { hidden: true });
    expect(artwork).toHaveAttribute(
      'loading',
      'lazy',
    );
    expect(artwork).toHaveAttribute('src', '/achievements/thumbnails/first-goal.webp');
  });

  it('opens achievement details in the shared accessible modal', async () => {
    mockAchievementsApi([
      makeAchievement({
        title: 'Первая шайба',
        photoUrl: '/achievements/first-goal.webp?v=20260906-hd1',
      }),
    ]);
    renderAchievements();

    const card = (await screen.findByText('Первая шайба')).closest('button');
    expect(card).not.toBeNull();
    fireEvent.click(card!);

    const dialog = screen.getByRole('dialog', { name: 'Первая шайба' });
    expect(dialog).toHaveClass('achievement-details-modal', 'achievement-details-modal--crisp');
    const details = within(dialog);
    const artwork = details.getByRole('img', { name: 'Первая шайба' });
    const description = details.getByText('Условие');
    expect(artwork).toHaveAttribute('src', '/achievements/first-goal.webp?v=20260906-hd1');
    expect(details.queryByText('Описание')).toBeNull();
    expect(
      artwork.compareDocumentPosition(description) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    expect(screen.getByRole('button', { name: 'Закрыть окно' })).toBeInTheDocument();
    expect(document.body.firstElementChild).toHaveAttribute('inert');
  });

  it('shows the exact requirement for a one-off achievement on the card and in details', async () => {
    mockAchievementsApi([
      makeAchievement({ title: 'Первая шайба', requirement: 'Забросить первую шайбу в игре.' }),
    ]);
    renderAchievements();

    const title = await screen.findByText('Первая шайба');
    expect(title.closest('.achievement-card')).toHaveClass('achievement-card--list');
    expect(title.closest('.achievement-card__body')).not.toBeNull();
    expect(screen.getByText('Забросить первую шайбу в игре.')).toHaveClass(
      'achievement-card__requirement',
    );

    fireEvent.click(screen.getByRole('button', { name: /Первая шайба.*Открыть подробности/ }));
    const dialog = screen.getByRole('dialog', { name: 'Первая шайба' });
    expect(within(dialog).queryByText('Описание')).toBeNull();
    expect(within(dialog).queryByText('Что сделать')).toBeNull();
    expect(within(dialog).getByText('Забросить первую шайбу в игре.')).toHaveClass(
      'achievement-details-modal__description',
    );
    expect(within(dialog).queryByRole('progressbar')).toBeNull();
    expect(within(dialog).queryByText('0 из 1')).toBeNull();
  });

  it('shows a career chain as one card with current stage progress and claimed history', async () => {
    mockAchievementsApi([
      makeAchievement({
        id: 'career-goals',
        title: 'Снайперская карьера',
        category: 'career',
        requirement: 'Забросить 5 000 шайб',
        rewardStars: 10,
        stage: {
          current: 2,
          total: 8,
          requirement: 'Забросить 5 000 шайб',
          progressValue: 3200,
          targetValue: 5000,
          history: [
            { stageNumber: 1, claimedAt: '2026-09-01T00:00:00.000Z', requirement: '1 000 шайб' },
          ],
        },
      }),
    ]);
    renderAchievements();

    expect(await screen.findByRole('tab', { name: 'Карьера' })).toBeInTheDocument();
    const card = (await screen.findByText('Снайперская карьера')).closest(
      '.achievement-card',
    ) as HTMLElement;
    expect(card).toHaveClass('achievement-card--list');
    expect(within(card).getByText('Уровень 2 из 8')).toHaveClass('achievement-card__stage');
    const reward = within(card).getByLabelText('Награда: 10 зв.');
    expect(reward).toHaveClass('achievement-card__rewards--inline');
    expect(within(reward).getByText('10')).toBeInTheDocument();
    expect(within(card).queryByText(/зв\.|опыта/)).toBeNull();
    const progress = within(card).getByRole('progressbar', { name: 'Прогресс достижения' });
    expect(progress).toHaveAttribute('aria-valuenow', '3200');
    expect(progress).toHaveAttribute('aria-valuemax', '5000');
    expect(within(progress).getByText('3 200 / 5 000')).toBeInTheDocument();

    fireEvent.click(within(card).getByRole('button', { name: /Снайперская карьера/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Снайперская карьера' });
    const details = within(dialog);
    expect(details.getByText('Описание')).toHaveClass('achievement-details-modal__description');
    expect(details.getByText('Текущий уровень — 1/8')).toHaveClass('achievement-details-modal__level');
    expect(details.queryByText('Пройдено 1 из 8 уровней')).toBeNull();
    expect(details.getByText('Задание для уровня 2')).toBeInTheDocument();
    expect(details.getByText('Забросить 5 000 шайб')).toBeInTheDocument();
    expect(details.getByText('3 200 / 5 000')).toBeInTheDocument();
    expect(details.queryByText('Далее — уровень 3')).toBeNull();
    expect(details.queryByText('Пройденные уровни')).toBeNull();
    expect(details.queryByText('Уровень 1 · 1 000 шайб')).toBeNull();
  });

  it('shows the completed state instead of a next level for the final claimed stage', async () => {
    mockAchievementsApi([
      makeAchievement({
        id: 'finished-chain',
        title: 'Легенда льда',
        status: 'claimed',
        isUnlocked: true,
        stage: {
          current: 3,
          total: 3,
          requirement: 'Провести 365 дней в игре',
          progressValue: 365,
          targetValue: 365,
          history: [
            { stageNumber: 1, claimedAt: '2026-09-01T00:00:00.000Z', requirement: '5 дней' },
            { stageNumber: 2, claimedAt: '2026-09-02T00:00:00.000Z', requirement: '10 дней' },
          ],
        },
      }),
    ]);
    renderAchievements();

    fireEvent.click(await screen.findByRole('button', { name: /Легенда льда.*Открыть подробности/ }));
    const details = within(screen.getByRole('dialog', { name: 'Легенда льда' }));
    expect(details.getByText('Текущий уровень — 3/3')).toHaveClass('achievement-details-modal__level');
    expect(details.queryByText('Пройдено 3 из 3 уровней')).toBeNull();
    expect(details.getByText('Задание для уровня 3')).toBeInTheDocument();
    expect(details.queryByText('Все уровни пройдены')).toBeNull();
    expect(details.queryByText(/Далее — уровень/)).toBeNull();
  });

  it('uses the same list layout for one-off achievements and only shows stage UI for chains', async () => {
    mockAchievementsApi([
      makeAchievement({
        id: 'one-off',
        title: 'Первая шайба',
        requirement: 'Забросить первую шайбу в игре.',
        rewardCurrency: 25,
      }),
    ]);
    renderAchievements();

    const card = (await screen.findByText('Первая шайба')).closest(
      '.achievement-card',
    ) as HTMLElement;
    expect(card).toHaveClass('achievement-card--list');
    expect(within(card).queryByText(/Уровень \d+ из \d+/)).toBeNull();
    expect(within(card).queryByRole('progressbar')).toBeNull();
    const reward = within(card).getByLabelText('Награда: 25 монет');
    expect(within(reward).getByText('25')).toBeInTheDocument();
  });

  it('keeps the full achievement title available when the card title is visually truncated', async () => {
    mockAchievementsApi([
      makeAchievement({ title: 'Без права на ошибку: Классика' }),
    ]);
    renderAchievements();

    expect(await screen.findByText('Без права на ошибку: Классика')).toHaveAttribute(
      'title',
      'Без права на ошибку: Классика',
    );
  });

  it('shows a prominent claim action on a completed card', async () => {
    mockAchievementsApi([
      makeAchievement({
        id: 'ready',
        title: 'Меткий бросок',
        status: 'completed_unclaimed',
        isUnlocked: true,
        isClaimable: true,
        rewardStars: 5,
      }),
    ]);
    renderAchievements();

    const card = (await screen.findByText('Меткий бросок')).closest(
      '.achievement-card',
    ) as HTMLElement;
    expect(card).toHaveClass('achievement-card--claimable');
    expect(within(card).getByRole('button', { name: 'Забрать награду' })).toBeInTheDocument();
  });

  it('shows completed and total counts in the section label for the selected filter', async () => {
    mockAchievementsApi([
      makeAchievement({
        id: 'daily-claimed',
        title: 'День 1',
        category: 'daily',
        status: 'claimed',
      }),
      makeAchievement({
        id: 'daily-ready',
        title: 'День 2',
        category: 'daily',
        status: 'completed_unclaimed',
        isUnlocked: true,
        isClaimable: true,
      }),
      makeAchievement({ id: 'daily-locked', title: 'День 3', category: 'daily' }),
      makeAchievement({ id: 'training-locked', title: 'Тренировочная цель', category: 'training' }),
      makeAchievement({
        id: 'future-locked',
        title: 'Турнир',
        category: 'tournament',
        availability: 'future',
      }),
    ]);
    renderAchievements();

    expect(await screen.findByText('Задания · 2/5, уровни · 2/5')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Все' })).toBeInTheDocument();
    const claimableTab = screen.getByRole('tab', { name: 'Забрать' });
    expect(claimableTab).toBeInTheDocument();
    expect(within(claimableTab).getByLabelText('Требуется действие')).toHaveClass(
      'segmented-tabs__attention--small',
    );
    expect(screen.getByRole('tab', { name: 'Ежедневная' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Тренировка' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Турниры' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Будущее' })).toBeInTheDocument();
    expect(screen.getByRole('tablist', { name: 'Фильтр заданий' })).toHaveClass(
      'segmented-tabs',
      'segmented-tabs--compact',
      'segmented-tabs--scrollable',
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Ежедневная' }));

    expect(screen.getByRole('tab', { name: 'Ежедневная', selected: true })).toBeInTheDocument();
    expect(screen.getByText('Задания · 2/3, уровни · 2/3')).toBeInTheDocument();
    expect(screen.getByText('День 1')).toBeInTheDocument();
    expect(screen.queryByText('Тренировочная цель')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Забрать' }));

    expect(screen.getByRole('tab', { name: 'Забрать', selected: true })).toBeInTheDocument();
    expect(screen.getByText('Задания · 1/1, уровни · 1/1')).toBeInTheDocument();
    expect(screen.getByText('День 2')).toBeInTheDocument();
    expect(screen.queryByText('День 1')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Тренировка' }));

    expect(screen.getByRole('tab', { name: 'Тренировка', selected: true })).toBeInTheDocument();
    expect(screen.getByText('Задания · 0/1, уровни · 0/1')).toBeInTheDocument();
    expect(screen.getByText('Тренировочная цель')).toBeInTheDocument();
    expect(screen.queryByText('День 1')).toBeNull();
  });

  it('counts a chain as one task and its claimed steps as completed levels', async () => {
    mockAchievementsApi([
      makeAchievement({
        id: 'career-chain',
        title: 'Снайперская карьера',
        category: 'career',
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
      }),
      makeAchievement({
        id: 'one-off-claimed',
        title: 'Первая шайба',
        category: 'career',
        status: 'claimed',
      }),
    ]);
    renderAchievements();

    expect(await screen.findByText('Задания · 1/2, уровни · 3/9')).toBeInTheDocument();
  });

  it('shows all ten active tournament achievements without future labels', async () => {
    const tournamentAchievements = [
      ['regular-season-champion', 'Победитель регулярки', 125, 250],
      ['regular-season-medalist', 'Призёр регулярки', 50, 100],
      ['playoff-semifinal', 'Турнирный характер', 75, 150],
      ['playoff-final', 'Финальный лёд', 125, 250],
      ['tournament-cup', 'Кубок над головой', 200, 400],
      ['dark-horse', 'Тёмная лошадка', 100, 200],
      ['death-bracket', 'Сетка смерти', 250, 500],
      ['series-comeback', 'Мощный камбэк', 150, 300],
      ['no-shake', 'Без дрожи', 75, 150],
      ['tournament-streak', 'Турнирная серия', 300, 700],
    ] as const;
    mockAchievementsApi(
      tournamentAchievements.map(([id, title, rewardCurrency, rewardExperience]) =>
        makeAchievement({
          id,
          title,
          category: 'tournament',
          rewardCurrency,
          rewardStars: rewardExperience,
          rewardExperience,
        }),
      ),
    );
    renderAchievements();

    fireEvent.click(await screen.findByRole('tab', { name: 'Турниры' }));

    expect(screen.getByText('Задания · 0/10, уровни · 0/10')).toBeInTheDocument();
    expect(screen.queryByText('Скоро')).toBeNull();
    expect(screen.getByText('Победитель регулярки')).toBeInTheDocument();
    expect(screen.getByText('Призёр регулярки')).toBeInTheDocument();
  });

  it('uses clear achievement statuses without changing catalogue order', async () => {
    mockAchievementsApi([
      makeAchievement({
        id: 'locked',
        title: 'Обычная цель',
        status: 'locked',
      }),
      makeAchievement({
        id: 'ready',
        title: 'Награда ждёт',
        status: 'completed_unclaimed',
        isUnlocked: true,
        isClaimable: true,
      }),
      makeAchievement({
        id: 'claimed',
        title: 'Уже получено',
        status: 'claimed',
        isUnlocked: true,
      }),
      makeAchievement({
        id: 'future',
        title: 'Будущая цель',
        availability: 'future',
      }),
    ]);
    renderAchievements();

    const readyTitle = await screen.findByText('Награда ждёт');
    const lockedTitle = screen.getByText('Обычная цель');
    expect(lockedTitle.compareDocumentPosition(readyTitle)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.getByText('Получено')).toBeInTheDocument();
    expect(screen.getByText('Скоро')).toBeInTheDocument();
    expect(screen.getAllByText('Не получено').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('tab', { name: 'Забрать' })).toBeInTheDocument();
    expect(screen.queryByText('Закрыто')).toBeNull();
    expect(screen.queryByText('Получить')).toBeNull();

    const cards = screen.getAllByRole('article');
    for (const card of cards) {
      expect(card.querySelector('img')).not.toHaveStyle({ filter: 'grayscale(1) saturate(0.1)' });
    }
    expect(document.querySelectorAll('.achievement-card__status')).toHaveLength(1);
    expect(document.querySelector('.achievement-card__status .lucide-check')).toBeInTheDocument();
  });

  it('claims a ready achievement directly from the card', async () => {
    const vibrate = vi.fn(() => true);
    Object.defineProperty(window.navigator, 'vibrate', { configurable: true, value: vibrate });
    const readyAchievement = makeAchievement({
      id: 'daily-ready',
      title: 'Награда ждёт',
      status: 'completed_unclaimed',
      isUnlocked: true,
      isClaimable: true,
      rewardCurrency: 10,
    });
    let claimed = false;
    vi.mocked(globalThis.fetch).mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/achievements')) {
        const achievement = claimed
          ? { ...readyAchievement, status: 'claimed', isClaimable: false }
          : readyAchievement;
        return Promise.resolve(
          new Response(
            JSON.stringify({ achievements: [achievement], unclaimedCount: claimed ? 0 : 1 }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          ),
        );
      }
      if (url.endsWith('/api/achievements/daily-ready/claim')) {
        claimed = true;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              achievement: {
                ...readyAchievement,
                status: 'claimed',
                isClaimable: false,
                claimedAt: '2026-05-31T20:00:00.000Z',
              },
              rewards: { currency: 10, stars: 0, experience: 0 },
              balances: { currencyBalance: 10, starBalance: 0, experienceBalance: 0 },
              stage: { claimed: 1, opened: 2 },
              unclaimedCount: 0,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }
      if (url.endsWith('/api/weekly-challenge/current')) {
        return Promise.resolve(
          new Response(JSON.stringify({ challenge: null, pendingRewards: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
    });
    renderAchievements();

    const claimableTab = await screen.findByRole('tab', { name: 'Забрать' });
    expect(within(claimableTab).getByLabelText('Требуется действие')).toBeInTheDocument();
    await screen.findByText('Награда ждёт');
    fireEvent.click(screen.getByRole('button', { name: 'Забрать награду' }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/achievements/daily-ready/claim',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    expect(await screen.findByText('+10 монет')).toBeInTheDocument();
    const rewardToast = screen.getByRole('status');
    expect(rewardToast).toHaveClass('achievement-reward-toast');
    expect(rewardToast).toHaveTextContent('Награда за достижение начислена');
    expect(rewardToast).toHaveTextContent('Награда ждёт');
    expect(rewardToast).toHaveTextContent('Следующий уровень открыт');
    expect(screen.getByTestId('achievement-reward-icon-coins')).toBeInTheDocument();
    expect(screen.getByTestId('achievement-reward-icon-coins').parentElement).toHaveClass(
      'achievement-reward-toast__icon',
    );
    expect(screen.getByTestId('achievement-reward-icon-coins').parentElement).toHaveTextContent(
      '+10 монет',
    );
    expect(screen.queryByText('+0 зв.', { exact: false })).toBeNull();
    expect(screen.queryByText('+0 опыта', { exact: false })).toBeNull();
    expect(vibrate).toHaveBeenCalledWith([10, 35, 15]);
    await waitFor(() => {
      expect(screen.queryByRole('tab', { name: 'Забрать' })).toBeNull();
    });
  });

  it('refreshes the cached profile achievements after claiming a reward', async () => {
    const readyAchievement = makeAchievement({
      id: 'tournament-cup',
      title: 'Кубок над головой',
      status: 'completed_unclaimed',
      isUnlocked: true,
      isClaimable: true,
      rewardCurrency: 3750,
    });
    vi.mocked(globalThis.fetch).mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/achievements')) {
        return Promise.resolve(
          new Response(JSON.stringify({ achievements: [readyAchievement], unclaimedCount: 1 }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }
      if (url.endsWith('/api/achievements/tournament-cup/claim')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              achievement: { ...readyAchievement, status: 'claimed', isClaimable: false },
              rewards: { currency: 3750, stars: 100, experience: 100, tokens: 5 },
              balances: { currencyBalance: 100, starBalance: 10, experienceBalance: 20 },
              unclaimedCount: 0,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }
      if (url.endsWith('/api/me')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              achievements: Array.from({ length: 24 }, (_, index) => ({ id: `${index}` })),
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }
      if (url.endsWith('/api/weekly-challenge/current')) {
        return Promise.resolve(
          new Response(JSON.stringify({ challenge: null, pendingRewards: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
    });
    renderAchievementsWithCachedProfile(23);

    expect(await screen.findByLabelText('Полученных достижений в профиле')).toHaveTextContent('23');
    await screen.findByText('Кубок над головой');
    fireEvent.click(screen.getByRole('button', { name: 'Забрать награду' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Полученных достижений в профиле')).toHaveTextContent('24');
    });
    expect(document.querySelector('.achievement-reward-toast')).not.toHaveTextContent(
      'Следующий уровень открыт',
    );
  });
});
