import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AchievementDto } from '../api/achievements.js';
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
              canJoin: false,
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

describe('AchievementsScreen', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch');
    mockAchievementsApi([]);
  });

  it('shows the challenge tab inside achievements', async () => {
    renderAchievements();

    expect(screen.getByRole('button', { name: 'Назад' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Задания' })).toBeInTheDocument();
    expect(await screen.findByRole('tab', { name: 'Задания', selected: true })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Челленджи' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Получить' })).toBeNull();
    expect(await screen.findByLabelText('Требуется действие')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Челлендж недели' })).toBeNull();
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
    expect(await screen.findByText('Задания (1/1)')).toBeInTheDocument();
    expect((await screen.findAllByLabelText('Требуется действие')).length).toBeGreaterThanOrEqual(
      1,
    );
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

    expect(await screen.findByText('Задания (2/5)')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Все' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Получить' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Ежедневная' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Тренировка' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Турниры' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Будущее' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Ежедневная' }));

    expect(screen.getByRole('tab', { name: 'Ежедневная', selected: true })).toBeInTheDocument();
    expect(screen.getByText('Задания (2/3)')).toBeInTheDocument();
    expect(screen.getByText('День 1')).toBeInTheDocument();
    expect(screen.queryByText('Тренировочная цель')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Получить' }));

    expect(screen.getByRole('tab', { name: 'Получить', selected: true })).toBeInTheDocument();
    expect(screen.getByText('Задания (1/1)')).toBeInTheDocument();
    expect(screen.getByText('День 2')).toBeInTheDocument();
    expect(screen.queryByText('День 1')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Тренировка' }));

    expect(screen.getByRole('tab', { name: 'Тренировка', selected: true })).toBeInTheDocument();
    expect(screen.getByText('Задания (0/1)')).toBeInTheDocument();
    expect(screen.getByText('Тренировочная цель')).toBeInTheDocument();
    expect(screen.queryByText('День 1')).toBeNull();
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
    expect(screen.getByRole('tab', { name: 'Получить' })).toBeInTheDocument();
    expect(screen.queryByText('Закрыто')).toBeNull();
    expect(screen.queryByText('Забрать')).toBeNull();
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
      if (url.endsWith('/api/achievements/daily-ready/claim')) {
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

    const card = (await screen.findByText('Награда ждёт')).closest('button');
    expect(card).not.toBeNull();
    fireEvent.click(card as HTMLButtonElement);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/achievements/daily-ready/claim',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    expect(await screen.findByText('+10 монет')).toBeInTheDocument();
    expect(screen.queryByText('+0 зв.', { exact: false })).toBeNull();
    expect(screen.queryByText('+0 опыта', { exact: false })).toBeNull();
    expect(vibrate).toHaveBeenCalledWith([10, 35, 15]);
  });
});
