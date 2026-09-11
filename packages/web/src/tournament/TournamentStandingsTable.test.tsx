import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TournamentStandingsTable } from './TournamentStandingsTable.js';

describe('TournamentStandingsTable', () => {
  it('renders classic goal standings as a full four-column table', () => {
    const longName = 'Очень длинное имя участника турнира';
    render(
      <TournamentStandingsTable
        regularSource="classic"
        dailyMetric="goals_sum"
        playoffSize={2}
        rows={[
          {
            rank: 1,
            display_name: 'QA Игрок 2',
            avatar_url: '/qa-player-2.webp',
            played: 1,
            points: '30.0000',
          },
          { rank: 2, display_name: 'QA Игрок 1', played: 1, points: '24.0000' },
          { rank: 3, display_name: longName, played: 0, points: '0.0000' },
        ]}
      />,
    );

    expect(screen.getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      'Место',
      'Игрок',
      'Игры',
      'Шайбы',
    ]);
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows[0]).toHaveClass('tournament-standing-table__playoff-place');
    expect(rows[1]).toHaveClass('tournament-standing-table__playoff-place');
    expect(rows[1]).toHaveClass('tournament-standing-table__medal-place--silver');
    expect(rows[2]).not.toHaveClass('tournament-standing-table__playoff-place');
    expect(
      within(rows[0]!)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['1', 'QA Игрок 2', '1', '30']);
    expect(within(rows[0]!).getByRole('img', { name: 'QA Игрок 2' })).toHaveAttribute(
      'src',
      '/qa-player-2.webp',
    );
    expect(rows[1]!.querySelector('[data-initial="Q"]')).not.toBeNull();
    const lastRowCells = within(rows[2]!).getAllByRole('cell');
    expect(lastRowCells[0]).toHaveTextContent('3');
    expect(within(rows[2]!).getByText(longName)).toHaveAttribute('title', longName);
    expect(lastRowCells[2]).toHaveTextContent('0');
    expect(lastRowCells[3]).toHaveTextContent('0');
    expect(document.querySelector('.tournament-standing-table-wrap')).not.toBeInTheDocument();
  });

  it('renders Classic average accuracy as a percentage', () => {
    render(
      <TournamentStandingsTable
        regularSource="classic"
        dailyMetric="accuracy_average"
        rows={[{ rank: 1, display_name: 'Точный', played: 1, points: '0.4567' }]}
      />,
    );

    expect(screen.getByRole('columnheader', { name: 'Точность' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '45,7%' })).toBeInTheDocument();
  });

  it('renders Classic place points as points', () => {
    render(
      <TournamentStandingsTable
        regularSource="classic"
        dailyMetric="daily_place_points"
        rows={[{ rank: 1, display_name: 'Лидер', played: 2, points: '10.0000' }]}
      />,
    );

    expect(screen.getByRole('columnheader', { name: 'Очки' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '10' })).toBeInTheDocument();
  });

  it('renders ordinary head-to-head goals from goals_for', () => {
    render(
      <TournamentStandingsTable
        regularSource="head_to_head"
        dailyMetric={null}
        rows={[{ rank: 1, display_name: 'Нападающий', played: 3, goals_for: 7, points: 99 }]}
      />,
    );

    expect(screen.getByRole('columnheader', { name: 'Шайбы' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '7' })).toBeInTheDocument();
  });

  it('marks duel rating medal places while keeping the current-user highlight primary', () => {
    render(
      <TournamentStandingsTable
        variant="duel-rating"
        regularSource="head_to_head"
        dailyMetric={null}
        currentUserId="user-2"
        rows={[
          { user_id: 'user-1', rank: 1, display_name: 'Первый', played: 5, wins: 5, points: 15 },
          { user_id: 'user-2', rank: 2, display_name: 'Вы', played: 5, wins: 3, points: 9 },
          { user_id: 'user-3', rank: 3, display_name: 'Третий', played: 5, wins: 2, points: 6 },
          { user_id: 'user-4', rank: 4, display_name: 'Четвёртый', played: 5, wins: 1, points: 3 },
        ]}
      />,
    );

    const rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]!).getAllByRole('cell').at(-1)).toHaveTextContent('15');
    expect(rows[0]).toHaveClass('tournament-standing-table__medal-place--gold');
    expect(rows[1]).toHaveClass('tournament-standing-table__current-user');
    expect(rows[1]).not.toHaveClass('tournament-standing-table__medal-place--silver');
    expect(rows[2]).toHaveClass('tournament-standing-table__medal-place--bronze');
    expect(rows[3]?.className).toBe('');
  });

  it('marks second place silver in duel ratings', () => {
    render(
      <TournamentStandingsTable
        variant="duel-rating"
        regularSource="head_to_head"
        dailyMetric={null}
        rows={[
          { user_id: 'user-1', rank: 1, display_name: 'Первый', played: 5, wins: 5, points: 15 },
          { user_id: 'user-2', rank: 2, display_name: 'Второй', played: 5, wins: 3, points: 9 },
        ]}
      />,
    );

    expect(screen.getAllByRole('row')[2]).toHaveClass(
      'tournament-standing-table__medal-place--silver',
    );
  });

  it('renders the experience-rating variant without medal highlighting', () => {
    render(
      <TournamentStandingsTable
        variant="experience-rating"
        regularSource="head_to_head"
        dailyMetric={null}
        currentUserId="user-2"
        currentUserRowTestId="experience-current"
        rows={[
          { user_id: 'user-1', rank: 1, display_name: 'Первый', experience: 1500 },
          { user_id: 'user-2', rank: 2, display_name: 'Вы', experience: 1200 },
        ]}
      />,
    );

    expect(screen.getByRole('columnheader', { name: 'М' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Опыт' })).toBeInTheDocument();
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows[0]).not.toHaveClass('tournament-standing-table__medal-place--gold');
    expect(screen.getByTestId('experience-current')).toHaveClass(
      'tournament-standing-table__current-user',
    );
    expect(within(rows[0]!).getAllByRole('cell')).toHaveLength(3);
    expect(within(rows[0]!).getAllByRole('cell').at(-1)).toHaveTextContent('1 500');
  });
});
