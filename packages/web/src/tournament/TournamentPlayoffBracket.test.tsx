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
  it('keeps every game result in one fixed matchup layout and shows the active status once', () => {
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
    for (const result of results) {
      expect(result).toHaveClass('tournament-bracket-game__result');
      expect(result.classList).toHaveLength(1);
      expect(
        result.querySelector(':scope > .tournament-bracket-game__participant--home'),
      ).not.toBeNull();
      expect(result.querySelector(':scope > .tournament-bracket-game__score')).not.toBeNull();
      expect(
        result.querySelector(':scope > .tournament-bracket-game__participant--away'),
      ).not.toBeNull();
    }
  });
});
