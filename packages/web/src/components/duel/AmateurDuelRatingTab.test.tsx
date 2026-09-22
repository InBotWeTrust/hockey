import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { AmateurDuelRatingTab } from './AmateurDuelRatingTab.js';
import { fetchAmateurRating } from '../../api/amateurDuel.js';

vi.mock('../../api/amateurDuel.js', () => ({ fetchAmateurRating: vi.fn() }));

beforeEach(() => {
  vi.mocked(fetchAmateurRating).mockReset();
  vi.mocked(fetchAmateurRating).mockResolvedValue({
    season_key: '2026-09', scope: 'overall', rating_visible: true,
    available_seasons: ['2026-09'], prize_threshold: 30,
    rating: [], me_rank: null,
  } as never);
});

it('switches between four duel rating scopes while retaining the selected month', async () => {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AmateurDuelRatingTab currentUserId={null} initialSeasonKey="2026-09" onOpenProfile={() => undefined} />
    </QueryClientProvider>,
  );
  expect(await screen.findByRole('tab', { name: 'Экспресс' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: 'Экспресс' }));
  await waitFor(() => expect(fetchAmateurRating).toHaveBeenCalledWith('2026-09', 'express'));
  expect(screen.getByText('Сентябрь 2026')).toBeInTheDocument();
  for (const label of ['Общий', 'Экспресс', 'Микс', 'Классика']) {
    expect(screen.getByRole('tab', { name: label })).toBeInTheDocument();
  }
});
