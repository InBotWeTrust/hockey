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

export async function duelCapacities(
  client: PoolClient,
  userIds: string[],
  limits: DuelLimitSettings,
  now: Date,
): Promise<Map<string, Record<DuelKind, Capacity>>> {
  const result = new Map<string, Record<DuelKind, Capacity>>();
  if (userIds.length === 0) return result;
  const windows = limitWindows(now);
  const { rows } = await client.query<{
    user_id: string; daily: number; weekly: number; monthly: number;
    express: number; express_plus: number; classic: number;
  }>(
    `select user_id,
       count(*) filter (where accepted_at >= $2)::int as daily,
       count(*) filter (where accepted_at >= $3)::int as weekly,
       count(*) filter (where accepted_at >= $4)::int as monthly,
       count(*) filter (where accepted_at >= $4 and duel_kind = 'express')::int as express,
       count(*) filter (where accepted_at >= $4 and duel_kind = 'express_plus')::int as express_plus,
       count(*) filter (where accepted_at >= $4 and duel_kind = 'classic')::int as classic
       from amateur_duel_limit_reservation
      where user_id = any($1::uuid[]) and released_at is null
      group by user_id`,
    [userIds, windows.dayStart, windows.weekStart, windows.monthStart],
  );
  const counts = new Map(rows.map((row) => [row.user_id, row]));
  for (const userId of userIds) {
    const row = counts.get(userId);
    const daily = row?.daily ?? 0;
    const weekly = row?.weekly ?? 0;
    const monthly = row?.monthly ?? 0;
    const formats = {} as Record<DuelKind, Capacity>;
    for (const kind of ['express', 'express_plus', 'classic'] as const) {
      const remaining = [
        { reason: 'daily' as const, count: limits.daily - daily, retryAt: windows.nextDay },
        { reason: 'weekly' as const, count: limits.weekly - weekly, retryAt: windows.nextWeek },
        { reason: 'monthly' as const, count: limits.monthly - monthly, retryAt: windows.nextMonth },
        { reason: 'format' as const, count: limits.perFormatMonthly - (row?.[kind] ?? 0), retryAt: windows.nextMonth },
      ];
      const blocking = remaining.find((item) => item.count <= 0);
      formats[kind] = {
        available: Math.max(0, Math.min(...remaining.map((item) => item.count))),
        reason: blocking?.reason ?? null,
        retryAt: blocking?.retryAt ?? null,
      };
    }
    result.set(userId, formats);
  }
  return result;
}

export async function duelCapacity(
  client: PoolClient,
  userId: string,
  kind: DuelKind,
  limits: DuelLimitSettings,
  now: Date,
): Promise<Capacity> {
  return (await duelCapacities(client, [userId], limits, now)).get(userId)![kind];
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
