import { afterEach, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ProfileRewardsScreen, earnedHomeAchievements } from './ProfileRewardsScreen.js';
import type { ProfileAchievement } from './profileTypes.js';
const achievement = (extra: Partial<ProfileAchievement>): ProfileAchievement => ({
  id: 'a',
  photoUrl: '/a.webp',
  title: 'Award',
  description: '',
  requirement: '',
  isUnlocked: true,
  ...extra,
});
it('shows only collected awards, including earlier claimed stages of an unfinished achievement', () => {
  const claimed = achievement({ id: 'claimed', status: 'claimed' });
  const earlier = achievement({
    id: 'staged',
    status: 'locked',
    stage: {
      current: 2,
      total: 3,
      requirement: '',
      progressValue: 0,
      targetValue: 1,
      history: [{ stageNumber: 1, claimedAt: '2026-01-01', requirement: 'First' }],
    },
  });
  expect(
    earnedHomeAchievements([
      achievement({ id: 'locked', status: 'locked', isUnlocked: false }),
      achievement({ id: 'ready', status: 'completed_unclaimed' }),
      claimed,
      earlier,
    ]).map((a) => a.id),
  ).toEqual(['claimed', 'staged']);
});

afterEach(() => { vi.unstubAllGlobals(); });
function renderRewards(achievements: ProfileAchievement[]) {
  const profile = {
    id: 'u',
    achievements,
    trophySummary: {
      regularSeasonWins: 0,
      tournamentChampionships: 0,
      tournamentPodiums: 0,
      completedChallenges: 0,
    },
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify(profile), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    ),
  );
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <ProfileRewardsScreen />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
it('renders an empty collection without claim actions', async () => {
  renderRewards([]);
  expect(
    await screen.findByRole('heading', { name: 'Здесь будут твои награды' }),
  ).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Забрать/ })).toBeNull();
});
it('opens earned award details and excludes ready but unclaimed awards', async () => {
  renderRewards([
    achievement({ title: 'Получено', status: 'claimed' }),
    achievement({ id: 'ready', title: 'Ещё не получено', status: 'completed_unclaimed' }),
  ]);
  fireEvent.click(await screen.findByRole('button', { name: 'Получено' }));
  expect(screen.queryByText('Твоя коллекция растёт вместе с карьерой')).toBeNull();
  expect(screen.queryByRole('region', { name: 'Полученные награды на полке' })).toBeNull();
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getByRole('heading', { name: 'Получено' })).toBeInTheDocument();
  expect(screen.queryByText('Ещё не получено')).toBeNull();
  expect(within(dialog).queryByRole('button', { name: /Забрать/ })).toBeNull();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Закрыть' }));
  expect(screen.queryByRole('dialog')).toBeNull();
});
