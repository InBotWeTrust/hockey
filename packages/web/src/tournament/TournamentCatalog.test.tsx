import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../api/tournament.js';
import { TournamentCatalog } from './TournamentCatalog.js';

describe('TournamentCatalog', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders published tournaments and their registration state', async () => {
    vi.spyOn(api, 'fetchTournaments').mockResolvedValue({
      tournaments: [
        {
          id: 't1',
          slug: 'ice-cup',
          title: 'Кубок льда',
          description: 'Регулярка и плей-офф',
          status: 'registration',
          regularSource: 'head_to_head',
          visibility: 'public',
          revision: 1,
          participantCount: 12,
          myParticipantState: null,
          registrationOpensAt: null,
          registrationClosesAt: null,
          startsAt: null,
          rules: { config: { participantLimit: 16, entryFeeCoins: 0, playoffSize: 8 } },
        },
      ],
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TournamentCatalog />
      </QueryClientProvider>,
    );
    expect(await screen.findByText('Кубок льда')).toBeInTheDocument();
    expect(screen.getByText('12 / 16 участников')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Открыть Кубок льда' })).toBeInTheDocument();
  });

  it('opens the fixture live screen from the published schedule', async () => {
    vi.spyOn(api, 'fetchTournaments').mockResolvedValue({
      tournaments: [
        {
          id: 't1',
          slug: 'ice-cup',
          title: 'Кубок льда',
          description: 'Регулярка и плей-офф',
          status: 'regular',
          regularSource: 'head_to_head',
          visibility: 'public',
          revision: 1,
          participantCount: 2,
          myParticipantState: 'approved',
          registrationOpensAt: null,
          registrationClosesAt: null,
          startsAt: '2030-09-01T07:00:00.000Z',
          rules: { config: { participantLimit: 2, entryFeeCoins: 0, playoffSize: 2 } },
        },
      ],
    });
    vi.spyOn(api, 'fetchTournamentSchedule').mockResolvedValue({
      fixtures: [
        {
          id: 'f1',
          fixtureNumber: 1,
          stage: 'regular',
          roundNumber: 1,
          scheduledStartsAt: '2030-09-01T07:00:00.000Z',
          windowEndsAt: '2030-09-01T08:00:00.000Z',
          status: 'scheduled',
          home: { userId: 'u1', name: 'Первый' },
          away: { userId: 'u2', name: 'Второй' },
          score: { home: 0, away: 0 },
        },
      ],
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <MemoryRouter>
        <QueryClientProvider client={client}>
          <TournamentCatalog />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Открыть Кубок льда' }));
    fireEvent.click(screen.getByRole('button', { name: 'Расписание' }));

    expect(await screen.findByRole('button', { name: 'Открыть live' })).toBeInTheDocument();
  });
});
