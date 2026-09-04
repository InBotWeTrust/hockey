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
});

function queryPool(query: ReturnType<typeof vi.fn>): Pool {
  return { query } as unknown as Pool;
}
