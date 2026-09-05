import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { listActiveClassicGames } from '../../src/tournament/classicGame.js';

describe('active tournament game board', () => {
  it('shows a playoff game from midnight in the tournament timezone', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });

    await listActiveClassicGames(queryPool(query), {
      userId: 'player-1',
      now: new Date('2030-09-04T21:05:00.000Z'),
    });

    const playoffQuery = String(query.mock.calls[1]?.[0]);
    expect(playoffQuery).toContain('round_game_day.local_date,');
    expect(playoffQuery).toMatch(/<= \(\$2::timestamptz\s+at time zone/);
    expect(playoffQuery).not.toContain("$2::timestamptz + interval '30 minutes'");
  });

  it('returns the snapshotted period count for a playoff game', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            tournament_id: 'tournament-1',
            fixture_id: 'fixture-1',
            duel_match_id: null,
            tournament_title: 'Кубок микса',
            tournament_day: 2,
            round_stage: 'playoff',
            round_number: 2,
            final_round_number: 2,
            scheduled_starts_at: new Date('2030-09-05T10:00:00.000Z'),
            readiness_expires_at: new Date('2030-09-05T10:05:00.000Z'),
            hard_deadline_at: new Date('2030-09-05T11:00:00.000Z'),
            attempt_status: 'pending',
            attempt_number: 1,
            total_periods: 2,
          },
        ],
      });

    const games = await listActiveClassicGames(queryPool(query), {
      userId: 'player-1',
      now: new Date('2030-09-05T00:00:00.000Z'),
    });

    expect(games).toEqual([
      expect.objectContaining({ kind: 'playoff', fixture_id: 'fixture-1', total_periods: 2 }),
    ]);
  });
});

function queryPool(query: ReturnType<typeof vi.fn>): Pool {
  return { query } as unknown as Pool;
}
