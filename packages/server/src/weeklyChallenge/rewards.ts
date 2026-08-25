import type { PoolClient } from 'pg';
import { AppError } from '../plugins/errors.js';

export interface WeeklyChallengeRewardInput {
  challengeId: string;
  userId: string;
  coins: number;
  stars: number;
  experience: number;
}

export async function grantWeeklyChallengeReward(
  client: PoolClient,
  input: WeeklyChallengeRewardInput,
): Promise<{ claimedAt: Date; balances: { coins: number; stars: number; experience: number } }> {
  const existing = await client.query<{ claimed_at: Date }>(
    `select claimed_at
       from weekly_challenge_reward_claims
      where challenge_id = $1 and user_id = $2`,
    [input.challengeId, input.userId],
  );
  if (existing.rows[0]) {
    throw new AppError('conflict', 'weekly challenge reward already claimed', 409);
  }

  // Global economy lock order: users before user_currency_account.
  const userResult = await client.query<{ stars: number; experience: number }>(
    `update users
        set stars = stars + $2,
            experience = experience + $3
      where id = $1
      returning stars, experience`,
    [input.userId, input.stars, input.experience],
  );
  const user = userResult.rows[0];
  if (!user) throw new AppError('not_found', 'user not found', 404);

  await client.query(
    `insert into user_currency_account (user_id) values ($1) on conflict do nothing`,
    [input.userId],
  );

  const accountResult = await client.query<{ balance: number; reserved_balance: number }>(
    `update user_currency_account
        set balance = balance + $2,
            updated_at = now()
      where user_id = $1
      returning balance, reserved_balance`,
    [input.userId, input.coins],
  );
  const account = accountResult.rows[0];
  if (!account)
    throw new AppError('server_error', 'weekly challenge currency account missing', 500);

  await client.query(
    `insert into currency_ledger
       (user_id, reason, available_delta, reserved_delta, balance_after, reserved_after, metadata)
     values ($1, 'weekly_challenge_reward', $2, 0, $3, $4, $5)`,
    [
      input.userId,
      input.coins,
      Number(account.balance),
      Number(account.reserved_balance),
      JSON.stringify({
        challenge_id: input.challengeId,
        stars: input.stars,
        experience: input.experience,
      }),
    ],
  );

  const claimResult = await client.query<{ claimed_at: Date }>(
    `insert into weekly_challenge_reward_claims
       (challenge_id, user_id, coins, stars, experience)
     values ($1, $2, $3, $4, $5)
     returning claimed_at`,
    [input.challengeId, input.userId, input.coins, input.stars, input.experience],
  );
  const claimedAt = claimResult.rows[0]!.claimed_at;

  await client.query(
    `update weekly_challenge_participants
        set reward_claimed_at = $3
      where challenge_id = $1 and user_id = $2`,
    [input.challengeId, input.userId, claimedAt],
  );

  return {
    claimedAt,
    balances: {
      coins: Number(account.balance),
      stars: Number(user.stars),
      experience: Number(user.experience),
    },
  };
}
