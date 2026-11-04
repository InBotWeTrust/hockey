import { expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { drainDuelShotProgress } from '../../../src/duel/amateur/shotProgress.js';
import { grantStatAchievements, observeCareerGoal } from '../../../src/achievements/service.js';
import { openFirstAchievementStages } from '../../../src/achievements/stageProgress.js';
vi.mock('../../../src/achievements/service.js', () => ({
  grantStatAchievements: vi.fn(),
  observeCareerGoal: vi.fn(),
  observeCareerActivityStreak: vi.fn(),
}));
vi.mock('../../../src/achievements/stageProgress.js', () => ({
  openFirstAchievementStages: vi.fn(),
}));
vi.mock('../../../src/referrals/service.js', () => ({ reconcileReferralQualification: vi.fn() }));

it('coalesces accumulated shots without losing the last goal before a miss', async () => {
  const jobs = [1, 2, 3].map((n) => ({
    event_key: `shot-${n}`,
    user_id: 'player',
    occurred_at: new Date(n * 1000),
    payload: { lifetimeShots: n, lifetimeGoals: Math.min(2, n), level: 2, goal: n < 3 },
  }));
  const query = vi.fn(async (sql: string, _args?: unknown[]) => {
    if (sql.includes('select job.*')) return { rows: [jobs[0]], rowCount: 1 };
    if (sql.includes('from duel_shot_progress') && sql.includes('user_id=$1'))
      return { rows: jobs, rowCount: 3 };
    if (sql.includes('pg_try_advisory')) return { rows: [{ locked: true }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
  const client = { query, release: vi.fn() };
  expect(await drainDuelShotProgress({ connect: async () => client } as unknown as Pool)).toBe(
    true,
  );
  expect(grantStatAchievements).toHaveBeenCalledTimes(1);
  expect(grantStatAchievements).toHaveBeenCalledWith(
    client,
    'player',
    expect.objectContaining({ lifetimeShots: 3, lifetimeGoals: 2 }),
  );
  expect(observeCareerGoal).toHaveBeenCalledWith(
    client,
    'player',
    expect.objectContaining({ eventKey: 'shot-2', lifetimeTotal: 2 }),
  );
  expect(openFirstAchievementStages).toHaveBeenCalledWith(client, 'player', jobs[0]!.occurred_at);
  expect(
    query.mock.calls.some(
      ([sql, args]) =>
        sql.startsWith('delete from duel_shot_progress') &&
        JSON.stringify(args) === '[["shot-1","shot-2","shot-3"]]',
    ),
  ).toBe(true);
});
