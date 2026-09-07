import type { PoolClient, QueryResult } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import {
  GAMEPLAY_RECOVERY_MS,
  assertGameplayActionAllowed,
  getGameplayLockState,
  lockUserGameplay,
  type GameplayAction,
} from '../../src/duel/gameplayLocks.js';

type ActivityMode = 'training' | 'daily' | 'amateur_duel';

interface Activity {
  mode: ActivityMode;
  createdAt: Date;
  duelSource?: 'challenge' | 'matchmaking' | 'tournament';
}

function at(value: string): Date {
  return new Date(value);
}

function gameplayClient(activities: Activity[]) {
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    const requestedModes = (values?.[1] ?? []) as ActivityMode[];
    const accepted = activities.filter(
      (activity) =>
        requestedModes.includes(activity.mode) &&
        (activity.mode !== 'amateur_duel' || activity.duelSource !== 'tournament'),
    );
    const latest = accepted.reduce<Date | null>(
      (current, activity) =>
        current === null || activity.createdAt > current ? activity.createdAt : current,
      null,
    );
    return { rows: [{ last_activity_at: latest }] } as QueryResult;
  });
  return { client: { query } as unknown as PoolClient, query };
}

describe('action-specific gameplay recovery', () => {
  it.each([
    ['training', undefined],
    ['daily', undefined],
    ['amateur_duel', 'challenge'],
    ['amateur_duel', 'matchmaking'],
  ] as const)(
    'blocks Classic for one hour after accepted %s activity',
    async (mode, duelSource) => {
      const createdAt = at('2026-09-07T23:30:00+03:00');
      const { client } = gameplayClient([{ mode, createdAt, duelSource }]);

      await expect(
        getGameplayLockState(client, {
          userId: 'player-1',
          action: 'start_classic',
          now: at('2026-09-08T00:20:00+03:00'),
        }),
      ).resolves.toEqual({
        blocked: true,
        reason: 'recent_gameplay',
        endsAt: at('2026-09-08T00:30:00+03:00'),
      });
    },
  );

  it('uses the latest accepted activity and unlocks at the exact one-hour boundary', async () => {
    const { client } = gameplayClient([
      { mode: 'training', createdAt: at('2026-09-07T22:30:00+03:00') },
      { mode: 'daily', createdAt: at('2026-09-07T23:20:00+03:00') },
    ]);

    await expect(
      getGameplayLockState(client, {
        userId: 'player-1',
        action: 'start_classic',
        now: at('2026-09-08T00:20:00+03:00'),
      }),
    ).resolves.toEqual({ blocked: false, reason: null, endsAt: null });
  });

  it('excludes tournament duel shots from gameplay recovery', async () => {
    const { client, query } = gameplayClient([
      {
        mode: 'amateur_duel',
        duelSource: 'tournament',
        createdAt: at('2026-09-08T00:10:00+03:00'),
      },
    ]);

    await expect(
      getGameplayLockState(client, {
        userId: 'player-1',
        action: 'start_classic',
        now: at('2026-09-08T00:20:00+03:00'),
      }),
    ).resolves.toEqual({ blocked: false, reason: null, endsAt: null });
    expect(String(query.mock.calls[0]?.[0])).toContain("m.source <> 'tournament'");
  });

  it.each([
    ['training', 'start_training', false],
    ['training', 'start_daily_period', true],
    ['daily', 'start_daily_period', false],
    ['daily', 'start_training', true],
  ] satisfies Array<[ActivityMode, GameplayAction, boolean]>)(
    'keeps %s continuation available while action %s blocked=%s',
    async (mode, action, blocked) => {
      const { client } = gameplayClient([{ mode, createdAt: at('2026-09-08T00:10:00+03:00') }]);

      await expect(
        getGameplayLockState(client, {
          userId: 'player-1',
          action,
          now: at('2026-09-08T00:20:00+03:00'),
        }),
      ).resolves.toMatchObject({ blocked, reason: blocked ? 'recent_gameplay' : null });
    },
  );

  it.each([
    'start_ordinary_duel',
    'ordinary_duel_shot',
    'continue_classic',
  ] satisfies GameplayAction[])('does not apply recovery alone to %s', async (action) => {
    const { client, query } = gameplayClient([
      { mode: 'training', createdAt: at('2026-09-08T00:10:00+03:00') },
    ]);

    await expect(
      getGameplayLockState(client, {
        userId: 'player-1',
        action,
        now: at('2026-09-08T00:20:00+03:00'),
      }),
    ).resolves.toEqual({ blocked: false, reason: null, endsAt: null });
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects a blocked action with the derived lock state', async () => {
    const { client } = gameplayClient([
      { mode: 'daily', createdAt: at('2026-09-08T00:10:00+03:00') },
    ]);

    await expect(
      assertGameplayActionAllowed(client, {
        userId: 'player-1',
        action: 'start_classic',
        now: at('2026-09-08T00:20:00+03:00'),
      }),
    ).rejects.toMatchObject({ code: 'conflict', statusCode: 409 });
  });
});

describe('gameplay serialization', () => {
  it('takes the transaction-scoped advisory lock for one user', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const client = { query } as unknown as PoolClient;

    await lockUserGameplay(client, 'player-1');

    expect(query).toHaveBeenCalledWith(
      "select pg_advisory_xact_lock(hashtext('gameplay:' || $1))",
      ['player-1'],
    );
  });

  it('exports the one-hour recovery duration', () => {
    expect(GAMEPLAY_RECOVERY_MS).toBe(3_600_000);
  });
});
