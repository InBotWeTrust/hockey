import type { Pool, PoolClient } from 'pg';

export const PRODUCTION_ECONOMY_REBASE_KEY = '2026-09-11-production-economy-rebase-v1';

const ADMIN_ID = '80cacbe5-d97f-4f48-b4a1-d39fd7946bbe';
const TARGETS = [
  {
    id: '32206bf3-0bfd-4e88-ac6d-85b4485dd967',
    displayName: 'Andrey Rubtsov',
    provider: 'vk',
    providerUid: '92249804',
  },
  {
    id: '873d6bd2-294d-49d2-a895-ffa7a352dec5',
    displayName: 'Пора Белум',
  },
  {
    id: '5b9a36a1-6211-438e-95f0-d2e2ce173980',
    displayName: 'River 🏔',
  },
] as const;

interface RewardRow {
  id: string;
  display_name: string;
  current_coins: number | string;
  current_reserved: number | string;
  current_stars: number | string;
  current_experience: number | string;
  current_tokens: number | string;
  target_coins: number | string;
  target_stars: number | string;
  target_experience: number | string;
  target_tokens: number | string;
  achievement_ids: string[];
}

export interface ProductionEconomyRebaseUserReport {
  id: string;
  displayName: string;
  achievements: string[];
  before: {
    coins: number;
    reservedCoins: number;
    stars: number;
    experience: number;
    tokens: number;
  };
  after: { coins: number; reservedCoins: 0; stars: number; experience: number; tokens: number };
}

export interface ProductionEconomyRebaseReport {
  operationKey: string;
  applied: boolean;
  alreadyApplied: boolean;
  deletedUsers: number;
  deletedMessages: number;
  deletedComments: number;
  survivingUsers: number;
  users: ProductionEconomyRebaseUserReport[];
}

async function assertTargets(client: PoolClient): Promise<void> {
  const ids = TARGETS.map((target) => target.id);
  const result = await client.query<{
    id: string;
    display_name: string;
    provider: string | null;
    provider_uid: string | null;
  }>(
    `select u.id, u.display_name, ap.provider, ap.provider_uid
       from users u
       left join auth_providers ap
         on ap.user_id = u.id
        and ap.provider = 'vk'
      where u.id = any($1::uuid[])
      order by u.id`,
    [ids],
  );
  if (result.rows.length !== TARGETS.length) {
    throw new Error(`expected ${TARGETS.length} deletion targets, found ${result.rows.length}`);
  }
  for (const target of TARGETS) {
    const row = result.rows.find((candidate) => candidate.id === target.id);
    if (!row || row.display_name !== target.displayName) {
      throw new Error(`production deletion target mismatch for ${target.id}`);
    }
    if (
      'provider' in target &&
      (row.provider !== target.provider || row.provider_uid !== target.providerUid)
    ) {
      throw new Error(`production deletion provider mismatch for ${target.id}`);
    }
  }
  const admin = await client.query('select id from users where id = $1 and role = $2', [
    ADMIN_ID,
    'admin',
  ]);
  if (admin.rowCount !== 1) throw new Error(`replacement admin ${ADMIN_ID} is missing`);
}

async function transferSharedOwnership(client: PoolClient, targetIds: string[]): Promise<void> {
  await client.query('update chats set created_by = $1 where created_by = any($2::uuid[])', [
    ADMIN_ID,
    targetIds,
  ]);
  await client.query('update tournament set created_by = $1 where created_by = any($2::uuid[])', [
    ADMIN_ID,
    targetIds,
  ]);
  await client.query(
    'update tournament_revision set created_by = $1 where created_by = any($2::uuid[])',
    [ADMIN_ID, targetIds],
  );
  await client.query(
    'update tournament_adjustment set created_by = $1 where created_by = any($2::uuid[])',
    [ADMIN_ID, targetIds],
  );
  await client.query(
    'update admin_direct_broadcasts set created_by = $1 where created_by = any($2::uuid[])',
    [ADMIN_ID, targetIds],
  );
  await client.query(
    `update tournament_series_admin_decision
        set requested_by = case when requested_by = any($2::uuid[]) then $1 else requested_by end,
            confirmed_by = case when confirmed_by = any($2::uuid[]) then $1 else confirmed_by end
      where requested_by = any($2::uuid[]) or confirmed_by = any($2::uuid[])`,
    [ADMIN_ID, targetIds],
  );
}

function number(value: number | string): number {
  return Number(value);
}

