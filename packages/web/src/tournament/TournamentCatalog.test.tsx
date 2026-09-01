import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../auth/authStore.js';
import * as api from '../api/tournament.js';
import { TournamentCatalog } from './TournamentCatalog.js';

const designSystemCss = readFileSync(resolve(process.cwd(), 'src/app/design-system.css'), 'utf8');
const TEST_LIFECYCLE: api.TournamentLifecycleDTO = {
  action: 'unchanged',
  dueAt: null,
  approvedParticipantCount: 0,
  requiredParticipantCount: 2,
  reason: null,
};

describe('TournamentCatalog', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.setState({ user: { id: 'u1', displayName: 'Первый' } });
  });

  it('shows a readable empty state when there are no published tournaments', async () => {
    vi.spyOn(api, 'fetchTournaments').mockResolvedValue({ tournaments: [] });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <MemoryRouter>
        <QueryClientProvider client={client}>
          <TournamentCatalog />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    const empty = await screen.findByText('Турниров пока нет.');
    expect(empty).toHaveClass('tournament-catalog__empty');
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
          lifecycle: TEST_LIFECYCLE,
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

  it('shows registration opening and closing dates as separate readable rows', async () => {
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
          lifecycle: TEST_LIFECYCLE,
          myParticipantState: null,
          registrationOpensAt: '2030-08-27T13:35:00.000Z',
          registrationClosesAt: '2030-08-28T14:35:00.000Z',
          startsAt: '2030-09-01T07:00:00.000Z',
          projectedEndsAt: '2030-09-15T18:00:00.000Z',
          rules: {
            config: {
              participantLimit: 16,
              entryFeeCoins: 0,
              playoffSize: 8,
              timezone: 'Europe/Moscow',
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

    fireEvent.click(await screen.findByRole('button', { name: 'Открыть Кубок льда' }));

    expect(screen.getByText('Начало регистрации')).toBeInTheDocument();
    expect(screen.getByText('Конец регистрации')).toBeInTheDocument();
    expect(screen.getByText(/27 августа 2030 г. в 16:35 \(МСК\)/)).toBeInTheDocument();
    expect(screen.getByText(/28 августа 2030 г. в 17:35 \(МСК\)/)).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Регистрация' })).not.toBeInTheDocument();
    expect(screen.queryByText('Начало', { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText('Конец', { exact: true })).not.toBeInTheDocument();
  });

  it('keeps tournament rule copy visually lighter than its headings', () => {
    expect(designSystemCss).toContain(
      '.tournament-rules p {\n  color: #26384d;\n  font-size: 13px;\n  font-weight: 440;',
    );
  });

  it('groups tournaments by lifecycle and shows artwork with player-specific statuses', async () => {
    vi.spyOn(api, 'fetchTournaments').mockResolvedValue({
      tournaments: [
        {
          id: 'active',
          slug: 'active-cup',
          title: 'Активный кубок',
          description: '',
          imageUrl: '/media/active.webp',
          status: 'regular',
          regularSource: 'head_to_head',
          visibility: 'public',
          revision: 1,
          participantCount: 8,
          lifecycle: TEST_LIFECYCLE,
          myParticipantState: 'approved',
          myFinalPlace: null,
          registrationOpensAt: null,
          registrationClosesAt: null,
          startsAt: null,
          rules: { config: { participantLimit: 8, entryFeeCoins: 0, playoffSize: 4 } },
        },
        {
          id: 'upcoming',
          slug: 'upcoming-cup',
          title: 'Будущий кубок',
          description: '',
          imageUrl: null,
          status: 'registration',
          regularSource: 'head_to_head',
          visibility: 'public',
          revision: 1,
          participantCount: 3,
          lifecycle: TEST_LIFECYCLE,
          myParticipantState: 'applied',
          myFinalPlace: null,
          registrationOpensAt: null,
          registrationClosesAt: null,
          startsAt: null,
          rules: { config: { participantLimit: 8, entryFeeCoins: 0, playoffSize: 4 } },
        },
        {
          id: 'completed',
          slug: 'completed-cup',
          title: 'Прошедший кубок',
          description: '',
          imageUrl: null,
          status: 'completed',
          regularSource: 'head_to_head',
          visibility: 'public',
          revision: 1,
          participantCount: 8,
          lifecycle: TEST_LIFECYCLE,
          myParticipantState: 'approved',
          myFinalPlace: 2,
          registrationOpensAt: null,
          registrationClosesAt: null,
          startsAt: null,
          rules: { config: { participantLimit: 8, entryFeeCoins: 0, playoffSize: 4 } },
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

    const sectionHeadings = [
      await screen.findByRole('heading', { name: 'Активные турниры' }),
      screen.getByRole('heading', { name: 'Предстоящие' }),
      screen.getByRole('heading', { name: 'Завершённые' }),
    ];
    for (const heading of sectionHeadings) {
      expect(heading.className).toBe('section-label sections-group__title');
    }
    expect(screen.getByText('Вы участвуете')).toBeInTheDocument();
    expect(screen.getByText('Заявка подана')).toBeInTheDocument();
    expect(screen.getByText('Ваше место: 2')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Активный кубок' })).toHaveAttribute(
      'src',
      '/media/active.webp',
    );
    expect(screen.getByRole('img', { name: 'Будущий кубок' })).toHaveAttribute(
      'src',
      '/modes/tournaments.webp',
    );
    fireEvent.error(screen.getByRole('img', { name: 'Активный кубок' }));
    expect(screen.getByRole('img', { name: 'Активный кубок' })).toHaveAttribute(
      'src',
      '/modes/tournaments.webp',
    );
  });

  it('opens a scrollable approved-participant dialog and uses compact scrollable tabs', async () => {
    vi.spyOn(api, 'fetchTournaments').mockResolvedValue({
      tournaments: [
        {
          id: 't1',
          slug: 'participants-cup',
          title: 'Кубок участников',
          description: '',
          imageUrl: null,
          status: 'registration',
          regularSource: 'head_to_head',
          visibility: 'public',
          revision: 1,
          participantCount: 2,
          lifecycle: TEST_LIFECYCLE,
          myParticipantState: 'approved',
          myFinalPlace: null,
          registrationOpensAt: null,
          registrationClosesAt: null,
          startsAt: null,
          rules: { config: { participantLimit: 8, entryFeeCoins: 0, playoffSize: 4 } },
        },
      ],
    });
    vi.spyOn(api, 'fetchTournamentParticipants').mockResolvedValue({
      participants: [
        { userId: 'u1', displayName: 'Первый', avatarUrl: '/first.webp', seed: 1 },
        { userId: 'u2', displayName: 'Второй', avatarUrl: null, seed: 2 },
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

    fireEvent.click(await screen.findByRole('button', { name: 'Открыть Кубок участников' }));
    expect(screen.queryByText('К списку турниров')).not.toBeInTheDocument();
    expect(screen.getByRole('tablist', { name: 'Разделы турнира' })).toHaveClass(
      'segmented-tabs--scrollable',
    );
    fireEvent.click(screen.getByRole('button', { name: /Участники/ }));

    const dialog = await screen.findByRole('dialog', { name: 'Участники' });
    expect(dialog.querySelector('.tournament-participants-list')).toHaveClass(
      'tournament-participants-list--scrollable',
    );
    expect(await screen.findByText('Первый')).toBeInTheDocument();
    expect(
      Array.from(dialog.querySelectorAll('.tournament-participants-list__position')).map(
        (node) => node.textContent,
      ),
    ).toEqual(['1', '2']);
    expect(screen.getByText('Посев 1')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Первый' })).toHaveAttribute('src', '/first.webp');
    fireEvent.error(screen.getByRole('img', { name: 'Первый' }));
    expect(screen.queryByRole('img', { name: 'Первый' })).not.toBeInTheDocument();
    expect(dialog.querySelector('.tournament-participants-list__avatar')).toHaveTextContent('П');
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть список участников' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Участники' })).toBeNull());
  });

  it('marks withdrawing from a tournament as a destructive action', async () => {
    vi.spyOn(api, 'fetchTournaments').mockResolvedValue({
      tournaments: [
        {
          id: 't1',
          slug: 'withdraw-cup',
          title: 'Кубок выхода',
          description: '',
          status: 'registration',
          regularSource: 'head_to_head',
          visibility: 'public',
          revision: 1,
          participantCount: 1,
          lifecycle: TEST_LIFECYCLE,
          myParticipantState: 'approved',
          registrationOpensAt: null,
          registrationClosesAt: null,
          startsAt: null,
          rules: { config: { participantLimit: 8, entryFeeCoins: 0, playoffSize: 4 } },
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

    fireEvent.click(await screen.findByRole('button', { name: 'Открыть Кубок выхода' }));
    expect(screen.getByText('Заявка принята')).toBeInTheDocument();
    expect(screen.queryByText('Вы участвуете')).not.toBeInTheDocument();
    expect(screen.getByText('Идёт регистрация').parentElement).toHaveClass(
      'tournament-details__status-row',
    );
    expect(screen.getByRole('button', { name: 'Отменить заявку' })).toHaveClass(
      'tournament-registration-btn--danger',
    );
  });

  it('opens the current game screen from the published schedule', async () => {
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
          lifecycle: TEST_LIFECYCLE,
          myParticipantState: 'approved',
          registrationOpensAt: null,
          registrationClosesAt: null,
          startsAt: '2030-09-01T07:00:00.000Z',
          projectedEndsAt: '2030-09-02T20:00:00.000Z',
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
          venueMode: 'neutral_default',
          home: { userId: 'u3', name: 'Третий', avatarUrl: '/third.webp' },
          away: { userId: 'u4', name: 'Четвёртый', avatarUrl: '/fourth.webp' },
          score: { home: 0, away: 0 },
        },
        {
          id: 'f2',
          fixtureNumber: 2,
          stage: 'regular',
          roundNumber: 1,
          scheduledStartsAt: '2030-09-01T07:00:00.000Z',
          windowEndsAt: '2030-09-01T08:00:00.000Z',
          status: 'open',
          venueMode: 'home_selected',
          home: { userId: 'u1', name: 'Первый', avatarUrl: '/first.webp' },
          away: { userId: 'u2', name: 'Второй', avatarUrl: '/second.webp' },
          score: { home: 0, away: 0 },
        },
        {
          id: 'f3',
          fixtureNumber: 3,
          stage: 'playoff',
          roundNumber: 1,
          scheduledStartsAt: '2030-09-02T07:00:00.000Z',
          windowEndsAt: '2030-09-02T08:00:00.000Z',
          status: 'scheduled',
          venueMode: 'home_selected',
          home: { userId: 'u1', name: 'Первый', avatarUrl: '/first.webp' },
          away: { userId: 'u3', name: 'Третий', avatarUrl: '/third.webp' },
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
    expect(await screen.findByRole('grid', { name: 'Календарь турнира' })).toBeInTheDocument();
    expect(screen.getByText('Сентябрь 2030')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /1 сентября.*ваша игра/i })).toHaveClass(
      'tournament-calendar__day--mine',
    );
    expect(screen.getByRole('button', { name: /2 сентября.*плей-офф/i })).toHaveClass(
      'tournament-calendar__day--playoff',
    );
    expect(screen.getByRole('button', { name: /^3 сентября.*вне дат турнира/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Предыдущий месяц' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Следующий месяц' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /1 сентября.*ваша игра/i }));

    const openGameButtons = await screen.findAllByRole('button', { name: 'Открыть игру' });
    expect(openGameButtons).toHaveLength(1);
    expect(openGameButtons[0]).toHaveClass('tournament-fixture-card__action--primary');
    expect(screen.getByRole('img', { name: 'Первый' })).toHaveAttribute('src', '/first.webp');
    expect(screen.getByRole('img', { name: 'Второй' })).toHaveAttribute('src', '/second.webp');
    const visibleFixtures = document.querySelectorAll('.tournament-fixture-card');
    expect(visibleFixtures[0]).toHaveTextContent('Первый — Второй');
    expect(screen.getAllByText('1 сентября, 10:00–11:00')).toHaveLength(2);
    expect(screen.getByText('Третий — Четвёртый')).toBeInTheDocument();
    expect(screen.getByText('Можно начинать игру')).toBeInTheDocument();
    expect(screen.getByText('Запланирована')).toBeInTheDocument();
    expect(screen.getByLabelText('Площадка: Дома')).toBeInTheDocument();
    expect(screen.queryByLabelText('Площадка: Нейтральное поле')).not.toBeInTheDocument();
    expect(sections).toBeInTheDocument();
  });

  it('shows configured playoff dates in a later calendar month before fixtures exist', async () => {
    vi.spyOn(api, 'fetchTournaments').mockResolvedValue({
      tournaments: [
        {
          id: 'daily-cup',
          slug: 'daily-cup',
          title: 'Ежедневный кубок',
          description: '',
          status: 'regular',
          regularSource: 'daily_aggregate',
          visibility: 'public',
          revision: 1,
          participantCount: 8,
          lifecycle: TEST_LIFECYCLE,
          myParticipantState: 'approved',
          registrationOpensAt: null,
          registrationClosesAt: null,
          startsAt: '2030-08-28T00:00:00.000Z',
          projectedEndsAt: '2030-09-15T00:00:00.000Z',
          rules: {
            config: {
              participantLimit: 8,
              entryFeeCoins: 0,
              playoffSize: 4,
              timezone: 'Europe/Moscow',
            },
            playoffRounds: [{ roundNumber: 1, firstGameStartsAt: '2030-09-05T12:00:00.000Z' }],
          },
        },
      ],
    });
    vi.spyOn(api, 'fetchTournamentSchedule').mockResolvedValue({
      fixtures: [],
      matchdays: [
        {
          id: 'august-day',
          number: 1,
          localDate: '2030-08-28',
          startsAt: '2030-08-28T00:00:00.000Z',
          endsAt: '2030-08-29T00:00:00.000Z',
          myResult: null,
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

    fireEvent.click(await screen.findByRole('button', { name: 'Открыть Ежедневный кубок' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Расписание' }));
    expect(await screen.findByText('Август 2030')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Следующий месяц' }));

    expect(screen.getByText('Сентябрь 2030')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /5 сентября.*плей-офф/i })).toHaveClass(
      'tournament-calendar__day--playoff',
    );
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
          lifecycle: TEST_LIFECYCLE,
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
        {
          id: 'f2',
          fixtureNumber: 2,
          stage: 'regular',
          roundNumber: 2,
          scheduledStartsAt: null,
          windowEndsAt: null,
          status: 'completed',
          venueMode: 'home_selected',
          home: { userId: 'u3', name: 'Третий' },
          away: { userId: 'u4', name: 'Четвёртый' },
          score: { home: 3, away: 1 },
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
    expect(screen.getByText('Счёт 3:1')).toBeInTheDocument();
  });

  it('shows playoff rounds, seeds, avatars and the path to the final', async () => {
    vi.spyOn(api, 'fetchTournaments').mockResolvedValue({
      tournaments: [
        {
          id: 'playoff-1',
          slug: 'playoff-cup',
          title: 'Кубок плей-офф',
          description: 'Четыре участника',
          status: 'playoff',
          regularSource: 'head_to_head',
          visibility: 'public',
          revision: 2,
          participantCount: 4,
          lifecycle: TEST_LIFECYCLE,
          myParticipantState: 'approved',
          registrationOpensAt: null,
          registrationClosesAt: null,
          startsAt: '2030-09-01T07:00:00.000Z',
          rules: { config: { participantLimit: 4, entryFeeCoins: 0, playoffSize: 4 } },
        },
      ],
    });
    vi.spyOn(api, 'fetchTournamentBracket').mockResolvedValue({
      series: [
        {
          id: 'semi-1',
          bracket_position: 1,
          kind: 'championship',
          round_number: 1,
          round_name: 'Полуфиналы',
          wins_required: 4,
          status: 'completed',
          higher_seed_wins: 4,
          lower_seed_wins: 2,
          winner_user_id: 'u1',
          higher_user_id: 'u1',
          higher_seed: 1,
          higher_name: 'Первый',
          higher_avatar_url: '/first.webp',
          lower_user_id: 'u4',
          lower_seed: 4,
          lower_name: 'Четвёртый',
          lower_avatar_url: '/fourth.webp',
          depends_on: {
            key: 'R1S1',
            sources: [
              { type: 'seed', participantId: 'p1' },
              { type: 'seed', participantId: 'p4' },
            ],
          },
          fixtures: [
            {
              id: 'semi-1-game-1',
              gameNumber: 1,
              scheduledStartsAt: '2030-09-10T12:00:00.000Z',
              windowEndsAt: '2030-09-10T13:00:00.000Z',
              status: 'settled',
              homeName: 'Первый',
              awayName: 'Четвёртый',
              homeScore: 3,
              awayScore: 2,
              winnerSide: 'home',
            },
          ],
        },
        {
          id: 'semi-2',
          bracket_position: 2,
          kind: 'championship',
          round_number: 1,
          round_name: 'Полуфиналы',
          wins_required: 4,
          status: 'scheduled',
          higher_seed_wins: 0,
          lower_seed_wins: 0,
          winner_user_id: null,
          higher_user_id: 'u2',
          higher_seed: 2,
          higher_name: 'Второй',
          higher_avatar_url: '/second.webp',
          lower_user_id: 'u3',
          lower_seed: 3,
          lower_name: 'Третий',
          lower_avatar_url: '/third.webp',
          depends_on: {
            key: 'R1S2',
            sources: [
              { type: 'seed', participantId: 'p2' },
              { type: 'seed', participantId: 'p3' },
            ],
          },
          fixtures: [],
        },
        {
          id: 'final',
          bracket_position: 1,
          kind: 'championship',
          round_number: 2,
          round_name: 'Финал',
          wins_required: 4,
          status: 'pending',
          higher_seed_wins: 0,
          lower_seed_wins: 0,
          winner_user_id: null,
          higher_user_id: null,
          higher_seed: null,
          higher_name: null,
          higher_avatar_url: null,
          lower_user_id: null,
          lower_seed: null,
          lower_name: null,
          lower_avatar_url: null,
          depends_on: {
            key: 'R2S1',
            sources: [
              { type: 'winner', seriesKey: 'R1S1' },
              { type: 'winner', seriesKey: 'R1S2' },
            ],
          },
          fixtures: [],
        },
        {
          id: 'bronze',
          bracket_position: 1,
          kind: 'third_place',
          round_number: 2,
          round_name: 'За 3-е место',
          wins_required: 4,
          status: 'pending',
          higher_seed_wins: 0,
          lower_seed_wins: 0,
          winner_user_id: null,
          higher_user_id: null,
          higher_seed: null,
          higher_name: null,
          higher_avatar_url: null,
          lower_user_id: null,
          lower_seed: null,
          lower_name: null,
          lower_avatar_url: null,
          depends_on: {
            key: 'BRONZE',
            sources: [
              { type: 'loser', seriesKey: 'R1S1' },
              { type: 'loser', seriesKey: 'R1S2' },
            ],
          },
          fixtures: [],
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

    fireEvent.click(await screen.findByRole('button', { name: 'Открыть Кубок плей-офф' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Плей-офф' }));

    expect(await screen.findByRole('heading', { name: 'Полуфиналы' })).toBeInTheDocument();
    expect(screen.getByRole('tablist', { name: 'Раунды плей-офф' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Полуфиналы' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: 'Финал' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: 'За 3-е место' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
    expect(screen.getByText('Полуфинал 1')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Первый' })).toHaveAttribute('src', '/first.webp');
    expect(screen.getByText('Посев 1')).toBeInTheDocument();
    expect(screen.getByText('Посев 4')).toBeInTheDocument();
    expect(screen.getByText('Игра 1 · 10 сентября, 15:00–16:00')).toBeInTheDocument();
    expect(screen.getByText('Первый 3 : 2 Четвёртый')).toBeInTheDocument();
    expect(screen.getByText('Первый 3 : 2 Четвёртый')).toHaveClass(
      'tournament-bracket-game__result--home-won',
    );
    expect(screen.getByText('Счёт в серии 4 : 2')).toBeInTheDocument();
    expect(screen.queryByText('Счёт в серии 0 : 0')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('0 побед')).not.toBeInTheDocument();
    expect(screen.getByText('Первый').closest('.tournament-bracket-player')).toHaveClass(
      'tournament-bracket-player--winner',
    );
    expect(screen.getByText('Второй').closest('.tournament-bracket-player')).not.toHaveClass(
      'tournament-bracket-player--winner',
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Финал' }));
    expect(screen.getByRole('heading', { name: 'Финал' })).toBeInTheDocument();
    expect(screen.getByText('Победитель полуфинала 1')).toBeInTheDocument();
    expect(screen.getByText('Победитель полуфинала 2')).toBeInTheDocument();
    expect(screen.queryByText('Полуфинал 1')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'За 3-е место' }));
    expect(screen.getByRole('heading', { name: 'За 3-е место' })).toBeInTheDocument();
    expect(screen.getByText('Проигравший полуфинала 1')).toBeInTheDocument();
  });

  it('shows my playoff readiness and the current series score without revealing live scores', async () => {
    vi.spyOn(api, 'fetchTournaments').mockResolvedValue({
      tournaments: [
        {
          id: 'playoff-ready',
          slug: 'playoff-ready',
          title: 'Кубок готовности',
          description: 'Финальная серия',
          status: 'playoff',
          regularSource: 'head_to_head',
          visibility: 'public',
          revision: 2,
          participantCount: 2,
          lifecycle: TEST_LIFECYCLE,
          myParticipantState: 'approved',
          registrationOpensAt: null,
          registrationClosesAt: null,
          startsAt: '2030-09-01T07:00:00.000Z',
          rules: {
            config: {
              participantLimit: 2,
              entryFeeCoins: 0,
              playoffSize: 2,
              timezone: 'Europe/Moscow',
            },
          },
        },
      ],
    });
    vi.spyOn(api, 'fetchTournamentBracket').mockResolvedValue({
      series: [
        {
          id: 'series-ready',
          bracket_position: 1,
          kind: 'championship',
          round_number: 1,
          round_name: 'Финал',
          wins_required: 4,
          status: 'active',
          higher_seed_wins: 1,
          lower_seed_wins: 0,
          winner_user_id: null,
          higher_user_id: 'u1',
          higher_seed: 1,
          higher_name: 'Первый',
          higher_avatar_url: '/first.webp',
          lower_user_id: 'u2',
          lower_seed: 2,
          lower_name: 'Второй',
          lower_avatar_url: '/second.webp',
          depends_on: null,
          fixtures: [
            {
              id: 'fixture-ready',
              gameNumber: 2,
              scheduledStartsAt: '2030-09-10T12:00:00.000Z',
              windowEndsAt: '2030-09-10T13:00:00.000Z',
              status: 'active',
              homeName: 'Первый',
              awayName: 'Второй',
              homeScore: 0,
              awayScore: 0,
              winnerSide: null,
            },
          ],
        },
      ],
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          attempt: {
            id: 'attempt-ready',
            number: 1,
            kind: 'initial',
            status: 'ready_check',
            scheduledStart: '2030-09-10T12:00:00.000Z',
            readinessExpiresAt: '2030-09-10T12:05:00.000Z',
            hardDeadlineAt: '2030-09-10T13:00:00.000Z',
            myReady: true,
            opponentReady: false,
            duelMatchId: 'duel-ready',
            result: null,
            incidentType: null,
          },
          opponentProgress: null,
          series: {
            id: 'series-ready',
            winsRequired: 4,
            myWins: 1,
            opponentWins: 0,
            higherSeedWins: 1,
            lowerSeedWins: 0,
            higherSeedUserId: 'u1',
            lowerSeedUserId: 'u2',
            status: 'active',
            winnerUserId: null,
          },
          tournament: { status: 'playoff', winnerUserId: null },
          nextGameChoice: null,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <MemoryRouter>
        <QueryClientProvider client={client}>
          <TournamentCatalog />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Открыть Кубок готовности' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Плей-офф' }));

    expect(await screen.findByText('Вы готовы')).toBeInTheDocument();
    expect(screen.getByText('Ждём готовность соперника')).toBeInTheDocument();
    expect(screen.getByText('Серия: вы ведёте 1 : 0')).toBeInTheDocument();
    expect(screen.getByText('До победы в 4 играх')).toBeInTheDocument();
    expect(screen.queryByText(/текущий счёт/i)).not.toBeInTheDocument();
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
          lifecycle: TEST_LIFECYCLE,
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
          lifecycle: TEST_LIFECYCLE,
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
    fireEvent.click(await screen.findByRole('button', { name: /1 сентября.*ваша игра/i }));

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
          lifecycle: TEST_LIFECYCLE,
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

    expect(screen.getByText('Ждём открытия регистрации')).toBeInTheDocument();
    expect(screen.getByText(/Регистрация откроется/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Регистрация ещё не открыта' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Регистрация ещё не открыта' }));
    expect(apply).not.toHaveBeenCalled();
  });

  it('uses lifecycle availability for registration and the approved-player waiting state', async () => {
    vi.spyOn(api, 'fetchTournaments').mockResolvedValue({
      tournaments: [
        {
          id: 'waiting-registration',
          slug: 'waiting-registration',
          title: 'Регистрация позже',
          description: '',
          status: 'registration',
          regularSource: 'daily_aggregate',
          visibility: 'public',
          revision: 1,
          participantCount: 0,
          lifecycle: {
            action: 'registration_waiting',
            dueAt: '2030-09-01T07:00:00.000Z',
            approvedParticipantCount: 0,
            requiredParticipantCount: 2,
            reason: null,
          },
          myParticipantState: null,
          registrationOpensAt: null,
          registrationClosesAt: null,
          startsAt: null,
          rules: { config: { participantLimit: 8, entryFeeCoins: 0, playoffSize: 2 } },
        },
        {
          id: 'waiting-regular',
          slug: 'waiting-regular',
          title: 'Ждём старт сезона',
          description: '',
          status: 'scheduling',
          regularSource: 'classic',
          visibility: 'public',
          revision: 1,
          participantCount: 4,
          lifecycle: {
            action: 'await_manual_regular_start',
            dueAt: null,
            approvedParticipantCount: 4,
            requiredParticipantCount: 2,
            reason: null,
          },
          myParticipantState: 'approved',
          registrationOpensAt: null,
          registrationClosesAt: null,
          startsAt: null,
          rules: { config: { participantLimit: 8, entryFeeCoins: 0, playoffSize: 2 } },
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

    fireEvent.click(await screen.findByRole('button', { name: 'Открыть Регистрация позже' }));
    expect(screen.getByText('Регистрация откроется 1 сентября в 10:00 мск')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Подать заявку' })).not.toBeInTheDocument();

    cleanup();
    render(
      <MemoryRouter initialEntries={['/?tournament=waiting-regular']}>
        <QueryClientProvider client={client}>
          <TournamentCatalog />
        </QueryClientProvider>
      </MemoryRouter>,
    );
    expect(
      screen.getByText('Заявка подтверждена. Ожидаем начала регулярного сезона.'),
    ).toBeInTheDocument();
  });

  it('shows daily aggregate matchdays even though the format has no fixtures', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2030-09-02T12:00:00.000Z').getTime());
    vi.spyOn(api, 'fetchTournaments').mockResolvedValue({
      tournaments: [
        {
          id: 'daily-1',
          slug: 'daily-cup',
          title: 'Ежедневный кубок',
          description: 'Четыре игровых дня',
          status: 'regular',
          regularSource: 'daily_aggregate',
          visibility: 'public',
          revision: 2,
          participantCount: 6,
          lifecycle: TEST_LIFECYCLE,
          myParticipantState: 'approved',
          registrationOpensAt: '2030-08-01T07:00:00.000Z',
          registrationClosesAt: '2030-08-31T07:00:00.000Z',
          startsAt: '2030-09-01T07:00:00.000Z',
          rules: { config: { participantLimit: 16, entryFeeCoins: 0, playoffSize: 4 } },
        },
      ],
    });
    vi.spyOn(api, 'fetchTournamentSchedule').mockResolvedValue({
      fixtures: [],
      matchdays: [
        {
          id: 'day-1',
          number: 1,
          localDate: '2030-09-01',
          startsAt: '2030-09-01T07:00:00.000Z',
          endsAt: '2030-09-02T07:00:00.000Z',
        },
        {
          id: 'day-2',
          number: 2,
          localDate: '2030-09-02',
          startsAt: '2030-09-02T07:00:00.000Z',
          endsAt: '2030-09-03T07:00:00.000Z',
        },
        {
          id: 'day-3',
          number: 3,
          localDate: '2030-09-03',
          startsAt: '2030-09-03T07:00:00.000Z',
          endsAt: '2030-09-04T07:00:00.000Z',
        },
      ],
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    function LocationProbe() {
      return <output aria-label="Текущий адрес">{useLocation().search}</output>;
    }
    render(
      <MemoryRouter>
        <QueryClientProvider client={client}>
          <TournamentCatalog />
          <LocationProbe />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Открыть Ежедневный кубок' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Расписание' }));

    expect(await screen.findByRole('grid', { name: 'Календарь турнира' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /2 сентября.*игровой день/i })).toHaveClass(
      'tournament-calendar__day--mine',
      'tournament-calendar__day--selected',
    );
    expect(screen.queryByText('1-й тур')).not.toBeInTheDocument();
    expect(screen.getByText('2-й тур')).toBeInTheDocument();
    expect(screen.queryByText('3-й тур')).not.toBeInTheDocument();
    expect(screen.getAllByText('Начало')).toHaveLength(1);
    expect(screen.getAllByText('Конец')).toHaveLength(1);
    expect(screen.getByText('2-й тур').closest('article')).toHaveClass(
      'tournament-matchday-row--current',
    );
    expect(screen.getByText('2-й тур').closest('article')).toHaveTextContent('Сейчас');
    fireEvent.click(screen.getByRole('button', { name: 'Открыть ежедневную игру' }));
    expect(screen.getByLabelText('Текущий адрес')).toHaveTextContent('view=daily');
    expect(screen.getByLabelText('Текущий адрес')).toHaveTextContent('section=tournaments');
    expect(screen.getByLabelText('Текущий адрес')).toHaveTextContent('tournament=daily-1');
    expect(screen.getByLabelText('Текущий адрес')).toHaveTextContent('tab=schedule');

    fireEvent.click(screen.getByRole('button', { name: /3 сентября.*игровой день/i }));
    expect(screen.queryByText('2-й тур')).not.toBeInTheDocument();
    expect(screen.getByText('3-й тур').closest('article')).toHaveClass(
      'tournament-matchday-row--upcoming',
    );
    expect(screen.queryByText('Расписание появится позже.')).not.toBeInTheDocument();
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
          lifecycle: TEST_LIFECYCLE,
          myParticipantState: null,
          registrationOpensAt: null,
          registrationClosesAt: null,
          startsAt: '2030-09-01T07:00:00.000Z',
          playoffFormats: [{ roundNumber: 1, duelKind: 'express_plus' }],
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

    expect(
      screen.getByText(
        'Каждый сыграет с каждым один раз. Каждый день проходит 3 тура. Первый тур начнётся 1 сентября 2030 г. в 10:00 (МСК).',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Если несколько игроков окажутся вровень, места определятся сначала по очкам, затем по количеству побед и разнице шайб.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Первый раунд' })).toBeInTheDocument();
    expect(screen.getByText('Серия идёт до 4 побед.')).toBeInTheDocument();
    expect(
      screen.getByText((_content, element) => element?.textContent === 'Формат игры: Микс.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Первые две игры — дома, следующие две — в гостях. Затем площадки чередуются: дома, в гостях, дома.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Если основное время закончится вничью, будет 2 овертайма. Затем — буллиты: по 3 броска каждому, после этого по одному до победы.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('1 место — 100 опыта, 50 монет, 3 звезды')).toBeInTheDocument();
    expect(screen.getByText('1 место — 200 опыта, 100 монет, 5 звёзд')).toBeInTheDocument();
    expect(
      screen.queryByText(/Критерии равенства|стартовых буллитов|ревизия/i),
    ).not.toBeInTheDocument();
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
          lifecycle: TEST_LIFECYCLE,
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
          lifecycle: TEST_LIFECYCLE,
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
    fireEvent.click(await screen.findByRole('button', { name: 'Открыть игру' }));

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

  it('does not create a duplicate duel while the fixture is opening', async () => {
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
          lifecycle: TEST_LIFECYCLE,
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

    fireEvent.click(await screen.findByRole('button', { name: 'Открыть Кубок позднего ответа' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Расписание' }));
    const openButton = await screen.findByRole('button', { name: 'Открыть игру' });
    fireEvent.click(openButton);
    fireEvent.click(openButton);

    await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Открываем…' })).toBeDisabled();

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

    await waitFor(() =>
      expect(screen.getByLabelText('Текущий адрес')).toHaveTextContent('match=late-duel'),
    );
  });

  it('keeps the tournament schedule visible when opening a duel fails', async () => {
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
          lifecycle: TEST_LIFECYCLE,
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
    vi.spyOn(api, 'openTournamentFixtureSegment').mockRejectedValue(new Error('network failure'));
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
    fireEvent.click(await screen.findByRole('button', { name: 'Открыть игру' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось открыть игру');
    expect(screen.getByRole('tab', { name: 'Расписание' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Открыть игру' })).toBeEnabled();
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
          lifecycle: TEST_LIFECYCLE,
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
    const open = vi
      .spyOn(api, 'openTournamentFixtureSegment')
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce({
        fixtureId: 'f1',
        segmentId: 'segment-1',
        duelMatchId: 'duel-after-retry',
        kind: 'regulation',
        sequenceNumber: 1,
      });
    function LocationProbe() {
      return <output aria-label="Текущий адрес">{useLocation().search}</output>;
    }
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <MemoryRouter>
        <QueryClientProvider client={client}>
          <TournamentCatalog />
          <LocationProbe />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Открыть Кубок ошибки' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Расписание' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Открыть игру' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось открыть игру');
    fireEvent.click(screen.getByRole('button', { name: 'Открыть игру' }));
    await waitFor(() => expect(open).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getByLabelText('Текущий адрес')).toHaveTextContent(
        'match=duel-after-retry&play=1',
      ),
    );
  });
});
