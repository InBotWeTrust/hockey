import { createElement } from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TournamentBracketFixture, TournamentBracketSeries } from '../api/tournament.js';
import {
  TournamentPlayoffOverview,
  playoffSeriesScheduleLabel,
} from './TournamentPlayoffOverview.js';

function fixture(
  scheduledStartsAt: string,
  status: string,
  gameNumber: number,
): TournamentBracketFixture {
  return {
    id: `fixture-${gameNumber}`,
    gameNumber,
    scheduledStartsAt,
    windowEndsAt: null,
    status,
    homeName: 'Первый',
    awayName: 'Второй',
    homeScore: null,
    awayScore: null,
    winnerSide: null,
  };
}

function series(status: string, fixtures: TournamentBracketFixture[]): TournamentBracketSeries {
  return {
    id: 'series-1',
    bracket_position: 1,
    kind: 'championship',
    round_number: 1,
    round_name: 'Финал',
    wins_required: 4,
    higher_seed_wins: 0,
    lower_seed_wins: 0,
    status,
    higher_user_id: 'u1',
    higher_name: 'Первый',
    higher_avatar_url: null,
    higher_seed: 1,
    lower_user_id: 'u2',
    lower_name: 'Второй',
    lower_avatar_url: null,
    lower_seed: 2,
    winner_user_id: null,
    depends_on: null,
    fixtures,
  };
}

describe('playoffSeriesScheduleLabel', () => {
  it('shows the scheduled date range before a series starts', () => {
    expect(
      playoffSeriesScheduleLabel(
        series('scheduled', [
          fixture('2030-09-03T15:00:00.000Z', 'scheduled', 1),
          fixture('2030-09-04T15:00:00.000Z', 'scheduled', 2),
        ]),
        'Europe/Moscow',
        new Date('2030-09-02T12:00:00.000Z'),
      ),
    ).toBe('3–4 сентября');
  });

  it('shows the next local game time while a series is active', () => {
    expect(
      playoffSeriesScheduleLabel(
        series('active', [
          fixture('2030-09-03T14:00:00.000Z', 'settled', 1),
          fixture('2030-09-03T15:00:00.000Z', 'scheduled', 2),
        ]),
        'Europe/Moscow',
        new Date('2030-09-03T14:30:00.000Z'),
      ),
    ).toBe('Следующая: сегодня, 18:00');
  });

  it('shows the last completed game date after a series ends', () => {
    expect(
      playoffSeriesScheduleLabel(
        series('completed', [
          fixture('2030-09-03T15:00:00.000Z', 'settled', 1),
          fixture('2030-09-04T15:00:00.000Z', 'settled', 2),
        ]),
        'Europe/Moscow',
      ),
    ).toBe('Завершена 4 сентября');
  });

  it('keeps a four-stage bracket scrollable and shows the completed champion', () => {
    const rounds = [8, 4, 2, 1].flatMap((seriesCount, roundIndex) =>
      Array.from({ length: seriesCount }, (_, position) => ({
        ...series(roundIndex === 3 ? 'completed' : 'scheduled', []),
        id: `series-${roundIndex + 1}-${position + 1}`,
        bracket_position: position + 1,
        round_number: roundIndex + 1,
        round_name: `Раунд ${roundIndex + 1}`,
        higher_user_id: roundIndex === 3 ? 'u1' : null,
        higher_name: roundIndex === 3 ? 'Первый' : null,
        higher_seed: roundIndex === 3 ? 1 : null,
        winner_user_id: roundIndex === 3 ? 'u1' : null,
        depends_on: { key: `R${roundIndex + 1}S${position + 1}`, sources: [] },
      })),
    );

    render(
      createElement(TournamentPlayoffOverview, {
        series: rounds,
        currentUserId: 'u1',
        timezone: 'Europe/Moscow',
        onOpenSeries: vi.fn(),
      }),
    );

    const overview = screen.getByRole('region', { name: 'Турнирная сетка' });
    expect(overview).toHaveAttribute('data-layout', 'scroll');
    expect(
      [...overview.querySelectorAll('.tournament-bracket-overview__series-list')].map((list) =>
        list.getAttribute('data-series-count'),
      ),
    ).toEqual(['8', '4', '2', '1']);
    expect(overview.querySelector('.tournament-bracket-overview__grid')).toHaveStyle({
      '--playoff-round-count': '4',
    });
    expect(overview.querySelectorAll('.tournament-bracket-connector')).toHaveLength(7);
    const champion = within(overview).getByText('Первый', {
      selector: '.tournament-bracket-champion__player > strong',
    });
    expect(champion).toBeInTheDocument();
    expect(
      within(champion.closest<HTMLElement>('.tournament-bracket-champion')!).getByLabelText(
        'Посев 1',
      ),
    ).toHaveTextContent('1');
  });

  it('centers championship rounds independently and keeps bronze outside the final flow', () => {
    const semifinalOne = {
      ...series('scheduled', []),
      id: 'semifinal-1',
      bracket_position: 1,
      round_name: 'Полуфинал',
      depends_on: { key: 'R1S1', sources: [] },
    };
    const semifinalTwo = {
      ...series('scheduled', []),
      id: 'semifinal-2',
      bracket_position: 2,
      round_name: 'Полуфинал',
      depends_on: { key: 'R1S2', sources: [] },
    };
    const final = {
      ...series('scheduled', []),
      id: 'final',
      round_number: 2,
      round_name: 'Финал',
      depends_on: {
        key: 'R2S1',
        sources: [
          { type: 'winner' as const, seriesKey: 'R1S1' },
          { type: 'winner' as const, seriesKey: 'R1S2' },
        ],
      },
    };
    const bronze = {
      ...series('scheduled', []),
      id: 'bronze',
      kind: 'third_place' as const,
      round_number: 2,
      round_name: 'За 3-е место',
      depends_on: {
        key: 'BRONZE',
        sources: [
          { type: 'loser' as const, seriesKey: 'R1S1' },
          { type: 'loser' as const, seriesKey: 'R1S2' },
        ],
      },
    };

    render(
      createElement(TournamentPlayoffOverview, {
        series: [semifinalOne, semifinalTwo, final, bronze],
        currentUserId: null,
        timezone: 'Europe/Moscow',
        onOpenSeries: vi.fn(),
      }),
    );

    const finalButton = screen.getByRole('button', { name: 'Открыть серию Финал' });
    const overview = screen.getByRole('region', { name: 'Турнирная сетка' });
    const connectors = overview.querySelectorAll<HTMLElement>('.tournament-bracket-connector');
    expect(connectors).toHaveLength(1);
    expect(connectors[0]).toHaveStyle({ top: '25%', height: '50%' });
    const finalList = finalButton.closest('.tournament-bracket-overview__series-list');
    expect(finalList).toHaveAttribute('data-series-count', '1');
    expect(
      within(finalList as HTMLElement).queryByRole('button', { name: 'Открыть серию За 3-е место' }),
    ).not.toBeInTheDocument();

    const bronzeButton = screen.getByRole('button', { name: 'Открыть серию За 3-е место' });
    expect(bronzeButton.closest('.tournament-bracket-overview__bronze-lane')).toHaveStyle({
      gridColumn: '2',
    });
  });
});
