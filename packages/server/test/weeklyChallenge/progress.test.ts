import { describe, expect, it } from 'vitest';
import type { PoolClient, QueryResult } from 'pg';
import {
  EMPTY_WEEKLY_CHALLENGE_PROGRESS,
  fetchWeeklyChallengeProgress,
  isTaskCompleted,
} from '../../src/weeklyChallenge/progress.js';

describe('weekly challenge progress helpers', () => {
  it('marks a task complete only when progress reaches the target', () => {
    expect(
      isTaskCompleted(
        { type: 'goals_scored', target: 500 },
        { ...EMPTY_WEEKLY_CHALLENGE_PROGRESS, goals_scored: 499 },
      ),
    ).toBe(false);
    expect(
      isTaskCompleted(
        { type: 'goals_scored', target: 500 },
        { ...EMPTY_WEEKLY_CHALLENGE_PROGRESS, goals_scored: 500 },
      ),
    ).toBe(true);
  });

  it('reads all counters without overlapping queries on a transaction client', async () => {
    let queryActive = false;
    let queryCount = 0;
    const client = {
      query: async (sql: string): Promise<QueryResult> => {
        if (queryActive) throw new Error('transaction client received overlapping queries');
        queryActive = true;
        queryCount += 1;
        await Promise.resolve();
        try {
          if (
            sql.includes('shot_session') &&
            sql.includes('amateur_duel_participant') &&
            sql.includes('amateur_duel_match') &&
            sql.includes('training_session')
          ) {
            return {
              rows: [{ goals: '18', played: '7', won: '4', invites: '3', completed: '2' }],
              command: 'SELECT',
              rowCount: 1,
              oid: 0,
              fields: [],
            };
          }

          return { rows: [], command: 'SELECT', rowCount: 0, oid: 0, fields: [] };
        } finally {
          queryActive = false;
        }
      },
    } as unknown as PoolClient;

    await expect(
      fetchWeeklyChallengeProgress(client, {
        userId: '00000000-0000-4000-8000-000000000001',
        from: new Date('2026-08-24T00:00:00.000Z'),
        to: new Date('2026-08-31T00:00:00.000Z'),
      }),
    ).resolves.toEqual({
      goals_scored: 18,
      duels_played: 7,
      duels_won: 4,
      duel_invites_sent: 3,
      trainings_completed: 2,
    });
    expect(queryCount).toBe(1);
  });
});
