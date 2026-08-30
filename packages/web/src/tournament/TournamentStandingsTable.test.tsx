import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TournamentStandingsTable } from './TournamentStandingsTable.js';

describe('TournamentStandingsTable', () => {
  it('renders daily goal standings as a full four-column table', () => {
    const longName = 'Очень длинное имя участника турнира';
    render(
      <TournamentStandingsTable
        regularSource="daily_aggregate"
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
    expect(within(rows[1]!).getByText('Q')).toBeInTheDocument();
    const lastRowCells = within(rows[2]!).getAllByRole('cell');
    expect(lastRowCells[0]).toHaveTextContent('3');
    expect(within(rows[2]!).getByText(longName)).toHaveAttribute('title', longName);
    expect(lastRowCells[2]).toHaveTextContent('0');
    expect(lastRowCells[3]).toHaveTextContent('0');
    expect(document.querySelector('.tournament-standing-table-wrap')).not.toBeInTheDocument();
  });

  it('marks duel rating medal places while keeping the current-user highlight primary', () => {
    render(
      <TournamentStandingsTable
        variant="duel-rating"
        regularSource="head_to_head"
        dailyMetric={null}
        currentUserId="user-2"
        rows={[
          { user_id: 'user-1', rank: 1, display_name: 'Первый', played: 5, wins: 5 },
          { user_id: 'user-2', rank: 2, display_name: 'Вы', played: 5, wins: 3 },
          { user_id: 'user-3', rank: 3, display_name: 'Третий', played: 5, wins: 2 },
          { user_id: 'user-4', rank: 4, display_name: 'Четвёртый', played: 5, wins: 1 },
        ]}
      />,
    );

    const rows = screen.getAllByRole('row').slice(1);
    expect(rows[0]).toHaveClass('tournament-standing-table__medal-place--gold');
    expect(rows[1]).toHaveClass('tournament-standing-table__current-user');
    expect(rows[1]).not.toHaveClass('tournament-standing-table__medal-place--silver');
    expect(rows[2]).toHaveClass('tournament-standing-table__medal-place--bronze');
    expect(rows[3]?.className).toBe('');
  });
});
