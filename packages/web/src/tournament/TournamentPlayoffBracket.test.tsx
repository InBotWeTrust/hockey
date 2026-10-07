import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TournamentBracketSeries } from '../api/tournament.js';
import { TournamentPlayoffBracket } from './TournamentPlayoffBracket.js';

const ACTIVE_SERIES: TournamentBracketSeries = {
  id: 'active-final',
  bracket_position: 1,
  kind: 'championship',
  round_number: 1,
  round_name: 'Финал',
  wins_required: 4,
  status: 'active',
  higher_seed_wins: 1,
  lower_seed_wins: 1,
  winner_user_id: null,
  higher_user_id: 'u1',
  higher_seed: 1,
  higher_name: 'Sirius',
  higher_avatar_url: null,
  lower_user_id: 'u2',
  lower_seed: 4,
  lower_name: 'Aleksandra',
  lower_avatar_url: null,
  depends_on: { key: 'R1S1', sources: [] },
  fixtures: [
    {
      id: 'game-1',
      gameNumber: 1,
      scheduledStartsAt: '2020-09-03T10:00:00.000Z',
      windowEndsAt: '2020-09-03T10:30:00.000Z',
      status: 'settled',
      homeUserId: 'u1',
      awayUserId: 'u2',
      homeName: 'Sirius',
      awayName: 'Aleksandra',
      homeScore: 77,
      awayScore: 57,
      winnerSide: 'home',
    },
    {
      id: 'game-2',
      gameNumber: 2,
      scheduledStartsAt: '2020-09-03T10:30:00.000Z',
      windowEndsAt: '2020-09-03T11:00:00.000Z',
      status: 'settled',
      homeUserId: 'u1',
      awayUserId: 'u2',
      homeName: 'Sirius',
      awayName: 'Aleksandra',
      homeScore: 59,
      awayScore: 64,
      winnerSide: 'away',
    },
  ],
};

