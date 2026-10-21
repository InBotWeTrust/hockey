import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { ApartmentPage } from './ApartmentPages.js';
import { TaskPage } from './TaskPages.js';
import { venueSceneFor } from '../components/venueScenes.js';
vi.mock('../screens/ProfileScreen.js', () => ({ ProfileScreen: () => <p>Паспорт</p> }));
vi.mock('../screens/ProfileRewardsScreen.js', () => ({
  ProfileRewardsScreen: () => <p>Награды</p>,
}));
vi.mock('../screens/ProfileFriendsScreen.js', () => ({
  ProfileFriendsScreen: () => <p>Друзья</p>,
}));
vi.mock('../screens/ProfileSettingsScreen.js', () => ({
  ProfileSettingsScreen: () => <p>Настройки</p>,
}));
vi.mock('../screens/ProfileDestinationScreens.js', () => ({
  ProfileStoryScreen: () => <p>Сюжет</p>,
  ProfileStatsScreen: () => <p>Статистика</p>,
  ProfileArenaScreen: () => <p>Арена</p>,
}));
vi.mock('../screens/ProfileStorySeriesScreen.js', () => ({
  ProfileStorySeriesScreen: ({ series = 1 }: { series?: number }) => <p>Серия {series}</p>,
}));
vi.mock('../screens/AchievementsScreen.js', () => ({ AchievementsScreen: () => <p>Задания</p> }));
vi.mock('../screens/WeeklyChallengeScreen.js', () => ({
  WeeklyChallengeScreen: () => <p>Челленджи</p>,
}));
it('renders story details in the apartment and preserves artwork positions', () => {
  render(
    <MemoryRouter initialEntries={['/profile/story/series-2']}>
      <ApartmentPage id="story" />
      <TaskPage id="tasks" profileContext={false} />
      <TaskPage id="challenges" profileContext={false} />
    </MemoryRouter>,
  );
  expect(screen.getByText('Серия 2')).toBeVisible();
  expect(screen.getByText('Задания')).toBeVisible();
  expect(screen.getByText('Челленджи')).toBeVisible();
  const scene = venueSceneFor('/profile/story/series-2', '', 'amateur');
  expect(scene?.selected).toBe('story');
  expect(scene?.pages.map((page) => page.position)).toEqual([0, 2, 4, 3, 5]);
});
