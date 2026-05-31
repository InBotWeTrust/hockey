import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from './api.js';
import { WeeklyChallengesAdmin } from './WeeklyChallengesAdmin.js';

vi.mock('./api.js');

function renderAdmin(): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <WeeklyChallengesAdmin />
    </QueryClientProvider>,
  );
}

describe('WeeklyChallengesAdmin', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders existing weekly challenges', async () => {
    vi.mocked(api.fetchAdminWeeklyChallenges).mockResolvedValue({
      challenges: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          title: 'Неделя снайпера',
          description: '',
          joinOpenAt: '2026-06-01T09:00:00.000Z',
          startAt: '2026-06-02T09:00:00.000Z',
          endAt: '2026-06-09T09:00:00.000Z',
          isActive: true,
          joinEnabled: true,
          rewardCoins: 100,
          rewardStars: 5,
          rewardExperience: 50,
          tasks: [
            {
              id: 'task-1',
              type: 'goals_scored',
              title: '500 шайб',
              target: 500,
              sortOrder: 0,
            },
          ],
          createdAt: '2026-06-01T09:00:00.000Z',
          updatedAt: '2026-06-01T09:00:00.000Z',
        },
      ],
    });

    renderAdmin();

    expect(await screen.findByText('Неделя снайпера')).toBeInTheDocument();
    expect(screen.getByText('Активный сейчас: Неделя снайпера')).toBeInTheDocument();
  });
});
