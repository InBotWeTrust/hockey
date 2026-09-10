import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { assertFullAmateurAccess, resolveAmateurAccess } from '../../src/profile/amateurAccess.js';

interface UserRow {
  level: number | string;
  lifetime_goals_total: number | string;
}

function accessDb(user: UserRow | undefined, unlockGoalsRequired = 300) {
  const query = vi.fn(async (sql: unknown) => {
    const statement = String(sql);
    if (statement.includes('from users')) return { rows: user ? [user] : [] };
    if (statement.includes('from game_settings')) {
      return {
        rows: [
          {
            key: 'amateur.unlock_goals_required',
            value: unlockGoalsRequired,
            updated_at: null,
            updated_by: null,
          },
        ],
      };
    }
    throw new Error(`Unexpected query: ${statement}`);
  });
  return { db: { query } as unknown as Pool, query };
}

describe('Amateur access', () => {
  it('returns remaining qualifying goals for a beginner below the configured threshold', async () => {
    const { db, query } = accessDb({ level: '1', lifetime_goals_total: '116' });

    await expect(resolveAmateurAccess(db, 'beginner-id')).resolves.toEqual({
      competitionLevel: 'beginner',
      unlockGoalsRequired: 300,
      qualifyingGoals: 116,
      goalsRemaining: 184,
      hasFullAccess: false,
    });
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls.filter(([sql]) => String(sql).includes('from users'))).toHaveLength(1);
  });

  it('grants full access at the exact configured goal threshold', async () => {
    const { db } = accessDb({ level: 1, lifetime_goals_total: 300 });

    await expect(assertFullAmateurAccess(db, 'threshold-id')).resolves.toEqual({
      competitionLevel: 'amateur',
      unlockGoalsRequired: 300,
      qualifyingGoals: 300,
      goalsRemaining: 0,
      hasFullAccess: true,
    });
  });

  it('keeps a level-2 player eligible below the goal threshold', async () => {
    const { db } = accessDb({ level: 2, lifetime_goals_total: 40 });

    await expect(resolveAmateurAccess(db, 'level-two-id')).resolves.toEqual({
      competitionLevel: 'amateur',
      unlockGoalsRequired: 300,
      qualifyingGoals: 40,
      goalsRemaining: 260,
      hasFullAccess: true,
    });
  });

  it('keeps a professional eligible and clamps excess progress to zero remaining goals', async () => {
    const { db } = accessDb({ level: '3', lifetime_goals_total: '450' });

    await expect(assertFullAmateurAccess(db, 'professional-id')).resolves.toEqual({
      competitionLevel: 'professional',
      unlockGoalsRequired: 300,
      qualifyingGoals: 450,
      goalsRemaining: 0,
      hasFullAccess: true,
    });
  });

  it('throws not_found when the user does not exist', async () => {
    const { db } = accessDb(undefined);

    await expect(resolveAmateurAccess(db, 'missing-id')).rejects.toMatchObject({
      code: 'not_found',
      statusCode: 404,
    });
  });

  it('returns stable public progress details when full Amateur access is required', async () => {
    const { db } = accessDb({ level: 1, lifetime_goals_total: 116 });

    await expect(assertFullAmateurAccess(db, 'beginner-id')).rejects.toMatchObject({
      code: 'amateur_level_required',
      statusCode: 403,
      details: { goalsRemaining: 184, unlockGoalsRequired: 300 },
    });
  });
});
