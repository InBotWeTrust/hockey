import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TournamentFixture } from '../api/tournament.js';
import { TournamentScheduleCalendar } from './TournamentScheduleCalendar.js';

function fixture(index: number, mine = false): TournamentFixture {
  return {
    id: `fixture-${index}`,
    fixtureNumber: index,
    stage: 'regular',
    roundNumber: 1,
    scheduledStartsAt: '2030-09-01T07:00:00.000Z',
    windowEndsAt: '2030-09-01T08:00:00.000Z',
    status: 'scheduled',
    venueMode: 'home_selected',
    home: { userId: mine ? 'me' : `home-${index}`, name: mine ? 'Моя игра' : `Игра ${index}` },
    away: { userId: `away-${index}`, name: `Соперник ${index}` },
    score: { home: 0, away: 0 },
  };
}

describe('TournamentScheduleCalendar', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens the selected day in a modal and shows my game first', () => {
    const fixtures = [fixture(1), fixture(2), fixture(3), fixture(4), fixture(5), fixture(6, true)];
    render(
      <TournamentScheduleCalendar
        fixtures={fixtures}
        matchdays={[]}
        regularSource="head_to_head"
        tournamentStatus="regular"
        currentUserId="me"
        isParticipant
        timezone="Europe/Moscow"
        rangeStartsAt="2030-09-01T00:00:00.000Z"
        rangeEndsAt="2030-09-01T23:59:59.000Z"
        renderFixture={(item) => <article key={item.id}>{item.home?.name}</article>}
        formatDateTime={(value) => value}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /1 сентября.*ваша игра/i }));

    expect(screen.getByRole('dialog', { name: 'Игры выбранного дня' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ваши игры' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Остальные игры' })).toBeInTheDocument();
    expect(screen.getByText('Моя игра')).toBeInTheDocument();
    expect(screen.getByText('Игра 1')).toBeInTheDocument();
    expect(screen.getByText('Игра 2')).toBeInTheDocument();
    expect(screen.getByText('Игра 3')).toBeInTheDocument();
    expect(screen.getByText('Игра 4')).toBeInTheDocument();
    expect(screen.queryByText('Игра 5')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Показать ещё (1)' }));
    expect(screen.getByText('Игра 5')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Свернуть' }));
    expect(screen.queryByText('Игра 5')).not.toBeInTheDocument();
  });

  it('separates my inline fixtures from the other games of the day', () => {
    render(
      <TournamentScheduleCalendar
        fixtures={[fixture(1), fixture(2, true)]}
        matchdays={[]}
        regularSource="head_to_head"
        tournamentStatus="regular"
        currentUserId="me"
        isParticipant
        timezone="Europe/Moscow"
        rangeStartsAt="2030-09-01T00:00:00.000Z"
        rangeEndsAt="2030-09-01T23:59:59.000Z"
        fixtureDetailsMode="inline"
        renderFixture={(item) => <article key={item.id}>{item.home?.name}</article>}
        formatDateTime={(value) => value}
      />,
    );

    const headings = screen.getAllByRole('heading').map((heading) => heading.textContent);
    expect(headings).toContain('Ваши игры');
    expect(headings).toContain('Остальные игры');
    expect(screen.getByText('Моя игра').compareDocumentPosition(screen.getByText('Игра 1'))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('paginates other games below the calendar when inline day details are requested', () => {
    const fixtures = [fixture(1), fixture(2), fixture(3), fixture(4), fixture(5), fixture(6)];
    render(
      <TournamentScheduleCalendar
        fixtures={fixtures}
        matchdays={[]}
        regularSource="head_to_head"
        tournamentStatus="regular"
        currentUserId={null}
        isParticipant={false}
        timezone="Europe/Moscow"
        rangeStartsAt="2030-09-01T00:00:00.000Z"
        rangeEndsAt="2030-09-01T23:59:59.000Z"
        fixtureDetailsMode="inline"
        renderFixture={(item) => <article key={item.id}>{item.home?.name}</article>}
        formatDateTime={(value) => value}
      />,
    );

    expect(screen.getByRole('heading', { name: '1 сентября' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Все игры дня' })).toBeInTheDocument();
    expect(screen.getByText('Игра 1')).toBeInTheDocument();
    expect(screen.getByText('Игра 4')).toBeInTheDocument();
    expect(screen.queryByText('Игра 5')).not.toBeInTheDocument();
    expect(screen.queryByText('Игра 6')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Показать ещё (2)' }));
    expect(screen.getByText('Игра 5')).toBeInTheDocument();
    expect(screen.getByText('Игра 6')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Игры выбранного дня' })).not.toBeInTheDocument();
    expect(screen.queryByText('Ваша игра')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Показать все игры/ })).not.toBeInTheDocument();
  });

  it('selects today when the tournament schedule contains games for today', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-09-02T09:00:00.000Z'));
    const todayFixture = {
      ...fixture(2),
      scheduledStartsAt: '2030-09-02T10:00:00.000Z',
      windowEndsAt: '2030-09-02T11:00:00.000Z',
    };
    render(
      <TournamentScheduleCalendar
        fixtures={[fixture(1), todayFixture]}
        matchdays={[]}
        regularSource="head_to_head"
        tournamentStatus="regular"
        currentUserId="me"
        isParticipant
        timezone="Europe/Moscow"
        rangeStartsAt="2030-09-01T00:00:00.000Z"
        rangeEndsAt="2030-09-03T23:59:59.000Z"
        fixtureDetailsMode="inline"
        renderFixture={(item) => <article key={item.id}>{item.home?.name}</article>}
        formatDateTime={(value) => value}
      />,
    );

    expect(screen.getByRole('heading', { name: '2 сентября' })).toBeInTheDocument();
    expect(screen.getByText('Игра 2')).toBeInTheDocument();
    expect(screen.queryByText('Игра 1')).not.toBeInTheDocument();
  });

  it('renders playoff fixtures inline for a tournament with daily regular games by default', () => {
    const playoffFixture = {
      ...fixture(1),
      stage: 'playoff',
      scheduledStartsAt: '2030-09-02T07:00:00.000Z',
    };
    render(
      <TournamentScheduleCalendar
        fixtures={[playoffFixture]}
        matchdays={[]}
        regularSource="daily_aggregate"
        tournamentStatus="playoff"
        currentUserId={null}
        isParticipant={false}
        timezone="Europe/Moscow"
        rangeStartsAt="2030-09-01T00:00:00.000Z"
        rangeEndsAt="2030-09-02T23:59:59.000Z"
        renderFixture={(item) => <article key={item.id}>{item.home?.name}</article>}
        formatDateTime={(value) => value}
      />,
    );

    expect(screen.getByRole('button', { name: /2 сентября, 1 игра, плей-офф/i })).toBeEnabled();
    expect(screen.getByRole('heading', { name: '2 сентября' })).toBeInTheDocument();
    expect(screen.getByText('Игра 1')).toBeInTheDocument();
  });

  it('explains an empty tournament day in the modal', () => {
    render(
      <TournamentScheduleCalendar
        fixtures={[fixture(1)]}
        matchdays={[]}
        regularSource="head_to_head"
        tournamentStatus="regular"
        currentUserId="me"
        isParticipant
        timezone="Europe/Moscow"
        rangeStartsAt="2030-09-01T00:00:00.000Z"
        rangeEndsAt="2030-09-02T23:59:59.000Z"
        renderFixture={(item) => <article key={item.id}>{item.home?.name}</article>}
        formatDateTime={(value) => value}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^2 сентября/i }));
    expect(screen.getByRole('dialog', { name: 'Игры выбранного дня' })).toHaveTextContent(
      'В этот день игр нет.',
    );
  });

  it('explains the calendar colors below the grid', () => {
    render(
      <TournamentScheduleCalendar
        fixtures={[fixture(1, true)]}
        matchdays={[]}
        regularSource="head_to_head"
        tournamentStatus="regular"
        currentUserId="me"
        isParticipant
        timezone="Europe/Moscow"
        rangeStartsAt="2030-09-01T00:00:00.000Z"
        rangeEndsAt="2030-09-10T23:59:59.000Z"
        playoffStartsAt={['2030-09-10T07:00:00.000Z']}
        renderFixture={() => null}
        formatDateTime={(value) => value}
      />,
    );

    const legend = screen.getByRole('list', { name: 'Обозначения календаря' });
    expect(legend).toHaveTextContent('Есть игры');
    expect(legend).toHaveTextContent('Ваша игра');
    expect(legend).toHaveTextContent('Плей-офф');
    expect(legend).toHaveTextContent('Выбранный день');
    expect(legend.querySelectorAll('.tournament-calendar__legend-dot')).toHaveLength(4);
  });

  it('keeps the my-game marker on my head-to-head playoff date', () => {
    const opponentPlayoff = {
      ...fixture(1),
      stage: 'playoff' as const,
      scheduledStartsAt: '2030-09-01T07:00:00.000Z',
    };
    const myPlayoff = {
      ...fixture(2, true),
      stage: 'playoff' as const,
      scheduledStartsAt: '2030-09-02T07:00:00.000Z',
    };

    render(
      <TournamentScheduleCalendar
        fixtures={[opponentPlayoff, myPlayoff]}
        matchdays={[]}
        regularSource="head_to_head"
        tournamentStatus="regular"
        currentUserId="me"
        isParticipant
        timezone="Europe/Moscow"
        rangeStartsAt="2030-09-01T00:00:00.000Z"
        rangeEndsAt="2030-09-02T23:59:59.000Z"
        renderFixture={() => null}
        formatDateTime={(value) => value}
      />,
    );

    expect(
      screen
        .getByRole('button', { name: /1 сентября.*плей-офф/i })
        .querySelector('.tournament-calendar__mine-mark'),
    ).not.toBeInTheDocument();
    expect(
      screen
        .getByRole('button', { name: /2 сентября.*плей-офф.*ваша игра/i })
        .querySelector('.tournament-calendar__mine-mark'),
    ).toBeInTheDocument();
  });

  it('shows a completed daily result instead of the open-game button', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-09-01T12:00:00.000Z'));

    render(
      <TournamentScheduleCalendar
        fixtures={[]}
        matchdays={[
          {
            id: 'day-1',
            number: 1,
            localDate: '2030-09-01',
            startsAt: '2030-09-01T00:00:00.000Z',
            endsAt: '2030-09-02T00:00:00.000Z',
            myResult: {
              goals: 37,
              shots: 90,
              accuracy: 37 / 90,
              completed: true,
            },
          },
        ]}
        regularSource="daily_aggregate"
        tournamentStatus="regular"
        currentUserId="me"
        isParticipant
        timezone="Europe/Moscow"
        rangeStartsAt="2030-09-01T00:00:00.000Z"
        rangeEndsAt="2030-09-02T00:00:00.000Z"
        renderFixture={() => null}
        formatDateTime={(value) => value}
        onOpenDailyGame={vi.fn()}
        renderMatchdayResults={(matchday) => (
          <section aria-label="Прошедшие игры дня">Результаты тура {matchday.number}</section>
        )}
      />,
    );

    expect(screen.getByText('Ваш результат')).toBeInTheDocument();
    expect(screen.getByText('37 шайб из 90 · точность 41%')).toBeInTheDocument();
    expect(screen.getByLabelText('Прошедшие игры дня')).toHaveTextContent('Результаты тура 1');
    expect(
      screen.queryByRole('button', { name: 'Открыть ежедневную игру' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/место/i)).not.toBeInTheDocument();
  });

  it('keeps the daily-game button while the current game is unfinished', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-09-01T12:00:00.000Z'));

    render(
      <TournamentScheduleCalendar
        fixtures={[]}
        matchdays={[
          {
            id: 'day-1',
            number: 1,
            localDate: '2030-09-01',
            startsAt: '2030-09-01T00:00:00.000Z',
            endsAt: '2030-09-02T00:00:00.000Z',
            myResult: null,
          },
        ]}
        regularSource="daily_aggregate"
        tournamentStatus="regular"
        currentUserId="me"
        isParticipant
        timezone="Europe/Moscow"
        rangeStartsAt="2030-09-01T00:00:00.000Z"
        rangeEndsAt="2030-09-02T00:00:00.000Z"
        renderFixture={() => null}
        formatDateTime={(value) => value}
        onOpenDailyGame={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Открыть ежедневную игру' })).toBeInTheDocument();
    expect(screen.queryByText('Ваш результат')).not.toBeInTheDocument();
  });

  it('does not offer a tournament game before the regular season starts', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-09-01T12:00:00.000Z'));

    render(
      <TournamentScheduleCalendar
        fixtures={[]}
        matchdays={[
          {
            id: 'day-1',
            number: 1,
            localDate: '2030-09-01',
            startsAt: '2030-09-01T00:00:00.000Z',
            endsAt: '2030-09-02T00:00:00.000Z',
            myResult: null,
          },
        ]}
        regularSource="daily_aggregate"
        tournamentStatus="scheduling"
        currentUserId="me"
        isParticipant
        timezone="Europe/Moscow"
        rangeStartsAt="2030-09-01T00:00:00.000Z"
        rangeEndsAt="2030-09-02T00:00:00.000Z"
        renderFixture={() => null}
        formatDateTime={(value) => value}
        onOpenDailyGame={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole('button', { name: 'Открыть ежедневную игру' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Ожидает запуска')).toBeInTheDocument();
    expect(screen.queryByText('Сейчас')).not.toBeInTheDocument();
    expect(screen.queryByText('Завершён')).not.toBeInTheDocument();
  });

  it('keeps matchdays waiting when a tournament is paused before the regular season starts', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-09-01T12:00:00.000Z'));

    render(
      <TournamentScheduleCalendar
        fixtures={[]}
        matchdays={[
          {
            id: 'day-1',
            number: 1,
            localDate: '2030-09-01',
            startsAt: '2030-09-01T00:00:00.000Z',
            endsAt: '2030-09-02T00:00:00.000Z',
            myResult: null,
          },
        ]}
        regularSource="daily_aggregate"
        tournamentStatus="paused"
        currentUserId="me"
        isParticipant
        timezone="Europe/Moscow"
        rangeStartsAt="2030-09-01T00:00:00.000Z"
        rangeEndsAt="2030-09-02T00:00:00.000Z"
        renderFixture={() => null}
        formatDateTime={(value) => value}
        onOpenDailyGame={vi.fn()}
      />,
    );

    expect(screen.getByText('Ожидает запуска')).toBeInTheDocument();
    expect(screen.queryByText('Сейчас')).not.toBeInTheDocument();
    expect(screen.queryByText('Завершён')).not.toBeInTheDocument();
  });

  it('offers a tournament game only inside the selected matchday time window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-09-01T12:00:00.000Z'));
    render(
      <TournamentScheduleCalendar
        fixtures={[]}
        matchdays={[
          {
            id: 'day-1',
            number: 1,
            localDate: '2030-09-01',
            startsAt: '2030-09-01T13:00:00.000Z',
            endsAt: '2030-09-02T13:00:00.000Z',
            myResult: null,
          },
        ]}
        regularSource="classic"
        tournamentStatus="regular"
        currentUserId="me"
        isParticipant
        timezone="Europe/Moscow"
        rangeStartsAt="2030-09-01T00:00:00.000Z"
        rangeEndsAt="2030-09-02T13:00:00.000Z"
        renderFixture={() => null}
        formatDateTime={(value) => value}
        onOpenDailyGame={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole('button', { name: 'Открыть турнирную игру' }),
    ).not.toBeInTheDocument();
  });

  it('opens the separate classic tournament game from its matchday', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-09-01T12:00:00.000Z'));
    const openGame = vi.fn();
    render(
      <TournamentScheduleCalendar
        fixtures={[]}
        matchdays={[
          {
            id: 'classic-day-1',
            number: 1,
            localDate: '2030-09-01',
            startsAt: '2030-09-01T00:00:00.000Z',
            endsAt: '2030-09-02T00:00:00.000Z',
            myResult: null,
          },
        ]}
        regularSource="classic"
        tournamentStatus="regular"
        currentUserId="me"
        isParticipant
        timezone="Europe/Moscow"
        rangeStartsAt="2030-09-01T00:00:00.000Z"
        rangeEndsAt="2030-09-02T00:00:00.000Z"
        renderFixture={() => null}
        formatDateTime={(value) => value}
        onOpenDailyGame={openGame}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Открыть турнирную игру' }));
    expect(openGame).toHaveBeenCalledOnce();
  });

  it('keeps an empty in-range month visible after manual navigation', () => {
    render(
      <TournamentScheduleCalendar
        fixtures={[]}
        matchdays={[
          {
            id: 'august-day',
            number: 1,
            localDate: '2030-08-28',
            startsAt: '2030-08-28T00:00:00.000Z',
            endsAt: '2030-08-29T00:00:00.000Z',
            myResult: null,
          },
        ]}
        regularSource="daily_aggregate"
        tournamentStatus="regular"
        currentUserId="me"
        isParticipant
        timezone="Europe/Moscow"
        rangeStartsAt="2030-08-28T00:00:00.000Z"
        rangeEndsAt="2030-09-15T00:00:00.000Z"
        renderFixture={() => null}
        formatDateTime={(value) => value}
      />,
    );

    expect(screen.getByText('Август 2030')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Следующий месяц' }));
    expect(screen.getByText('Сентябрь 2030')).toBeInTheDocument();
  });

  it('marks a configured playoff date even when no fixture exists yet', () => {
    render(
      <TournamentScheduleCalendar
        fixtures={[]}
        matchdays={[
          {
            id: 'august-day',
            number: 1,
            localDate: '2030-08-28',
            startsAt: '2030-08-28T00:00:00.000Z',
            endsAt: '2030-08-29T00:00:00.000Z',
            myResult: null,
          },
        ]}
        regularSource="daily_aggregate"
        tournamentStatus="regular"
        currentUserId="me"
        isParticipant
        timezone="Europe/Moscow"
        rangeStartsAt="2030-08-28T00:00:00.000Z"
        rangeEndsAt={null}
        playoffStartsAt={['2030-09-05T12:00:00.000Z']}
        renderFixture={() => null}
        formatDateTime={(value) => value}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Следующий месяц' }));
    expect(screen.getByText('Сентябрь 2030')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /5 сентября.*плей-офф/i })).toHaveClass(
      'tournament-calendar__day--playoff',
    );
  });

  it('extends a daily tournament range to published playoff fixtures', () => {
    const playoffFixture: TournamentFixture = {
      ...fixture(7),
      stage: 'playoff',
      scheduledStartsAt: '2030-09-10T07:00:00.000Z',
      windowEndsAt: '2030-09-11T07:00:00.000Z',
    };
    render(
      <TournamentScheduleCalendar
        fixtures={[playoffFixture]}
        matchdays={[
          {
            id: 'august-day',
            number: 1,
            localDate: '2030-08-28',
            startsAt: '2030-08-28T00:00:00.000Z',
            endsAt: '2030-08-29T00:00:00.000Z',
            myResult: null,
          },
        ]}
        regularSource="daily_aggregate"
        tournamentStatus="regular"
        currentUserId="me"
        isParticipant
        timezone="Europe/Moscow"
        rangeStartsAt="2030-08-28T00:00:00.000Z"
        rangeEndsAt="2030-08-31T23:59:59.000Z"
        renderFixture={() => null}
        formatDateTime={(value) => value}
      />,
    );

    const nextMonth = screen.getByRole('button', { name: 'Следующий месяц' });
    expect(nextMonth).toBeEnabled();
    fireEvent.click(nextMonth);
    const playoffDay = screen.getByRole('button', { name: /10 сентября.*плей-офф/i });
    expect(playoffDay).toBeEnabled();
    expect(playoffDay).not.toHaveClass('tournament-calendar__day--outside-range');
  });
});
