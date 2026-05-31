import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AchievementsScreen } from './AchievementsScreen.js';

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
    vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/achievements')) {
        return Promise.resolve(
          new Response(JSON.stringify({ achievements: [], unclaimedCount: 0 }), {
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
  });

  it('shows the weekly challenge entry inside achievements', async () => {
    renderAchievements();

    expect(await screen.findByRole('button', { name: 'Челлендж недели' })).toBeInTheDocument();
    expect(await screen.findByText('Получить награду')).toBeInTheDocument();
    expect(screen.getByLabelText('Требуется действие')).toBeInTheDocument();
  });
});
