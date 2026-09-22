import type { PoolClient } from 'pg';
import { AppError } from '../../plugins/errors.js';
import type { DuelLimitSettings } from './limitRules.js';
import { limitWindows } from './limitRules.js';

type DuelKind = 'express' | 'express_plus' | 'classic';

interface Capacity {
  available: number;
  reason: 'daily' | 'weekly' | 'monthly' | 'format' | null;
  retryAt: Date | null;
}

export async function duelCapacity(
  client: PoolClient,
  userId: string,
  kind: DuelKind,
  limits: DuelLimitSettings,
  now: Date,
): Promise<Capacity> {
  const windows = limitWindows(now);
  const { rows } = await client.query<{
    daily: number;
    weekly: number;
    monthly: number;
    per_format_monthly: number;
  }>(
    `select
       count(*) filter (where accepted_at >= $2)::int as daily,
       count(*) filter (where accepted_at >= $3)::int as weekly,
       count(*) filter (where accepted_at >= $4)::int as monthly,
       count(*) filter (where accepted_at >= $4 and duel_kind = $5)::int as per_format_monthly
       from amateur_duel_limit_reservation
      where user_id = $1 and released_at is null`,
    [userId, windows.dayStart, windows.weekStart, windows.monthStart, kind],
  );
  const counts = rows[0]!;
  const remaining = [
    { reason: 'daily' as const, count: limits.daily - counts.daily, retryAt: windows.nextDay },
    { reason: 'weekly' as const, count: limits.weekly - counts.weekly, retryAt: windows.nextWeek },
    { reason: 'monthly' as const, count: limits.monthly - counts.monthly, retryAt: windows.nextMonth },
    { reason: 'format' as const, count: limits.perFormatMonthly - counts.per_format_monthly, retryAt: windows.nextMonth },
  ];
  const blocking = remaining.find((item) => item.count <= 0);
  return {
    available: Math.max(0, Math.min(...remaining.map((item) => item.count))),
    reason: blocking?.reason ?? null,
    retryAt: blocking?.retryAt ?? null,
  };
}

export async function assertDuelCapacity(
  client: PoolClient,
  userIds: [string, string],
  kind: DuelKind,
  limits: DuelLimitSettings,
  now: Date,
): Promise<void> {
  for (const userId of userIds) {
    const capacity = await duelCapacity(client, userId, kind, limits, now);
    if (capacity.reason) {
      throw new AppError('conflict', 'duel limit reached', 409, {
        duelLimit: { reason: capacity.reason, retryAt: capacity.retryAt?.toISOString() },
      });
    }
  }
}

export async function reserveDuelCapacity(
  client: PoolClient,
  matchId: string,
  userIds: [string, string],
  kind: DuelKind,
  limits: DuelLimitSettings,
  now: Date,
): Promise<void> {
  await assertDuelCapacity(client, userIds, kind, limits, now);
  await client.query(
    `insert into amateur_duel_limit_reservation (match_id, user_id, duel_kind, accepted_at)
     values ($1, $2, $4, $5), ($1, $3, $4, $5)`,
    [matchId, userIds[0], userIds[1], kind, now],
  );
}

export async function assertOutgoingInviteCapacity(
  client: PoolClient,
  userId: string,
  kind: DuelKind,
  limits: DuelLimitSettings,
  now: Date,
): Promise<void> {
  const capacity = await duelCapacity(client, userId, kind, limits, now);
  if (capacity.reason) {
    throw new AppError('conflict', 'duel limit reached', 409, {
      duelLimit: { reason: capacity.reason, retryAt: capacity.retryAt?.toISOString() },
    });
  }
  const { rows } = await client.query<{ total: number }>(
    `select count(*)::int as total from amateur_duel_match
      where source = 'challenge' and status = 'invited' and challenger_user_id = $1`,
    [userId],
  );
  if (rows[0]!.total >= Math.min(limits.outgoingInvites, capacity.available)) {
    throw new AppError('conflict', 'outgoing duel invitation limit reached', 409, {
      duelLimit: { reason: 'outgoing' },
    });
  }
}
