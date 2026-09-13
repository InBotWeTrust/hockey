import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

export const REMOVABLE_ACHIEVEMENT_IDS = ['steady-tempo', 'economical-master'] as const;
export type RemovableAchievementId = (typeof REMOVABLE_ACHIEVEMENT_IDS)[number];

export interface RemovedAchievementUserAudit {
  userId: string;
  achievementId: RemovableAchievementId;
  userAchievementClaimedAt: string;
  currencyLedgerIds: string[];
  tokenLedgerIds: string[];
  deltas: { currency: number; stars: number; experience: number; tokens: number };
  balances: { currency: number; stars: number; experience: number; tokens: number };
  canApply: boolean;
}

export interface RemovedAchievementAudit {
  generatedAt: string;
  achievementId: RemovableAchievementId;
  users: RemovedAchievementUserAudit[];
  totals: { users: number; currency: number; stars: number; experience: number; tokens: number };
  blockedUserIds: string[];
  hash: string;
}

interface AuditRow {
  user_id: string;
  claimed_at: Date;
  currency_balance: number | string;
  stars: number | string;
  experience: number | string;
  token_balance: number | string;
  currency_ledger_ids: string[] | null;
  currency_delta: number | string;
  stars_delta: number | string;
  experience_delta: number | string;
  token_ledger_ids: string[] | null;
  token_delta: number | string;
}

function hashPayload(value: Omit<RemovedAchievementAudit, 'hash' | 'generatedAt'>): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function assertRemovableAchievementId(value: string): RemovableAchievementId {
  if (!REMOVABLE_ACHIEVEMENT_IDS.includes(value as RemovableAchievementId)) {
    throw new Error(`unsupported achievement: ${value}`);
  }
  return value as RemovableAchievementId;
}

async function readRows(
  db: Pool | PoolClient,
  achievementId: RemovableAchievementId,
  exactUserIds?: readonly string[],
  lock = false,
): Promise<AuditRow[]> {
  const userFilter = exactUserIds === undefined ? '' : 'and ua.user_id = any($2::uuid[])';
  const params: unknown[] = [achievementId];
  if (exactUserIds !== undefined) params.push(exactUserIds);
  const { rows } = await db.query<AuditRow>(
    `select ua.user_id,
            ua.claimed_at,
            account.balance as currency_balance,
            users.stars,
            users.experience,
            coalesce(token_account.balance, 0) as token_balance,
            currency_rows.ids as currency_ledger_ids,
            coalesce(currency_rows.currency_delta, 0) as currency_delta,
            coalesce(currency_rows.stars_delta, 0) as stars_delta,
            coalesce(currency_rows.experience_delta, 0) as experience_delta,
            token_rows.ids as token_ledger_ids,
            coalesce(token_rows.token_delta, 0) as token_delta
       from user_achievements ua
       join users on users.id = ua.user_id
       join user_currency_account account on account.user_id = ua.user_id
       left join user_reward_token_account token_account on token_account.user_id = ua.user_id
       left join lateral (
         select array_agg(ledger.id order by ledger.id) as ids,
                sum(ledger.available_delta)::bigint as currency_delta,
                sum(coalesce((ledger.metadata->>'stars')::bigint, 0))::bigint as stars_delta,
                sum(coalesce((ledger.metadata->>'experience')::bigint, 0))::bigint as experience_delta
           from currency_ledger ledger
          where ledger.user_id = ua.user_id
            and ledger.reason = 'achievement_reward'
            and ledger.metadata->>'achievement_id' = ua.achievement_id
            and ledger.metadata->>'stage_number' is null
       ) currency_rows on true
       left join lateral (
         select array_agg(ledger.id order by ledger.id) as ids,
                sum(ledger.amount)::bigint as token_delta
           from achievement_token_ledger ledger
          where ledger.user_id = ua.user_id
            and ledger.achievement_id = ua.achievement_id
            and ledger.stage_number is null
       ) token_rows on true
      where ua.achievement_id = $1
        and ua.claimed_at is not null
        ${userFilter}
      order by ua.user_id
      ${lock ? 'for update of ua, users, account' : ''}`,
    params,
  );
  return rows;
}

