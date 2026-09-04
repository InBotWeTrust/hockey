import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import {
  getTournamentMatchdayResults,
  getTournamentScheduleDay,
  getTournamentScheduleOtherGames,
  getTournamentSchedule,
  dismissTournamentReadinessHint,
  getTournamentReadinessHint,
} from '../../src/tournament/service.js';

describe('tournament public schedule service', () => {
  it('reads and idempotently stores a per-user per-tournament readiness hint dismissal', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ dismissed_at: new Date('2030-09-03T10:00:00.000Z') }] })
      .mockResolvedValueOnce({ rows: [{ dismissed_at: new Date('2030-09-03T10:00:00.000Z') }] });
    const pool = { query } as unknown as Pool;

    await expect(getTournamentReadinessHint(pool, 'tournament-1', 'user-1')).resolves.toEqual({
      dismissed: false,
      dismissedAt: null,
    });
    await expect(
      dismissTournamentReadinessHint(pool, 'tournament-1', 'user-1'),
    ).resolves.toEqual({ dismissed: true, dismissedAt: '2030-09-03T10:00:00.000Z' });
    await expect(
      dismissTournamentReadinessHint(pool, 'tournament-1', 'user-1'),
    ).resolves.toEqual({ dismissed: true, dismissedAt: '2030-09-03T10:00:00.000Z' });
    expect(query.mock.calls[1]?.[0]).toContain('on conflict (tournament_id, user_id)');
  });

  it('returns only the selected date own games and a boolean for hidden other games', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            local_date: '2030-09-02',
            has_games: true,
            has_my_game: true,
            has_playoff: false,
          },
          {
            local_date: '2030-09-03',
            has_games: true,
            has_my_game: false,
            has_playoff: true,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'fixture-mine',
            series_id: 'series-1',
            game_number: 2,
            series_wins_required: 2,
            game_day_id: 'game-day-1',
            game_day_number: 1,
            game_day_local_date: '2030-09-02',
            game_day_starts_at: new Date('2030-09-02T07:00:00.000Z'),
            fixture_number: 4,
            stage: 'regular',
            round_number: 2,
            scheduled_starts_at: new Date('2030-09-02T07:00:00.000Z'),
            window_ends_at: new Date('2030-09-02T08:00:00.000Z'),
            settled_at: null,
            status: 'open',
            venue_mode: 'home_selected',
            home_user_id: 'me',
            home_name: 'Я',
            home_avatar_url: null,
            home_seed: null,
            away_user_id: 'away-user',
            away_name: 'Соперник',
            away_avatar_url: null,
            away_seed: null,
            home_score: 0,
            away_score: 0,
            winner_user_id: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ has_other_games: true }] });

    const result = await getTournamentScheduleDay(
      { query } as unknown as Pool,
      'tournament-1',
      'me',
      '2030-09-02',
    );

    expect(result).toEqual({
      days: [
        { localDate: '2030-09-02', hasGames: true, hasMyGame: true, hasPlayoff: false },
        { localDate: '2030-09-03', hasGames: true, hasMyGame: false, hasPlayoff: true },
      ],
      myGames: [
        expect.objectContaining({
          id: 'fixture-mine',
          fixtureNumber: 4,
          actualStartsAt: null,
          seriesId: 'series-1',
          gameNumber: 2,
          seriesWinsRequired: 2,
          gameDay: {
            id: 'game-day-1',
            dayNumber: 1,
            localDate: '2030-09-02',
            startsAt: '2030-09-02T07:00:00.000Z',
          },
        }),
      ],
      hasOtherGames: true,
    });
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[1]?.[0]).toContain('$3::date');
    expect(query.mock.calls[1]?.[1]).toEqual(['tournament-1', 'me', '2030-09-02']);
    expect(query.mock.calls[1]?.[0]).toContain('in (home_user_id, away_user_id)');
    expect(query.mock.calls[1]?.[0]).toContain('planned_game_day.local_date');
    expect(query.mock.calls[1]?.[0]).toContain('sum(day.max_result_bearing_games)');
    expect(query.mock.calls[2]?.[0]).toContain('not in (home_user_id, away_user_id)');
  });

  it('returns complete selected-date series after the user asks for other games', async () => {
    const rows = Array.from({ length: 6 }, (_, index) => ({
      id: `fixture-${index + 1}`,
      fixture_number: index + 11,
      stage: 'playoff',
      round_number: 1,
      scheduled_starts_at: null,
      window_ends_at: null,
      settled_at: null,
      status: 'scheduled',
      venue_mode: 'neutral_default',
      home_user_id: `home-${index}`,
      home_name: `Хозяин ${index}`,
      home_avatar_url: null,
      home_seed: index + 1,
      away_user_id: `away-${index}`,
      away_name: `Гость ${index}`,
      away_avatar_url: null,
      away_seed: index + 2,
      home_score: 0,
      away_score: 0,
      winner_user_id: null,
    }));
    const query = vi.fn().mockResolvedValue({ rows });

    const first = await getTournamentScheduleOtherGames(
      { query } as unknown as Pool,
      'tournament-1',
      'me',
      '2030-09-03',
      null,
    );

    expect(first.games).toHaveLength(6);
    expect(first.games.map((game) => game.id)).toEqual([
      'fixture-1',
      'fixture-2',
      'fixture-3',
      'fixture-4',
      'fixture-5',
      'fixture-6',
    ]);
    expect(first.nextCursor).toBeNull();
    expect(query).toHaveBeenCalledWith(expect.not.stringContaining('limit 6'), [
      'tournament-1',
      'me',
      '2030-09-03',
    ]);
    expect(query.mock.calls[0]?.[0]).toContain('order by fixture.fixture_number, fixture.id');
    expect(query.mock.calls[0]?.[0]).not.toContain('(fixture.fixture_number, fixture.id) >');
  });

  it('maps playoff and third-place seeds for both players', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          id: 'fixture-1',
          fixture_number: 1,
          stage: 'playoff',
          round_number: 1,
          scheduled_starts_at: null,
          window_ends_at: null,
          status: 'scheduled',
          venue_mode: 'home_selected',
          home_user_id: 'home-user',
          home_name: 'Первый',
          home_avatar_url: null,
          home_seed: 1,
          away_user_id: 'away-user',
          away_name: 'Четвёртый',
          away_avatar_url: null,
          away_seed: 4,
          home_score: 0,
          away_score: 0,
        },
        {
          id: 'fixture-2',
          fixture_number: 2,
          stage: 'third_place',
          round_number: 1,
          scheduled_starts_at: null,
          window_ends_at: null,
          status: 'scheduled',
          venue_mode: 'home_selected',
          home_user_id: 'third-user',
          home_name: 'Второй',
          home_avatar_url: null,
          home_seed: 2,
          away_user_id: 'fourth-user',
          away_name: 'Третий',
          away_avatar_url: null,
          away_seed: 3,
          home_score: 0,
          away_score: 0,
        },
      ],
    });

    const fixtures = await getTournamentSchedule({ query } as unknown as Pool, 'tournament-1');

    expect(fixtures[0]?.home).toMatchObject({ userId: 'home-user', seed: 1 });
    expect(fixtures[0]?.away).toMatchObject({ userId: 'away-user', seed: 4 });
    expect(fixtures[1]?.home).toMatchObject({ userId: 'third-user', seed: 2 });
    expect(fixtures[1]?.away).toMatchObject({ userId: 'fourth-user', seed: 3 });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('home_seed'), ['tournament-1']);
  });

  it('paginates completed matchday results without returning the current player', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          id: 'result-1',
          finalized_at: new Date('2030-09-02T10:00:00.000Z'),
          user_id: 'other-1',
          display_name: 'Второй',
          avatar_url: '/second.webp',
          goals: 20,
          shots: 30,
          accuracy: '0.66667',
        },
        {
          id: 'result-2',
          finalized_at: new Date('2030-09-02T09:00:00.000Z'),
          user_id: 'other-2',
          display_name: 'Третий',
          avatar_url: null,
          goals: 15,
          shots: 30,
          accuracy: '0.50000',
        },
      ],
    });

    const page = await getTournamentMatchdayResults(
      { query } as unknown as Pool,
      'tournament-1',
      2,
      {
        excludeUserId: 'me',
        limit: 1,
        cursor: { finalizedAt: '2030-09-02T11:00:00.000Z', id: 'result-cursor' },
      },
    );

    expect(page).toEqual({
      results: [
        {
          id: 'result-1',
          userId: 'other-1',
          displayName: 'Второй',
          avatarUrl: '/second.webp',
          goals: 20,
          shots: 30,
          accuracy: 0.66667,
        },
      ],
      nextCursor: { finalizedAt: '2030-09-02T10:00:00.000Z', id: 'result-1' },
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('(result.finalized_at, result.id) <'),
      [
        'tournament-1',
        2,
        'me',
        '2030-09-02T11:00:00.000Z',
        'result-cursor',
        2,
      ],
    );
  });
});