export async function runProductionEconomyRebase(
  pool: Pool,
  options: { apply: boolean },
): Promise<ProductionEconomyRebaseReport> {
  const client = await pool.connect();
  let transactionOpen = false;
  try {
    await client.query('begin');
    transactionOpen = true;
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [
      PRODUCTION_ECONOMY_REBASE_KEY,
    ]);
    const previous = await client.query<{ payload: ProductionEconomyRebaseReport }>(
      'select payload from production_data_operations where operation_key = $1',
      [PRODUCTION_ECONOMY_REBASE_KEY],
    );
    if (previous.rows[0]) {
      await client.query('rollback');
      transactionOpen = false;
      return {
        ...previous.rows[0].payload,
        applied: false,
        alreadyApplied: true,
      };
    }

    await client.query('lock table users in share row exclusive mode');
    await assertTargets(client);
    const targetIds = TARGETS.map((target) => target.id);
    await transferSharedOwnership(client, targetIds);
    const comments = await client.query(
      'delete from channel_post_comments where author_id = any($1::uuid[])',
      [targetIds],
    );
    const messages = await client.query('delete from messages where sender_id = any($1::uuid[])', [
      targetIds,
    ]);
    await client.query(
      `update chats chat
          set last_message_at = latest.created_at,
              updated_at = now()
         from (
           select chat.id,
                  (select max(message.created_at) from messages message where message.chat_id = chat.id) created_at
             from chats chat
         ) latest
        where chat.id = latest.id
          and chat.last_message_at is distinct from latest.created_at`,
    );
    const deleted = await client.query('delete from users where id = any($1::uuid[])', [targetIds]);

    const rewards = await client.query<RewardRow>(
      `select u.id,
              u.display_name,
              coalesce(account.balance, 0) current_coins,
              coalesce(account.reserved_balance, 0) current_reserved,
              u.xp current_stars,
              u.experience current_experience,
              coalesce(token.balance, 0) current_tokens,
              coalesce(reward.coins, 0) target_coins,
              coalesce(reward.stars, 0) target_stars,
              coalesce(reward.experience, 0) target_experience,
              coalesce(reward.tokens, 0) target_tokens,
              coalesce(reward.achievement_ids, array[]::text[]) achievement_ids
         from users u
         left join user_currency_account account on account.user_id = u.id
         left join user_reward_token_account token on token.user_id = u.id
         left join lateral (
           select sum(achievement.reward_currency)::bigint coins,
                  sum(achievement.reward_stars)::bigint stars,
                  sum(achievement.reward_experience)::bigint experience,
                  sum(achievement.reward_tokens)::bigint tokens,
                  array_agg(achievement.id order by completed.completed_at, achievement.id) achievement_ids
             from user_achievements completed
             join achievements achievement on achievement.id = completed.achievement_id
            where completed.user_id = u.id
         ) reward on true
        order by u.id
        for update of u`,
    );

    const users: ProductionEconomyRebaseUserReport[] = [];
    for (const row of rewards.rows) {
      const before = {
        coins: number(row.current_coins),
        reservedCoins: number(row.current_reserved),
        stars: number(row.current_stars),
        experience: number(row.current_experience),
        tokens: number(row.current_tokens),
      };
      const after = {
        coins: number(row.target_coins),
        reservedCoins: 0 as const,
        stars: number(row.target_stars),
        experience: number(row.target_experience),
        tokens: number(row.target_tokens),
      };
      await client.query(
        `insert into user_currency_account (user_id, balance, reserved_balance)
         values ($1, $2, 0)
         on conflict (user_id) do update
           set balance = excluded.balance, reserved_balance = 0, updated_at = now()`,
        [row.id, after.coins],
      );
      await client.query('update users set xp = $2, experience = $3 where id = $1', [
        row.id,
        after.stars,
        after.experience,
      ]);
      await client.query(
        `insert into user_reward_token_account (user_id, balance)
         values ($1, $2)
         on conflict (user_id) do update set balance = excluded.balance, updated_at = now()`,
        [row.id, after.tokens],
      );
      await client.query(
        `insert into currency_ledger
           (user_id, reason, available_delta, reserved_delta, balance_after, reserved_after, metadata)
         values ($1, 'admin_adjustment', $2, $3, $4, 0, $5)`,
        [
          row.id,
          after.coins - before.coins,
          -before.reservedCoins,
          after.coins,
          JSON.stringify({
            operation_key: PRODUCTION_ECONOMY_REBASE_KEY,
            title: 'Пересчёт баланса по выполненным достижениям',
            stars: after.stars - before.stars,
            experience: after.experience - before.experience,
            tokens: after.tokens - before.tokens,
            achievement_ids: row.achievement_ids,
          }),
        ],
      );
      users.push({
        id: row.id,
        displayName: row.display_name,
        achievements: row.achievement_ids,
        before,
        after,
      });
    }

    await client.query('delete from achievement_token_ledger');
    await client.query(
      `insert into achievement_token_ledger
         (user_id, achievement_id, amount, balance_after, created_at)
       select completed.user_id,
              completed.achievement_id,
              achievement.reward_tokens,
              sum(achievement.reward_tokens) over (
                partition by completed.user_id
                order by completed.completed_at, completed.achievement_id
              ),
              coalesce(completed.claimed_at, now())
         from user_achievements completed
         join achievements achievement on achievement.id = completed.achievement_id
        where achievement.reward_tokens > 0`,
    );
    await client.query('update user_achievements set claimed_at = coalesce(claimed_at, now())');

    const report: ProductionEconomyRebaseReport = {
      operationKey: PRODUCTION_ECONOMY_REBASE_KEY,
      applied: options.apply,
      alreadyApplied: false,
      deletedUsers: deleted.rowCount ?? 0,
      deletedMessages: messages.rowCount ?? 0,
      deletedComments: comments.rowCount ?? 0,
      survivingUsers: rewards.rows.length,
      users,
    };
    if (options.apply) {
      await client.query(
        'insert into production_data_operations (operation_key, payload) values ($1, $2)',
        [PRODUCTION_ECONOMY_REBASE_KEY, JSON.stringify(report)],
      );
      await client.query('commit');
    } else {
      await client.query('rollback');
    }
    transactionOpen = false;
    return report;
  } catch (error) {
    if (transactionOpen) await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