function buildAudit(
  achievementId: RemovableAchievementId,
  rows: AuditRow[],
  generatedAt: Date,
): RemovedAchievementAudit {
  const users = rows.map<RemovedAchievementUserAudit>((row) => {
    const deltas = {
      currency: Number(row.currency_delta),
      stars: Number(row.stars_delta),
      experience: Number(row.experience_delta),
      tokens: Number(row.token_delta),
    };
    const balances = {
      currency: Number(row.currency_balance),
      stars: Number(row.stars),
      experience: Number(row.experience),
      tokens: Number(row.token_balance),
    };
    return {
      userId: row.user_id,
      achievementId,
      userAchievementClaimedAt: row.claimed_at.toISOString(),
      currencyLedgerIds: row.currency_ledger_ids ?? [],
      tokenLedgerIds: row.token_ledger_ids ?? [],
      deltas,
      balances,
      canApply:
        balances.currency >= deltas.currency &&
        balances.stars >= deltas.stars &&
        balances.experience >= deltas.experience &&
        balances.tokens >= deltas.tokens,
    };
  });
  const payload = {
    achievementId,
    users,
    totals: {
      users: users.length,
      currency: users.reduce((sum, user) => sum + user.deltas.currency, 0),
      stars: users.reduce((sum, user) => sum + user.deltas.stars, 0),
      experience: users.reduce((sum, user) => sum + user.deltas.experience, 0),
      tokens: users.reduce((sum, user) => sum + user.deltas.tokens, 0),
    },
    blockedUserIds: users.filter((user) => !user.canApply).map((user) => user.userId),
  };
  return { generatedAt: generatedAt.toISOString(), ...payload, hash: hashPayload(payload) };
}

export async function auditRemovedAchievement(
  db: Pool | PoolClient,
  achievementId: RemovableAchievementId,
  now = new Date(),
): Promise<RemovedAchievementAudit> {
  return buildAudit(achievementId, await readRows(db, achievementId), now);
}

export async function applyRemovedAchievementReconciliation(
  pool: Pool,
  input: {
    achievementId: RemovableAchievementId;
    exactUserIds: readonly string[];
    expectedHash: string;
    backupMarker: string;
    now?: Date;
  },
): Promise<RemovedAchievementAudit> {
  if (input.exactUserIds.length === 0) throw new Error('exact user ids are required');
  if (input.backupMarker.trim().length < 8) throw new Error('backup marker is required');
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(
      `select user_id from user_reward_token_account where user_id = any($1::uuid[]) for update`,
      [input.exactUserIds],
    );
    const rows = await readRows(client, input.achievementId, input.exactUserIds, true);
    const audit = buildAudit(input.achievementId, rows, input.now ?? new Date());
    const actualIds = audit.users.map((user) => user.userId).sort();
    const expectedIds = [...new Set(input.exactUserIds)].sort();
    if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds))
      throw new Error('user set changed');
    if (audit.hash !== input.expectedHash) throw new Error('audit hash changed');
    if (audit.blockedUserIds.length > 0) throw new Error('insufficient balance');

    for (const user of audit.users) {
      await client.query(
        `update user_currency_account set balance = balance - $2, updated_at = $3 where user_id = $1`,
        [user.userId, user.deltas.currency, input.now ?? new Date()],
      );
      await client.query(
        `update users set stars = stars - $2, experience = experience - $3 where id = $1`,
        [user.userId, user.deltas.stars, user.deltas.experience],
      );
      if (user.deltas.tokens > 0) {
        await client.query(
          `update user_reward_token_account set balance = balance - $2, updated_at = $3 where user_id = $1`,
          [user.userId, user.deltas.tokens, input.now ?? new Date()],
        );
      }
      await client.query(`delete from currency_ledger where id = any($1::bigint[])`, [
        user.currencyLedgerIds,
      ]);
      await client.query(`delete from achievement_token_ledger where id = any($1::uuid[])`, [
        user.tokenLedgerIds,
      ]);
      await client.query(
        `delete from user_achievements where user_id = $1 and achievement_id = $2`,
        [user.userId, input.achievementId],
      );
      await client.query(
        `insert into event_log (user_id, type, payload)
         values ($1, 'removed_achievement_reconciled', $2::jsonb)`,
        [
          user.userId,
          JSON.stringify({
            achievement_id: input.achievementId,
            deltas: user.deltas,
            audit_hash: audit.hash,
            backup_marker: input.backupMarker,
          }),
        ],
      );
    }
    await client.query('commit');
    return audit;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
