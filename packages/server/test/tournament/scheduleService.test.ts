import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import {
  getTournamentMatchdayResults,
  getTournamentSchedule,
} from '../../src/tournament/service.js';

describe('tournament public schedule service', () => {
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
