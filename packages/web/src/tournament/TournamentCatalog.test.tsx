import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../auth/authStore.js';
import * as api from '../api/tournament.js';
import { TournamentCatalog } from './TournamentCatalog.js';

describe('TournamentCatalog', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.setState({ user: { id: 'u1', displayName: 'Первый' } });
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
          venueMode: 'home_selected',
          home: { userId: 'u1', name: 'Первый' },
          away: { userId: 'u2', name: 'Второй' },
          score: { home: 0, away: 0 },
        },
        {
          id: 'f2',
          fixtureNumber: 2,
          stage: 'regular',
          roundNumber: 1,
          scheduledStartsAt: '2030-09-01T07:00:00.000Z',
          windowEndsAt: '2030-09-01T08:00:00.000Z',
          status: 'scheduled',
          venueMode: 'neutral_default',
          home: { userId: 'u3', name: 'Третий' },
          away: { userId: 'u4', name: 'Четвёртый' },
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

    expect(await screen.findAllByRole('button', { name: 'Открыть live' })).toHaveLength(1);
    expect(screen.getByText('Третий — Четвёртый')).toBeInTheDocument();
    expect(screen.getByLabelText('Площадка: Дома')).toBeInTheDocument();
    expect(screen.getByLabelText('Площадка: Нейтрально')).toBeInTheDocument();
  });

  it('shows an away venue badge for the authenticated away participant', async () => {
    vi.spyOn(api, 'fetchTournaments').mockResolvedValue({
      tournaments: [
        {
          id: 't1',
          slug: 'away-cup',
          title: 'Выездной кубок',
          description: 'Проверка площадки',
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
          id: 'f-away',
          fixtureNumber: 1,
          stage: 'regular',
          roundNumber: 1,
          scheduledStartsAt: '2030-09-01T07:00:00.000Z',
          windowEndsAt: '2030-09-01T08:00:00.000Z',
          status: 'scheduled',
          venueMode: 'home_selected',
          home: { userId: 'u2', name: 'Второй' },
          away: { userId: 'u1', name: 'Первый' },
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

    fireEvent.click(await screen.findByRole('button', { name: 'Открыть Выездной кубок' }));
    fireEvent.click(screen.getByRole('button', { name: 'Расписание' }));

    expect(await screen.findByLabelText('Площадка: В гостях')).toBeInTheDocument();
  });

  it('does not offer an application before the configured registration window opens', async () => {
    vi.spyOn(api, 'fetchTournaments').mockResolvedValue({
      tournaments: [
        {
          id: 't1',
          slug: 'future-cup',
          title: 'Будущий кубок',
          description: 'Регистрация позже',
          status: 'registration',
          regularSource: 'head_to_head',
          visibility: 'public',
          revision: 1,
          participantCount: 0,
          myParticipantState: null,
          registrationOpensAt: '2099-09-01T07:00:00.000Z',
          registrationClosesAt: '2099-09-10T07:00:00.000Z',
          startsAt: '2099-09-11T07:00:00.000Z',
          rules: { config: { participantLimit: 8, entryFeeCoins: 0, playoffSize: 4 } },
        },
      ],
    });
    const apply = vi.spyOn(api, 'applyToTournament');
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <MemoryRouter>
        <QueryClientProvider client={client}>
          <TournamentCatalog />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Открыть Будущий кубок' }));

    expect(screen.getByText(/Регистрация откроется/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Регистрация ещё не открыта' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Регистрация ещё не открыта' }));
    expect(apply).not.toHaveBeenCalled();
  });

  it('shows the published format, playoff rounds and stage rewards to players', async () => {
    vi.spyOn(api, 'fetchTournaments').mockResolvedValue({
      tournaments: [
        {
          id: 't1',
          slug: 'rules-cup',
          title: 'Кубок правил',
          description: 'Проверяем опубликованный snapshot',
          status: 'registration',
          regularSource: 'head_to_head',
          visibility: 'public',
          revision: 4,
          participantCount: 4,
          myParticipantState: null,
          registrationOpensAt: null,
          registrationClosesAt: null,
          startsAt: '2030-09-01T07:00:00.000Z',
          rules: {
            config: {
              participantLimit: 8,
              entryFeeCoins: 25,
              playoffSize: 4,
              regularSource: 'head_to_head',
              timezone: 'Europe/Moscow',
              roundRobinCycles: 1,
              roundsPerDay: 3,
              firstRoundLocalTime: '19:00',
            },
            tieBreakCriteria: ['points', 'wins', 'goal_difference'],
            playoffRounds: [
              {
                roundNumber: 1,
                winsRequired: 4,
                homeSequence: ['H', 'H', 'A', 'A', 'H', 'A', 'H'],
                overtime: { count: 2, shootoutInitialShots: 3 },
              },
            ],
            stageRewards: {
              regular: [{ place: 1, experience: 100, coins: 50, stars: 3 }],
              playoff: [{ place: 1, experience: 200, coins: 100, stars: 5 }],
            },
          },
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

    fireEvent.click(await screen.findByRole('button', { name: 'Открыть Кубок правил' }));
    fireEvent.click(screen.getByRole('button', { name: 'Правила и призы' }));

    expect(screen.getByText('1 круг · 3 тура в день · первый тур в 19:00')).toBeInTheDocument();
    expect(screen.getByText('Раунд 1: до 4 побед · H-H-A-A-H-A-H')).toBeInTheDocument();
    expect(screen.getByText('1 место — 100 опыта, 50 монет, 3 звезды')).toBeInTheDocument();
    expect(screen.getByText('1 место — 200 опыта, 100 монет, 5 звёзд')).toBeInTheDocument();
  });
});
