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
  const ratingHeading = screen.getByText('Рейтинг');
  expect(ratingHeading).toHaveClass('duel-section-title--with-action');
  expect(screen.getByRole('button', { name: 'Правила рейтинга дуэлей' }))
    .toHaveClass('duel-section-info-btn');
  fireEvent.click(screen.getByRole('tab', { name: 'Экспресс' }));
  await waitFor(() => expect(fetchAmateurRating).toHaveBeenCalledWith('2026-09', 'express'));
  expect(screen.getByText('Сентябрь 2026')).toBeInTheDocument();
  for (const label of ['Общий', 'Экспресс', 'Микс', 'Классика']) {
    expect(screen.getByRole('tab', { name: label })).toBeInTheDocument();
  }
});

it('opens rules for the selected scope and shows configured reward and threshold', async () => {
  vi.mocked(fetchAmateurRating).mockResolvedValue({
    season_key: '2026-09', scope: 'overall', rating_visible: true,
    available_seasons: ['2026-09'], prize_threshold: 30, rating: [], me_rank: null,
    reward_rules: {
      enabled: true, minimumMatches: 30,
      first: { coins: 15000, stars: 300, experience: 0, tokens: 10 },
    },
  });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AmateurDuelRatingTab currentUserId={null} initialSeasonKey="2026-09" onOpenProfile={() => undefined} />
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Правила рейтинга дуэлей' }));
  const dialog = screen.getByRole('dialog', { name: 'Рейтинг: Общий' });
  expect(dialog).toHaveClass('duel-rating-info-modal');
  expect(dialog).toHaveTextContent('30 дуэлей');
  expect(dialog).toHaveTextContent('300 звёзд');
  expect(screen.queryByRole('button', { name: 'Закрыть правила' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Понятно' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});
