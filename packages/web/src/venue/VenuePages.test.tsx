vi.mock('./DuelDetailsPage.js',()=>({DuelDetailsPage:()=> <p>Подробности дуэли</p>}));
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { StadiumPage } from './StadiumPages.js';
import { YardPage } from './YardPages.js';
const mocks = vi.hoisted(() => ({ play: vi.fn() }));
vi.mock('../screens/DailyScreen.js', () => ({
  AmateurDuelsPage: ({ onOpenMatch }: { onOpenMatch: (id: string) => void }) => (
    <button onClick={() => onOpenMatch('match-1')}>Дуэли</button>
  ),
  AmateurTournamentsPage: () => <p>Турниры</p>,
  TrainingOverview: () => <p>Тренировки</p>,
  DailyScreen: () => {
    mocks.play();
    return <p>Game</p>;
  },
}));
vi.mock('../screens/DailyOverviewScreen.js', () => ({
  DailyOverviewScreen: () => <p>Ежедневная</p>,
}));
it('renders independent stadium and yard pages without mounting the game owner', async () => {
  render(
    <MemoryRouter>
      <StadiumPage id="daily" />
      <StadiumPage id="duels" />
      <StadiumPage id="tournaments" />
      <YardPage id="open" />
    </MemoryRouter>,
  );
  expect(await screen.findByText('Ежедневная')).toBeVisible();
  expect(await screen.findByText('Дуэли')).toBeVisible();
  expect(await screen.findByText('Турниры')).toBeVisible();
  expect(await screen.findByText('Тренировки')).toBeVisible();
  expect(mocks.play).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Дуэли'));
  expect(mocks.play).not.toHaveBeenCalled();
});
