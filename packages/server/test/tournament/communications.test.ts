import type { Pool, PoolClient } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  dispatchTournamentCommunication,
  formatTournamentNotificationDateTime,
  playoffDayStartingEventPhrase,
  previewTournamentAudience,
} from '../../src/tournament/communications.js';

const DISPATCH_INPUT = {
  tournamentId: '00000000-0000-4000-8000-000000000901',
  idempotencyKey: 'stalled-dispatch-boundary',
  kind: 'official_news',
  audience: 'approved',
  title: 'Занятая отправка',
  body: 'Повторите отправку позже.',
  createdBy: '00000000-0000-4000-8000-000000000902',
  systemUserId: '00000000-0000-4000-8000-000000000903',
} as const;

function observeDispatch(pool: Pool) {
  return dispatchTournamentCommunication(
    pool,
    { publish: async () => undefined },
    DISPATCH_INPUT,
  ).then(
    () => ({ kind: 'resolved' as const }),
    (error: unknown) => ({ kind: 'rejected' as const, error }),
  );
}

function exceedsBoundAfter(milliseconds: number): Promise<{ kind: 'exceeded' }> {
  return new Promise((resolve) => {
    setTimeout(() => resolve({ kind: 'exceeded' }), milliseconds);
  });
}

function expectLockTimeout(outcome: { kind: string; error?: unknown }): void {
  expect(outcome).toMatchObject({
    kind: 'rejected',
    error: {
      code: 'service_unavailable',
      statusCode: 503,
      message: 'tournament dispatch lock acquisition timed out',
    },
  });
}

describe('tournament communication lock acquisition', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('releases a pool client that connects after the total deadline', async () => {
    vi.useFakeTimers();
    let resolveConnect: ((client: PoolClient) => void) | undefined;
    const pendingConnect = new Promise<PoolClient>((resolve) => {
      resolveConnect = resolve;
    });
    const client = {
      query: vi.fn().mockRejectedValue(new Error('cleanup after late connect')),
      release: vi.fn(),
    } as unknown as PoolClient;
    const pool = {
      connect: vi.fn(() => pendingConnect),
    } as unknown as Pool;
    const dispatchOutcome = observeDispatch(pool);
    const boundedOutcome = Promise.race([dispatchOutcome, exceedsBoundAfter(1_500)]);

    await vi.advanceTimersByTimeAsync(1_500);
    const outcome = await boundedOutcome;
    resolveConnect!(client);
    await vi.advanceTimersByTimeAsync(0);
    await dispatchOutcome;

    expectLockTimeout(outcome);
    expect(client.query).not.toHaveBeenCalled();
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('destroys a client when the try-lock query exceeds the total deadline', async () => {
    vi.useFakeTimers();
    let resolveTryLock: ((result: { rows: Array<{ acquired: boolean }> }) => void) | undefined;
    const pendingTryLock = new Promise<{ rows: Array<{ acquired: boolean }> }>((resolve) => {
      resolveTryLock = resolve;
    });
    const client = {
      query: vi
        .fn()
        .mockImplementationOnce(() => pendingTryLock)
        .mockRejectedValue(new Error('cleanup after late try-lock')),
      release: vi.fn(),
    } as unknown as PoolClient;
    const pool = {
      connect: vi.fn().mockResolvedValue(client),
    } as unknown as Pool;
    const dispatchOutcome = observeDispatch(pool);
    const boundedOutcome = Promise.race([dispatchOutcome, exceedsBoundAfter(1_500)]);

    await vi.advanceTimersByTimeAsync(1_500);
    const outcome = await boundedOutcome;
    resolveTryLock!({ rows: [{ acquired: true }] });
    await vi.advanceTimersByTimeAsync(0);
    await dispatchOutcome;

    expectLockTimeout(outcome);
    expect(client.query).toHaveBeenCalledTimes(1);
    expect(client.release).toHaveBeenCalledTimes(1);
    expect(client.release).toHaveBeenCalledWith(true);
  });
});

describe('tournament communication audiences', () => {
  it('selects every unblocked player account without requiring a tournament application', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ user_id: 'player-1', display_name: 'Игрок', state: 'player' }],
    });
    const pool = { query } as unknown as Pool;

    await expect(previewTournamentAudience(pool, 'tournament-1', 'all_players')).resolves.toEqual({
      count: 1,
      recipients: [{ user_id: 'player-1', display_name: 'Игрок', state: 'player' }],
    });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("u.account_kind = 'player'"), []);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('u.blocked_at is null'), []);
  });
});

describe('tournament notification date formatting', () => {
  it('renders a playoff start as a readable local date instead of an ISO timestamp', () => {
    const formatted = formatTournamentNotificationDateTime(
      new Date('2026-09-03T21:30:37.664Z'),
      'Europe/Moscow',
    );

    expect(formatted).toBe('4 сентября в 00:30');
    expect(formatted).not.toContain('2026-09-03T');
  });

  it('falls back to UTC when a legacy tournament contains an invalid timezone', () => {
    expect(
      formatTournamentNotificationDateTime(
        new Date('2026-09-03T21:30:37.664Z'),
        'invalid-timezone',
      ),
    ).toBe('3 сентября в 21:30');
  });
});

describe('playoff day starting notification copy', () => {
  it('calls a best-of-one fixture a game', () => {
    expect(playoffDayStartingEventPhrase(1, false)).toBe('игра');
    expect(playoffDayStartingEventPhrase(1, true)).toBe('новая игра');
  });

  it('calls a multi-win fixture a series of games', () => {
    expect(playoffDayStartingEventPhrase(2, false)).toBe('серия игр');
    expect(playoffDayStartingEventPhrase(4, true)).toBe('новая серия игр');
  });
});
