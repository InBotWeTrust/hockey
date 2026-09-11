import type { Pool, PoolClient } from 'pg';

const MONTHLY_ACHIEVEMENT_IDS = ['monthly-top-1', 'monthly-top-3'] as const;

type MonthlyAchievementId = (typeof MONTHLY_ACHIEVEMENT_IDS)[number];

interface InvalidAchievementRow {
  user_id: string;
  display_name: string;
  achievement_id: MonthlyAchievementId;
  claimed_at: Date | null;
  reward_currency: number | string;
  reward_stars: number | string;
  reward_experience: number | string;
  reward_tokens: number | string;
}

export interface MonthlyRatingAchievementAuditFinding {
  userId: string;
  displayName: string;
  achievementId: MonthlyAchievementId;
  claimed: boolean;
}

export interface MonthlyRatingAchievementAuditReport {
  applied: boolean;
  invalid: MonthlyRatingAchievementAuditFinding[];
}

function number(value: number | string): number {
  return Number(value);
}

async function findInvalidMonthlyAchievements(
  client: PoolClient,
): Promise<InvalidAchievementRow[]> {
  const { rows } = await client.query<InvalidAchievementRow>(
    `select ua.user_id,
            u.display_name,
            ua.achievement_id,
            ua.claimed_at,
            a.reward_currency,
            a.reward_stars,
            a.reward_experience,
            a.reward_tokens
       from user_achievements ua
       join users u on u.id = ua.user_id
       join achievements a on a.id = ua.achievement_id
      where ua.achievement_id = any($1::text[])
        and not exists (
          select 1
            from monthly_duel_rating_placement placement
           where placement.user_id = ua.user_id
             and placement.season_key = ua.completion_context->>'seasonKey'
             and (
               (ua.achievement_id = 'monthly-top-1' and placement.place = 1)
               or (ua.achievement_id = 'monthly-top-3' and placement.place between 1 and 3)
             )
        )
      order by ua.user_id, ua.achievement_id
      for update of ua, u`,
    [MONTHLY_ACHIEVEMENT_IDS],
  );
  return rows;
}

async function reverseClaimedReward(client: PoolClient, row: InvalidAchievementRow): Promise<void> {
  const coins = number(row.reward_currency);
  const stars = number(row.reward_stars);
  const experience = number(row.reward_experience);
  const tokens = number(row.reward_tokens);

  const user = await client.query(
    `update users
        set xp = xp - $2,
            experience = experience - $3
      where id = $1 and xp >= $2 and experience >= $3
      returning xp, experience`,
    [row.user_id, stars, experience],
  );
  if (user.rowCount !== 1) {
    throw new Error(`cannot reverse monthly achievement reward for ${row.user_id}: insufficient xp`);
  }

  let coinsAfter = 0;
  let reservedAfter = 0;
  if (coins > 0) {
    const account = await client.query<{ balance: number | string; reserved_balance: number | string }>(
      `update user_currency_account
          set balance = balance - $2, updated_at = now()
        where user_id = $1 and balance >= $2
        returning balance, reserved_balance`,
      [row.user_id, coins],
    );
    const balance = account.rows[0];
    if (!balance) {
      throw new Error(
        `cannot reverse monthly achievement reward for ${row.user_id}: insufficient coins`,
      );
    }
    coinsAfter = number(balance.balance);
    reservedAfter = number(balance.reserved_balance);
  }

  if (tokens > 0) {
    const tokenAccount = await client.query(
      `update user_reward_token_account
          set balance = balance - $2, updated_at = now()
        where user_id = $1 and balance >= $2
        returning balance`,
      [row.user_id, tokens],
    );
    if (tokenAccount.rowCount !== 1) {
      throw new Error(
        `cannot reverse monthly achievement reward for ${row.user_id}: insufficient tokens`,
      );
    }
  }

  await client.query(
    `delete from achievement_token_ledger
      where user_id = $1 and achievement_id = $2`,
    [row.user_id, row.achievement_id],
  );
  await client.query(
    `insert into currency_ledger
       (user_id, reason, available_delta, reserved_delta, balance_after, reserved_after, metadata)
     values ($1, 'admin_adjustment', $2, 0, $3, $4, $5)`,
    [
      row.user_id,
      -coins,
      coinsAfter,
      reservedAfter,
      JSON.stringify({
        title: 'Отмена ошибочно выданной награды за месячный рейтинг',
        achievement_id: row.achievement_id,
        stars: -stars,
        experience: -experience,
        tokens: -tokens,
      }),
    ],
  );
}

/** Audits every monthly-rating achievement against the immutable final placement snapshot. */
export async function runMonthlyRatingAchievementAudit(
  pool: Pool,
  options: { apply: boolean; now?: Date },
): Promise<MonthlyRatingAchievementAuditReport> {
  const client = await pool.connect();
  let transactionOpen = false;
  try {
    await client.query('begin');
    transactionOpen = true;
    await client.query(`select pg_advisory_xact_lock(hashtext('monthly-rating-achievement-audit-v1'))`);
    const invalid = await findInvalidMonthlyAchievements(client);
    const report: MonthlyRatingAchievementAuditReport = {
      applied: options.apply,
      invalid: invalid.map((row) => ({
        userId: row.user_id,
        displayName: row.display_name,
        achievementId: row.achievement_id,
        claimed: row.claimed_at !== null,
      })),
    };

    if (!options.apply) {
      await client.query('rollback');
      transactionOpen = false;
      return report;
    }

    for (const row of invalid) {
      if (row.claimed_at !== null) await reverseClaimedReward(client, row);
      const deleted = await client.query(
        `delete from user_achievements where user_id = $1 and achievement_id = $2`,
        [row.user_id, row.achievement_id],
      );
      if (deleted.rowCount !== 1) {
        throw new Error(`monthly achievement disappeared during audit for ${row.user_id}`);
      }
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
