import type { PoolClient } from 'pg';
import { AppError } from '../plugins/errors.js';
import { observeCareerExperience } from './service.js';
import { satisfiesTarget } from './stageProgress.js';

const CUMULATIVE_STAGE_IDS = new Set([
  'career-goals', 'career-experience', 'career-streak',
  'monthly-top-1', 'monthly-top-3',
  'regular-season-champion', 'regular-season-medalist',
  'playoff-semifinal', 'playoff-final', 'tournament-cup',
]);

interface ClaimableStageRow {
  achievement_id: string;
  stage_number: number;
  title: string;
  completed_at: Date | null;
  reward_currency: number | string;
  reward_stars: number | string;
  reward_experience: number | string;
  reward_tokens: number | string;
}

export interface ClaimedStageResult {
  stage: { claimed: number; opened: number | null };
  rewards: { currency: number; stars: number; experience: number; tokens: number };
  balances: {
    currencyBalance: number;
    starBalance: number;
    experienceBalance: number;
    tokenBalance: number;
  };
}

export async function claimCurrentAchievementStage(
  client: PoolClient,
  userId: string,
  achievementId: string,
  now: Date,
): Promise<ClaimedStageResult> {
  const lockedUser = await client.query<{ xp: number; experience: number }>(
    `select xp, experience from users where id = $1 for update`,
    [userId],
  );
  if (lockedUser.rowCount === 0) throw new AppError('not_found', 'user not found', 404);

  const stageResult = await client.query<ClaimableStageRow>(
    `select user_stage.achievement_id, user_stage.stage_number, user_stage.completed_at,
            achievement.title, stage.reward_currency, stage.reward_stars,
            stage.reward_experience, stage.reward_tokens
       from user_achievement_stages user_stage
       join achievement_stages stage
         on stage.achievement_id = user_stage.achievement_id
        and stage.stage_number = user_stage.stage_number
       join achievements achievement on achievement.id = user_stage.achievement_id
      where user_stage.user_id = $1
        and user_stage.achievement_id = $2
        and user_stage.claimed_at is null
      order by user_stage.stage_number desc
      limit 1
      for update of user_stage`,
    [userId, achievementId],
  );
  const stage = stageResult.rows[0];
  if (stage === undefined) throw new AppError('not_found', 'achievement stage not found', 404);
  if (stage.completed_at === null) {
    throw new AppError('conflict', 'achievement stage is not completed', 409);
  }

  const rewards = {
    currency: Number(stage.reward_currency),
    stars: Number(stage.reward_stars),
    experience: Number(stage.reward_experience),
    tokens: Number(stage.reward_tokens),
  };

  const updatedUser = await client.query<{ xp: number; experience: number }>(
    `update users
        set xp = xp + $2, experience = experience + $3
      where id = $1
      returning xp, experience`,
    [userId, rewards.stars, rewards.experience],
  );
  await client.query(
    `insert into user_currency_account (user_id) values ($1)
     on conflict do nothing`,
    [userId],
  );
  const currencyAccount = await client.query<{
    balance: number | string;
    reserved_balance: number | string;
  }>(
    `update user_currency_account
        set balance = balance + $2, updated_at = $3
      where user_id = $1
      returning balance, reserved_balance`,
    [userId, rewards.currency, now],
  );
  await client.query(
    `insert into user_reward_token_account (user_id) values ($1)
     on conflict do nothing`,
    [userId],
  );
  const tokenAccount = await client.query<{ balance: number | string }>(
    `update user_reward_token_account
        set balance = balance + $2, updated_at = $3
      where user_id = $1
      returning balance`,
    [userId, rewards.tokens, now],
  );
  const account = currencyAccount.rows[0];
  const tokens = tokenAccount.rows[0];
  const user = updatedUser.rows[0];
  if (account === undefined || tokens === undefined || user === undefined) {
    throw new AppError('server_error', 'achievement reward account missing', 500);
  }

  if (rewards.tokens > 0) {
    await client.query(
      `insert into achievement_token_ledger
         (user_id, achievement_id, stage_number, amount, balance_after, created_at)
       values ($1, $2, $3, $4, $5, $6)`,
      [userId, achievementId, stage.stage_number, rewards.tokens, tokens.balance, now],
    );
  }
  await client.query(
    `insert into currency_ledger
       (user_id, reason, available_delta, reserved_delta, balance_after, reserved_after,
        metadata, created_at)
     values ($1, 'achievement_reward', $2, 0, $3, $4, $5, $6)`,
    [
      userId,
      rewards.currency,
      account.balance,
      account.reserved_balance,
      JSON.stringify({
        achievement_id: achievementId,
        stage_number: stage.stage_number,
        title: `Награда за достижение «${stage.title}», этап ${stage.stage_number}`,
        stars: rewards.stars,
        experience: rewards.experience,
        tokens: rewards.tokens,
      }),
      now,
    ],
  );

  await client.query(
    `update user_achievement_stages
        set claimed_at = $4,
            reward_snapshot = $5::jsonb
      where user_id = $1 and achievement_id = $2 and stage_number = $3`,
    [userId, achievementId, stage.stage_number, now, JSON.stringify(rewards)],
  );

  const opened = await client.query<{
    stage_number: number;
    target: Record<string, number | string | boolean>;
    progress: Record<string, number | string | boolean>;
  }>(
    `insert into user_achievement_stages
       (user_id, achievement_id, stage_number, opened_at, progress)
     select $1, stage.achievement_id, stage.stage_number, $4,
            case when $5 then previous.progress else '{}'::jsonb end
       from achievement_stages stage
       join user_achievement_stages previous
         on previous.user_id = $1 and previous.achievement_id = $2
        and previous.stage_number = $3
      where stage.achievement_id = $2
        and stage.stage_number = $3 + 1
        and stage.is_enabled
     on conflict (user_id, achievement_id, stage_number) do nothing
     returning stage_number,
       (select target from achievement_stages definition
         where definition.achievement_id = $2 and definition.stage_number = $3 + 1) as target,
       progress`,
    [userId, achievementId, stage.stage_number, now, CUMULATIVE_STAGE_IDS.has(achievementId)],
  );
  const openedStage = opened.rows[0];
  if (openedStage !== undefined && satisfiesTarget(openedStage.progress, openedStage.target)) {
    await client.query(
      `update user_achievement_stages set completed_at = $4, completion_context = $5::jsonb
        where user_id = $1 and achievement_id = $2 and stage_number = $3`,
      [userId, achievementId, openedStage.stage_number, now, JSON.stringify({ source: 'cumulative_carry' })],
    );
  }

  if (rewards.experience > 0) {
    await observeCareerExperience(client, userId, {
      eventKey: `achievement-stage:${achievementId}:${stage.stage_number}:reward`,
      occurredAt: now,
      lifetimeTotal: Number(user.experience),
    });
  }

  return {
    stage: { claimed: stage.stage_number, opened: openedStage?.stage_number ?? null },
    rewards,
    balances: {
      currencyBalance: Number(account.balance),
      starBalance: Number(user.xp),
      experienceBalance: Number(user.experience),
      tokenBalance: Number(tokens.balance),
    },
  };
}
