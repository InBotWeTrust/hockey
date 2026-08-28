import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
  it('opens the selected day in a modal and shows my game first', () => {
    const fixtures = [fixture(1), fixture(2), fixture(3), fixture(4), fixture(5), fixture(6, true)];
    render(
      <TournamentScheduleCalendar
        fixtures={fixtures}
        matchdays={[]}
        regularSource="head_to_head"
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
    expect(screen.getByText('Моя игра')).toBeInTheDocument();
    expect(screen.getByText('Игра 1')).toBeInTheDocument();
    expect(screen.getByText('Игра 2')).toBeInTheDocument();
    expect(screen.getByText('Игра 3')).toBeInTheDocument();
    expect(screen.queryByText('Игра 4')).not.toBeInTheDocument();
    expect(screen.queryByText('Игра 5')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Показать все игры (6)' }));
    expect(screen.getByText('Игра 4')).toBeInTheDocument();
    expect(screen.getByText('Игра 5')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Свернуть' }));
    expect(screen.queryByText('Игра 4')).not.toBeInTheDocument();
  });

  it('explains an empty tournament day in the modal', () => {
    render(
      <TournamentScheduleCalendar
        fixtures={[fixture(1)]}
        matchdays={[]}
        regularSource="head_to_head"
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
});
