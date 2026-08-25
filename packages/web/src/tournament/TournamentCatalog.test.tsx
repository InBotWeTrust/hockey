import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
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
      <MemoryRouter>
        <QueryClientProvider client={client}>
          <TournamentCatalog />
        </QueryClientProvider>
      </MemoryRouter>,
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
    expect(screen.getByText('Вы участвуете')).toBeInTheDocument();
    const sections = screen.getByRole('tablist', { name: 'Разделы турнира' });
    expect(screen.getAllByRole('tab')).toHaveLength(5);
    fireEvent.click(screen.getByRole('tab', { name: 'Расписание' }));

    expect(await screen.findAllByRole('button', { name: 'Открыть live' })).toHaveLength(1);
    expect(screen.getByText('Третий — Четвёртый')).toBeInTheDocument();
    expect(screen.getAllByText('Запланирована')).toHaveLength(2);
    expect(screen.getByLabelText('Площадка: Дома')).toBeInTheDocument();
    expect(screen.getByLabelText('Площадка: Нейтрально')).toBeInTheDocument();
    expect(sections).toBeInTheDocument();
  });

  it('shows a settled zero-zero fixture score', async () => {
    vi.spyOn(api, 'fetchTournaments').mockResolvedValue({
      tournaments: [
        {
          id: 't1',
          slug: 'score-cup',
          title: 'Кубок счёта',
          description: '',
          status: 'regular',
          regularSource: 'head_to_head',
          visibility: 'public',
          revision: 1,
          participantCount: 2,
          myParticipantState: 'approved',
          registrationOpensAt: null,
          registrationClosesAt: null,
          startsAt: null,
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
          scheduledStartsAt: null,
          windowEndsAt: null,
          status: 'settled',
          venueMode: 'neutral_default',
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

    fireEvent.click(await screen.findByRole('button', { name: 'Открыть Кубок счёта' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Расписание' }));

    expect(await screen.findByText('Счёт 0:0')).toBeInTheDocument();
  });

  it('restores a tournament schedule from the duel return URL', async () => {
    vi.spyOn(api, 'fetchTournaments').mockResolvedValue({
      tournaments: [
        {
          id: 't1',
          slug: 'return-cup',
          title: 'Кубок возврата',
          description: '',
          status: 'regular',
          regularSource: 'head_to_head',
          visibility: 'public',
          revision: 1,
          participantCount: 2,
          myParticipantState: 'approved',
          registrationOpensAt: null,
          registrationClosesAt: null,
          startsAt: null,
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
          scheduledStartsAt: null,
          windowEndsAt: null,
          status: 'scheduled',
          venueMode: 'home_selected',
          home: { userId: 'u1', name: 'Первый' },
          away: { userId: 'u2', name: 'Второй' },
          score: { home: 0, away: 0 },
        },
      ],
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <MemoryRouter
        initialEntries={[
          '/?view=amateur&section=tournaments&tournament=t1&tab=schedule&from=sections',
        ]}
      >
        <QueryClientProvider client={client}>
          <TournamentCatalog />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Кубок возврата')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Расписание' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(await screen.findByText('Первый — Второй')).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('tab', { name: 'Расписание' }));

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
    fireEvent.click(screen.getByRole('tab', { name: 'Правила и призы' }));

    expect(screen.getByText('1 круг · 3 тура в день · первый тур в 19:00')).toBeInTheDocument();
    expect(
      screen.getByText('Раунд 1: до 4 побед · Дом · Дом · Гости · Гости · Дом · Гости · Дом'),
    ).toBeInTheDocument();
    expect(screen.getByText('1 место — 100 опыта, 50 монет, 3 звезды')).toBeInTheDocument();
    expect(screen.getByText('1 место — 200 опыта, 100 монет, 5 звёзд')).toBeInTheDocument();
  });

  it('accepts an invite-only invitation instead of withdrawing it', async () => {
    vi.spyOn(api, 'fetchTournaments').mockResolvedValue({
      tournaments: [
        {
          id: 'invite-cup',
          slug: 'invite-cup',
          title: 'Закрытый кубок',
          description: 'Только по приглашениям',
          status: 'registration',
          regularSource: 'head_to_head',
          visibility: 'public',
          revision: 1,
          participantCount: 1,
          myParticipantState: 'invited',
          registrationOpensAt: null,
          registrationClosesAt: null,
          startsAt: null,
          rules: { config: { participantLimit: 8, entryFeeCoins: 0, playoffSize: 4 } },
        },
      ],
    });
    const apply = vi.spyOn(api, 'applyToTournament').mockResolvedValue({
      tournamentId: 'invite-cup',
      participantId: 'participant-1',
      state: 'approved',
    });
    const withdraw = vi.spyOn(api, 'withdrawFromTournament');
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <MemoryRouter>
        <QueryClientProvider client={client}>
          <TournamentCatalog />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Открыть Закрытый кубок' }));
    fireEvent.click(screen.getByRole('button', { name: 'Принять приглашение' }));

    await waitFor(() => expect(apply).toHaveBeenCalledWith('invite-cup'));
    expect(withdraw).not.toHaveBeenCalled();
  });

  it('creates the first fixture segment and navigates to the returned duel', async () => {
    vi.spyOn(api, 'fetchTournaments').mockResolvedValue({
      tournaments: [
        {
          id: 't1',
          slug: 'start-cup',
          title: 'Стартовый кубок',
          description: 'Первая игра',
          status: 'regular',
          regularSource: 'head_to_head',
          visibility: 'public',
          revision: 1,
          participantCount: 2,
          myParticipantState: 'approved',
          registrationOpensAt: null,
          registrationClosesAt: null,
          startsAt: null,
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
          scheduledStartsAt: null,
          windowEndsAt: null,
          status: 'open',
          venueMode: 'home_selected',
          home: { userId: 'u1', name: 'Первый' },
          away: { userId: 'u2', name: 'Второй' },
          score: { home: 0, away: 0 },
        },
      ],
    });
    vi.spyOn(api, 'fetchFixtureLiveState').mockResolvedValue({
      live: {
        fixtureId: 'f1',
        status: 'open',
        score: { home: 0, away: 0 },
        scheduledStartsAt: null,
        windowEndsAt: null,
        proposal: null,
        overlapWarnings: [],
        duelMatchId: null,
        participants: [],
      },
    });
    let resolveOpen!: (value: Awaited<ReturnType<typeof api.openTournamentFixtureSegment>>) => void;
    const open = vi.spyOn(api, 'openTournamentFixtureSegment').mockReturnValue(
      new Promise((resolve) => {
        resolveOpen = resolve;
      }),
    );
    function LocationProbe() {
      return <output aria-label="Текущий адрес">{useLocation().search}</output>;
    }
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <MemoryRouter initialEntries={['/?view=amateur&section=tournaments']}>
        <QueryClientProvider client={client}>
          <TournamentCatalog />
          <LocationProbe />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Открыть Стартовый кубок' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Расписание' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Открыть live' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Начать игру' }));

    await waitFor(() => expect(open).toHaveBeenCalledWith('t1', 'f1'));
    expect(screen.getByRole('button', { name: 'Открываем…' })).toBeDisabled();
    resolveOpen({
      fixtureId: 'f1',
      segmentId: 'segment-1',
      duelMatchId: 'duel-1',
      kind: 'regulation',
      sequenceNumber: 1,
    });

    await waitFor(() =>
      expect(screen.getByLabelText('Текущий адрес')).toHaveTextContent(
        '?view=amateur&section=tournaments&tournament=t1&tab=schedule&match=duel-1&play=1',
      ),
    );
  });

  it('ignores a late fixture opening response after returning to the schedule', async () => {
    vi.spyOn(api, 'fetchTournaments').mockResolvedValue({
      tournaments: [
        {
          id: 't1',
          slug: 'late-cup',
          title: 'Кубок позднего ответа',
          description: '',
          status: 'regular',
          regularSource: 'head_to_head',
          visibility: 'public',
          revision: 1,
          participantCount: 2,
          myParticipantState: 'approved',
          registrationOpensAt: null,
          registrationClosesAt: null,
          startsAt: null,
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
          scheduledStartsAt: null,
          windowEndsAt: null,
          status: 'open',
          venueMode: 'home_selected',
          home: { userId: 'u1', name: 'Первый' },
          away: { userId: 'u2', name: 'Второй' },
          score: { home: 0, away: 0 },
        },
      ],
    });
    vi.spyOn(api, 'fetchFixtureLiveState').mockResolvedValue({
      live: {
        fixtureId: 'f1',
        status: 'open',
        score: { home: 0, away: 0 },
        scheduledStartsAt: null,
        windowEndsAt: null,
        proposal: null,
        overlapWarnings: [],
        duelMatchId: null,
        participants: [],
      },
    });
    let resolveOpen!: (value: Awaited<ReturnType<typeof api.openTournamentFixtureSegment>>) => void;
    vi.spyOn(api, 'openTournamentFixtureSegment').mockReturnValue(
      new Promise((resolve) => {
        resolveOpen = resolve;
      }),
    );
    function LocationProbe() {
      return <output aria-label="Текущий адрес">{useLocation().search}</output>;
    }
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <MemoryRouter initialEntries={['/?view=amateur&section=tournaments']}>
        <QueryClientProvider client={client}>
          <TournamentCatalog />
          <LocationProbe />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Открыть Кубок позднего ответа' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Расписание' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Открыть live' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Начать игру' }));
    fireEvent.click(screen.getByRole('button', { name: 'К расписанию' }));

    await act(async () => {
      resolveOpen({
        fixtureId: 'f1',
        segmentId: 'segment-1',
        duelMatchId: 'late-duel',
        kind: 'regulation',
        sequenceNumber: 1,
      });
      await Promise.resolve();
    });

    expect(screen.getByRole('tab', { name: 'Расписание' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByLabelText('Текущий адрес')).not.toHaveTextContent('match=late-duel');
  });

  it('ignores a late fixture opening error after returning to the schedule', async () => {
    vi.spyOn(api, 'fetchTournaments').mockResolvedValue({
      tournaments: [
        {
          id: 't1',
          slug: 'late-error-cup',
          title: 'Кубок поздней ошибки',
          description: '',
          status: 'regular',
          regularSource: 'head_to_head',
          visibility: 'public',
          revision: 1,
          participantCount: 2,
          myParticipantState: 'approved',
          registrationOpensAt: null,
          registrationClosesAt: null,
          startsAt: null,
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
          scheduledStartsAt: null,
          windowEndsAt: null,
          status: 'open',
          venueMode: 'home_selected',
          home: { userId: 'u1', name: 'Первый' },
          away: { userId: 'u2', name: 'Второй' },
          score: { home: 0, away: 0 },
        },
      ],
    });
    vi.spyOn(api, 'fetchFixtureLiveState').mockResolvedValue({
      live: {
        fixtureId: 'f1',
        status: 'open',
        score: { home: 0, away: 0 },
        scheduledStartsAt: null,
        windowEndsAt: null,
        proposal: null,
        overlapWarnings: [],
        duelMatchId: null,
        participants: [],
      },
    });
    let rejectOpen!: (reason?: unknown) => void;
    vi.spyOn(api, 'openTournamentFixtureSegment').mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectOpen = reject;
      }),
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <MemoryRouter initialEntries={['/?view=amateur&section=tournaments']}>
        <QueryClientProvider client={client}>
          <TournamentCatalog />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Открыть Кубок поздней ошибки' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Расписание' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Открыть live' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Начать игру' }));
    fireEvent.click(screen.getByRole('button', { name: 'К расписанию' }));

    await act(async () => {
      rejectOpen(new Error('late network failure'));
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Открыть live' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a fixture opening error and allows a retry', async () => {
    vi.spyOn(api, 'fetchTournaments').mockResolvedValue({
      tournaments: [
        {
          id: 't1',
          slug: 'error-cup',
          title: 'Кубок ошибки',
          description: '',
          status: 'regular',
          regularSource: 'head_to_head',
          visibility: 'public',
          revision: 1,
          participantCount: 2,
          myParticipantState: 'approved',
          registrationOpensAt: null,
          registrationClosesAt: null,
          startsAt: null,
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
          scheduledStartsAt: null,
          windowEndsAt: null,
          status: 'open',
          venueMode: 'neutral_default',
          home: { userId: 'u1', name: 'Первый' },
          away: { userId: 'u2', name: 'Второй' },
          score: { home: 0, away: 0 },
        },
      ],
    });
    vi.spyOn(api, 'fetchFixtureLiveState').mockResolvedValue({
      live: {
        fixtureId: 'f1',
        status: 'open',
        score: { home: 0, away: 0 },
        scheduledStartsAt: null,
        windowEndsAt: null,
        proposal: null,
        overlapWarnings: [],
        duelMatchId: null,
        participants: [],
      },
    });
    const open = vi.spyOn(api, 'openTournamentFixtureSegment').mockRejectedValue(new Error('fail'));
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <MemoryRouter>
        <QueryClientProvider client={client}>
          <TournamentCatalog />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Открыть Кубок ошибки' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Расписание' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Открыть live' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Начать игру' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось открыть игру');
    fireEvent.click(screen.getByRole('button', { name: 'Начать игру' }));
    await waitFor(() => expect(open).toHaveBeenCalledTimes(2));
  });
});