describe('TournamentPlayoffBracket series modal', () => {
  it('explains an express tie with saved accuracy and names the winner', () => {
    render(<TournamentPlayoffBracket tournamentId="cup" currentUserId={null}
      onOpenFixture={vi.fn()} timezone="Europe/Moscow"
      series={[{ ...ACTIVE_SERIES, fixtures: [{ ...ACTIVE_SERIES.fixtures[0]!,
        homeScore: 21, awayScore: 21, winnerSide: 'away', resultDetails: {
          duelKind: 'express', homeAccuracy: 70, awayAccuracy: 75.005,
          homeActiveTimeMs: 180000, awayActiveTimeMs: 180000, technicalReason: null,
        },
      }] }]} />);
    fireEvent.click(screen.getByRole('button', { name: /Открыть серию/ }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Sirius (70%)');
    expect(dialog).toHaveTextContent('Aleksandra (75,01%)');
    expect(within(dialog).getByText('Победитель: Aleksandra · по точности')).toBeInTheDocument();
  });

  it('omits the next fixture time while retaining game-day start times', () => {
    render(
      <TournamentPlayoffBracket
        tournamentId="cup"
        currentUserId={null}
        onOpenFixture={vi.fn()}
        series={[{ ...ACTIVE_SERIES, fixtures: [{
          ...ACTIVE_SERIES.fixtures[0]!, status: 'scheduled',
          scheduledStartsAt: '2099-10-05T16:37:00.000Z',
          gameDay: { id: 'day', dayNumber: 1, localDate: '2099-10-05', startsAt: '2099-10-05T16:00:00.000Z' },
        }] }]}
        timezone="Europe/Moscow"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Открыть серию/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByText(/Следующая:/)).toBeNull();
    expect(within(dialog).getByText('5 октября, начало в 19:00')).toBeInTheDocument();
  });

  it('shows each played game as a neutral, visually separated matchup row', () => {
    render(
      <TournamentPlayoffBracket
        tournamentId="cup"
        currentUserId={null}
        onOpenFixture={vi.fn()}
        series={[ACTIVE_SERIES]}
        timezone="Europe/Moscow"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Открыть серию/ }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getAllByText('Идёт серия')).toHaveLength(1);

    const results = dialog.querySelectorAll('.tournament-bracket-game__result');
    expect(results).toHaveLength(2);
    expect(results[0]).toHaveTextContent('Sirius — Aleksandra 77:57');
    expect(results[1]).toHaveTextContent('Sirius — Aleksandra 59:64');
    expect(dialog.querySelector('.tournament-bracket-game__participant--winner')).toBeNull();
    expect(dialog.querySelector('.tournament-bracket-game__participant--own-loss')).toBeNull();
    expect(dialog.querySelectorAll('.tournament-bracket-game--played')).toHaveLength(2);
  });

  it('shows a settled technical win instead of its stored 0:0 score', () => {
    const technicalSeries = {
      ...ACTIVE_SERIES,
      fixtures: [
        {
          ...ACTIVE_SERIES.fixtures[0]!,
          id: 'game-technical',
          homeScore: 0,
          awayScore: 0,
          winnerSide: 'away',
          technicalResult: true,
        },
      ],
    } satisfies TournamentBracketSeries;

    render(
      <TournamentPlayoffBracket
        tournamentId="cup"
        currentUserId={null}
        onOpenFixture={vi.fn()}
        series={[technicalSeries]}
        timezone="Europe/Moscow"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Открыть серию/ }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Техническая победа — Aleksandra')).toBeInTheDocument();
    expect(within(dialog).queryByText(/0:0/)).not.toBeInTheDocument();
  });

  it('places a muted seed number before the avatar and vertically centers the player name', () => {
    render(
      <TournamentPlayoffBracket
        tournamentId="cup"
        currentUserId={null}
        onOpenFixture={vi.fn()}
        series={[ACTIVE_SERIES]}
        timezone="Europe/Moscow"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Открыть серию/ }));

    const firstPlayer = screen
      .getByRole('dialog')
      .querySelector('.tournament-bracket-series-modal__player');
    expect(firstPlayer).not.toBeNull();
    const identity = firstPlayer!.querySelector('.tournament-bracket-series-modal__identity');
    expect(identity?.children[0]).toHaveClass('tournament-bracket-series-modal__seed');
    expect(identity?.children[0]).toHaveTextContent('1');
    expect(identity?.children[1]?.getAttribute('aria-hidden')).toBe('true');
    expect(identity?.children[2]).toHaveClass('tournament-bracket-series-modal__name');
    expect(within(firstPlayer as HTMLElement).queryByText(/Посев/)).not.toBeInTheDocument();
  });

  it('groups fixtures by game day and shows only the block start time', () => {
    const series = {
      ...ACTIVE_SERIES,
      fixtures: [
        {
          ...ACTIVE_SERIES.fixtures[0]!,
          gameDay: {
            id: 'day-1',
            dayNumber: 1,
            localDate: '2020-09-03',
            startsAt: '2020-09-03T10:00:00.000Z',
          },
        },
        {
          ...ACTIVE_SERIES.fixtures[1]!,
          scheduledStartsAt: null,
          windowEndsAt: null,
          gameDay: {
            id: 'day-2',
            dayNumber: 2,
            localDate: '2020-09-04',
            startsAt: '2020-09-04T11:00:00.000Z',
          },
        },
      ],
    } as unknown as TournamentBracketSeries;

    render(
      <TournamentPlayoffBracket
        tournamentId="cup"
        currentUserId={null}
        onOpenFixture={vi.fn()}
        series={[series]}
        timezone="Europe/Moscow"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Открыть серию/ }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('3 сентября, начало в 13:00')).toBeInTheDocument();
    expect(within(dialog).getByText('4 сентября, начало в 14:00')).toBeInTheDocument();
    expect(within(dialog).getByText('Игра 1')).toBeInTheDocument();
    expect(within(dialog).getByText('Игра 2')).toBeInTheDocument();
    expect(within(dialog).queryByText(/13:00–13:30/)).not.toBeInTheDocument();
  });

  it('shows one completion label and hides unused fixtures after the series is won', () => {
    const completed = {
      ...ACTIVE_SERIES,
      status: 'completed',
      higher_seed_wins: 2,
      lower_seed_wins: 0,
      winner_user_id: 'u1',
      fixtures: [
        ...ACTIVE_SERIES.fixtures,
        {
          ...ACTIVE_SERIES.fixtures[1]!,
          id: 'game-3',
          gameNumber: 3,
          status: 'scheduled',
          homeScore: null,
          awayScore: null,
          winnerSide: null,
        },
      ],
    } satisfies TournamentBracketSeries;

    render(
      <TournamentPlayoffBracket
        tournamentId="cup"
        currentUserId={null}
        onOpenFixture={vi.fn()}
        series={[completed]}
        timezone="Europe/Moscow"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Открыть серию/ }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getAllByText(/Завершена/)).toHaveLength(1);
    expect(within(dialog).queryByText(/Игра 3/)).not.toBeInTheDocument();
  });
});
