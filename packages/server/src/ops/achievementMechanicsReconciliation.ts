import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

export type AchievementMechanicsReconciliationMode = 'audit' | 'dry-run' | 'apply';

const RESET_STAGE_IDS = [
  'keeping-fit',
  'stable-student',
  'training-before-battle',
  'dangerous-host',
  'dangerous-guest',
  'hunter-streak',
] as const;

interface AuditRow {
  user_id: string;
  currency_balance: number | string;
  reserved_balance: number | string;
  stars: number | string;
  experience: number | string;
  token_balance: number | string;
  token_awarded: number | string;
  invalid_currency: number | string;
  invalid_stars: number | string;
  invalid_experience: number | string;
  invalid_tokens: number | string;
  removed_stages: Array<{ achievementId: string; stageNumber: number }> | null;
  already_adjusted: boolean;
}

export interface AchievementMechanicsUserCorrection {
  userId: string;
  removeStages: Array<{ achievementId: string; stageNumber: number }>;
  deductions: { currency: number; stars: number; experience: number; tokens: number };
  balancesBefore: { currency: number; reservedCurrency: number; stars: number; experience: number; tokens: number };
  balancesAfter: { currency: number; reservedCurrency: number; stars: number; experience: number; tokens: number };
}

export interface AchievementMechanicsReconciliationReport {
  mode: AchievementMechanicsReconciliationMode;
  runId: string;
  backupMarker: string | null;
  auditHash: string;
  users: AchievementMechanicsUserCorrection[];
  totals: { users: number; removedStages: number; currency: number; stars: number; experience: number; tokens: number };
  applied: boolean;
}

function amount(value: number | string): number {
  return Number(value);
}

async function readAuditRows(client: PoolClient, runId: string, lock: boolean): Promise<AuditRow[]> {
  const lockSql = lock ? 'for update of users' : '';
  const { rows } = await client.query<AuditRow>(
    `select users.id as user_id,
            coalesce(currency_account.balance, 0) as currency_balance,
            coalesce(currency_account.reserved_balance, 0) as reserved_balance,
            users.xp as stars,
            users.experience,
            coalesce(token_account.balance, 0) as token_balance,
            greatest(0, coalesce(tokens.awarded, 0) - coalesce(previous.tokens_award_reconciled, 0)) as token_awarded,
            coalesce(invalid.currency, 0) as invalid_currency,
            coalesce(invalid.stars, 0) as invalid_stars,
            coalesce(invalid.experience, 0) as invalid_experience,
            coalesce(invalid.tokens, 0) as invalid_tokens,
            invalid.stages as removed_stages,
            (adjustment.user_id is not null) as already_adjusted
       from users
       left join user_currency_account currency_account on currency_account.user_id = users.id
       left join user_reward_token_account token_account on token_account.user_id = users.id
       left join lateral (
         select sum(ledger.amount)::bigint as awarded
           from achievement_token_ledger ledger
          where ledger.user_id = users.id
       ) tokens on true
       left join lateral (
         select sum(correction.tokens_award_reconciled)::bigint as tokens_award_reconciled
           from achievement_mechanics_reconciliation_adjustment correction
          where correction.user_id = users.id
       ) previous on true
       left join lateral (
         select sum(coalesce((stage.reward_snapshot->>'currency')::int, 0))::bigint as currency,
                sum(coalesce((stage.reward_snapshot->>'stars')::int, 0))::bigint as stars,
                sum(coalesce((stage.reward_snapshot->>'experience')::int, 0))::bigint as experience,
                sum(coalesce((stage.reward_snapshot->>'tokens')::int, 0))::bigint as tokens,
                jsonb_agg(jsonb_build_object(
                  'achievementId', stage.achievement_id,
                  'stageNumber', stage.stage_number
                ) order by stage.achievement_id, stage.stage_number) as stages
           from user_achievement_stages stage
          where stage.user_id = users.id
            and stage.achievement_id = any($2::text[])
            and stage.stage_number > 1
            and (stage.completed_at is not null or stage.claimed_at is not null)
       ) invalid on true
       left join achievement_mechanics_reconciliation_adjustment adjustment
         on adjustment.run_id = $1 and adjustment.user_id = users.id
      where greatest(0, coalesce(tokens.awarded, 0) - coalesce(previous.tokens_award_reconciled, 0)) > 0
         or invalid.stages is not null
      order by users.id
      ${lockSql}`,
    [runId, RESET_STAGE_IDS],
  );
  return rows;
}

