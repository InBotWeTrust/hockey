import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileStorySeriesScreen } from './ProfileStorySeriesScreen.js';

vi.mock('../onboarding/BeginnerStoryFlow.js', () => ({
  BeginnerStoryFlow: ({
    unlockGoalsRequired,
    onClose,
    onCompleted,
  }: {
    unlockGoalsRequired: number;
    onClose: () => void;
    onCompleted: () => void;
  }) => (
    <section aria-label="Повтор серии">
      <span>Порог: {unlockGoalsRequired}</span>
      <button type="button" onClick={onClose}>Закрыть серию</button>
      <button type="button" onClick={onCompleted}>Завершить серию</button>
    </section>
  ),
}));

function renderSeries(completed: boolean) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(
      JSON.stringify({
        id: 'u1',
        beginnerOnboardingCompleted: completed,
        amateurUnlockGoalsRequired: 475,
      }),
      { status: 200 },
    ),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/profile/story/series-1']}>
        <Routes>
          <Route path="/profile/story/series-1" element={<ProfileStorySeriesScreen />} />
          <Route path="/profile/story" element={<div>story catalog</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ProfileStorySeriesScreen', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('redirects an incomplete player back to the story catalog', async () => {
    renderSeries(false);
    expect(await screen.findByText('story catalog')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Повтор серии' })).not.toBeInTheDocument();
  });

  it.each(['Закрыть серию', 'Завершить серию'])(
    'returns an eligible player to the catalog through %s',
    async (action) => {
      renderSeries(true);
      expect(await screen.findByText('Порог: 475')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: action }));
      await waitFor(() => expect(screen.getByText('story catalog')).toBeInTheDocument());
    },
  );
});