function buildUsers(rows: AuditRow[]): AchievementMechanicsUserCorrection[] {
  return rows.filter((row) => !row.already_adjusted).map((row) => {
    const before = {
      currency: amount(row.currency_balance),
      reservedCurrency: amount(row.reserved_balance),
      stars: amount(row.stars),
      experience: amount(row.experience),
      tokens: amount(row.token_balance),
    };
    const deductions = {
      currency: Math.min(before.currency, amount(row.invalid_currency)),
      stars: Math.min(before.stars, amount(row.invalid_stars)),
      experience: Math.min(before.experience, amount(row.invalid_experience)),
      tokens: Math.min(before.tokens, amount(row.token_awarded)),
    };
    return {
      userId: row.user_id,
      removeStages: row.removed_stages ?? [],
      deductions,
      balancesBefore: before,
      balancesAfter: {
        currency: before.currency - deductions.currency,
        reservedCurrency: before.reservedCurrency,
        stars: before.stars - deductions.stars,
        experience: before.experience - deductions.experience,
        tokens: before.tokens - deductions.tokens,
      },
    };
  });
}

function buildReport(
  mode: AchievementMechanicsReconciliationMode,
  runId: string,
  backupMarker: string | null,
  users: AchievementMechanicsUserCorrection[],
): AchievementMechanicsReconciliationReport {
  const canonical = users.map((user) => ({
    userId: user.userId,
    removeStages: user.removeStages,
    deductions: user.deductions,
    balancesBefore: user.balancesBefore,
    balancesAfter: user.balancesAfter,
  }));
  const auditHash = createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
  return {
    mode,
    runId,
    backupMarker,
    auditHash,
    users,
    totals: {
      users: users.length,
      removedStages: users.reduce((sum, user) => sum + user.removeStages.length, 0),
      currency: users.reduce((sum, user) => sum + user.deductions.currency, 0),
      stars: users.reduce((sum, user) => sum + user.deductions.stars, 0),
      experience: users.reduce((sum, user) => sum + user.deductions.experience, 0),
      tokens: users.reduce((sum, user) => sum + user.deductions.tokens, 0),
    },
    applied: mode === 'apply',
  };
}

export async function runAchievementMechanicsReconciliation(
  pool: Pool,
  input: {
    mode: AchievementMechanicsReconciliationMode;
    runId: string;
    backupMarker?: string;
    expectedHash?: string;
    expectedUserCount?: number;
  },
): Promise<AchievementMechanicsReconciliationReport> {
  if (input.mode === 'apply' && (
    !input.backupMarker?.trim() || !input.expectedHash || input.expectedUserCount === undefined
  )) {
    throw new Error('apply requires backup marker, confirmed hash, and user count');
  }
  const client = await pool.connect();
  let transactionOpen = false;
  try {
    await client.query('begin');
    transactionOpen = true;
    await client.query(`select pg_advisory_xact_lock(hashtext('achievement-mechanics-reconciliation-v1'))`);
    if (input.mode === 'apply') {
      const existing = await client.query<{ audit_hash: string }>(
        `select audit_hash from achievement_mechanics_reconciliation_run where run_id = $1`,
        [input.runId],
      );
      if (existing.rows[0] !== undefined) {
        await client.query('rollback');
        transactionOpen = false;
        return {
          ...buildReport(input.mode, input.runId, input.backupMarker ?? null, []),
          auditHash: existing.rows[0].audit_hash,
        };
      }
    }
    let rows = await readAuditRows(client, input.runId, false);
    if (input.mode === 'apply' && rows.length > 0) {
      const userIds = rows.map((row) => row.user_id);
      await client.query(`select id from users where id = any($1::uuid[]) for update`, [userIds]);
      await client.query(
        `select user_id from user_currency_account where user_id = any($1::uuid[]) for update`,
        [userIds],
      );
      await client.query(
        `select user_id from user_reward_token_account where user_id = any($1::uuid[]) for update`,
        [userIds],
      );
      rows = await readAuditRows(client, input.runId, true);
    }
    const users = buildUsers(rows);
    const report = buildReport(input.mode, input.runId, input.backupMarker ?? null, users);
    if (input.mode !== 'apply') {
      await client.query('rollback');
      transactionOpen = false;
      return report;
    }
    if (report.auditHash !== input.expectedHash || report.totals.users !== input.expectedUserCount) {
      throw new Error('production data changed after dry-run; run audit and dry-run again');
    }

    await client.query(
      `insert into achievement_mechanics_reconciliation_run
         (run_id, audit_hash, backup_marker, target_user_count)
       values ($1, $2, $3, $4)`,
      [input.runId, report.auditHash, input.backupMarker, report.totals.users],
    );
    for (const user of users) {
      await client.query(
        `update users set xp = $2, experience = $3 where id = $1`,
        [user.userId, user.balancesAfter.stars, user.balancesAfter.experience],
      );
      await client.query(
        `insert into user_currency_account (user_id, balance, reserved_balance)
         values ($1, $2, $3)
         on conflict (user_id) do update set balance = excluded.balance, updated_at = now()`,
        [user.userId, user.balancesAfter.currency, user.balancesAfter.reservedCurrency],
      );
      await client.query(
        `insert into user_reward_token_account (user_id, balance)
         values ($1, $2)
         on conflict (user_id) do update set balance = excluded.balance, updated_at = now()`,
        [user.userId, user.balancesAfter.tokens],
      );
      if (user.removeStages.length > 0) {
        await client.query(
          `delete from user_achievement_stages
            where user_id = $1 and achievement_id = any($2::text[]) and stage_number > 1`,
          [user.userId, RESET_STAGE_IDS],
        );
        await client.query(
          `insert into user_achievement_stages (user_id, achievement_id, stage_number, opened_at)
           select first.user_id, first.achievement_id, 2, now()
             from user_achievement_stages first
             join achievement_stages definition
               on definition.achievement_id = first.achievement_id
              and definition.stage_number = 2 and definition.is_enabled
            where first.user_id = $1 and first.stage_number = 1 and first.claimed_at is not null
              and first.achievement_id = any($2::text[])
           on conflict do nothing`,
          [user.userId, RESET_STAGE_IDS],
        );
      }
      await client.query(
        `insert into currency_ledger
           (user_id, reason, available_delta, reserved_delta, balance_after, reserved_after, metadata)
         values ($1, 'admin_adjustment', $2, 0, $3, $4, $5::jsonb)`,
        [user.userId, -user.deductions.currency, user.balancesAfter.currency,
          user.balancesAfter.reservedCurrency, JSON.stringify({
            title: 'Корректировка наград за задания',
            run_id: input.runId,
            stars: -user.deductions.stars,
            experience: -user.deductions.experience,
            tokens: -user.deductions.tokens,
            removed_stages: user.removeStages,
          })],
      );
      await client.query(
        `insert into achievement_mechanics_reconciliation_adjustment
           (run_id, user_id, currency_delta, stars_delta, experience_delta, tokens_delta,
            tokens_award_reconciled,
            balances_after, removed_stages)
         values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb)`,
        [input.runId, user.userId, -user.deductions.currency, -user.deductions.stars,
          -user.deductions.experience, -user.deductions.tokens,
          amount(rows.find((row) => row.user_id === user.userId)?.token_awarded ?? 0),
          JSON.stringify(user.balancesAfter), JSON.stringify(user.removeStages)],
      );
    }
    await client.query('commit');
    transactionOpen = false;
    return report;
  } catch (error) {
    if (transactionOpen) await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
