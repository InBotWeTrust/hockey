import type { Pool, PoolClient } from 'pg';
import { AppError } from '../plugins/errors.js';

type Queryable = Pool | PoolClient;

export interface AdminAchievementStageInput {
  requirement: string;
  target: Record<string, string | number | boolean>;
  rewardCurrency: number;
  rewardStars: number;
  rewardExperience: number;
  rewardTokens: number;
  isEnabled: boolean;
}

export type AdminAchievementStagePatch = {
  [Key in keyof AdminAchievementStageInput]?: AdminAchievementStageInput[Key] | undefined;
};

interface StageRow {
  achievement_id: string;
  stage_number: number;
  requirement: string;
  target: Record<string, string | number | boolean>;
  reward_currency: number | string;
  reward_stars: number | string;
  reward_experience: number | string;
  reward_tokens: number | string;
  is_enabled: boolean;
  current_players: string;
  completed_players: string;
  claimed_players: string;
}

export interface AdminAchievementStageDTO {
  achievementId: string;
  stageNumber: number;
  requirement: string;
  target: Record<string, string | number | boolean>;
  rewardCurrency: number;
  rewardStars: number;
  rewardExperience: number;
  rewardTokens: number;
  isEnabled: boolean;
  currentPlayers: number;
  completedPlayers: number;
  claimedPlayers: number;
}

const stageSelect = `select stage.achievement_id,
                            stage.stage_number,
                            stage.requirement,
                            stage.target,
                            stage.reward_currency,
                            stage.reward_stars,
                            stage.reward_experience,
                            stage.reward_tokens,
                            stage.is_enabled,
                            count(user_stage.user_id) filter (
                              where user_stage.claimed_at is null
                            )::text as current_players,
                            count(user_stage.user_id) filter (
                              where user_stage.completed_at is not null
                            )::text as completed_players,
                            count(user_stage.user_id) filter (
                              where user_stage.claimed_at is not null
                            )::text as claimed_players
                       from achievement_stages stage
                       left join user_achievement_stages user_stage
                         on user_stage.achievement_id = stage.achievement_id
                        and user_stage.stage_number = stage.stage_number`;

function mapStage(row: StageRow): AdminAchievementStageDTO {
  return {
    achievementId: row.achievement_id,
    stageNumber: row.stage_number,
    requirement: row.requirement,
    target: row.target,
    rewardCurrency: Number(row.reward_currency),
    rewardStars: Number(row.reward_stars),
    rewardExperience: Number(row.reward_experience),
    rewardTokens: Number(row.reward_tokens),
    isEnabled: row.is_enabled,
    currentPlayers: Number(row.current_players),
    completedPlayers: Number(row.completed_players),
    claimedPlayers: Number(row.claimed_players),
  };
}

export async function listAdminAchievementStages(
  db: Queryable,
  achievementId: string,
): Promise<AdminAchievementStageDTO[]> {
  const achievement = await db.query(`select 1 from achievements where id = $1`, [achievementId]);
  if (achievement.rowCount !== 1) throw new AppError('not_found', 'achievement not found', 404);
  const { rows } = await db.query<StageRow>(
    `${stageSelect}
      where stage.achievement_id = $1
      group by stage.achievement_id, stage.stage_number
      order by stage.stage_number`,
    [achievementId],
  );
  return rows.map(mapStage);
}

export async function createAdminAchievementStage(
  db: Queryable,
  achievementId: string,
  input: AdminAchievementStageInput,
): Promise<AdminAchievementStageDTO> {
  const next = await db.query<{ stage_number: number }>(
    `select coalesce(max(stage_number), 0)::int + 1 as stage_number
       from achievement_stages
      where achievement_id = $1`,
    [achievementId],
  );
  const stageNumber = next.rows[0]!.stage_number;
  const inserted = await db.query(
    `insert into achievement_stages
       (achievement_id, stage_number, requirement, target, reward_currency, reward_stars,
        reward_experience, reward_tokens, is_enabled)
     select id, $2, $3, $4::jsonb, $5, $6, $7, $8, $9
       from achievements
      where id = $1
     returning stage_number`,
    [
      achievementId,
      stageNumber,
      input.requirement,
      JSON.stringify(input.target),
      input.rewardCurrency,
      input.rewardStars,
      input.rewardExperience,
      input.rewardTokens,
      input.isEnabled,
    ],
  );
  if (inserted.rowCount !== 1) throw new AppError('not_found', 'achievement not found', 404);
  return (await listAdminAchievementStages(db, achievementId))[stageNumber - 1]!;
}

export async function updateAdminAchievementStage(
  db: Queryable,
  achievementId: string,
  stageNumber: number,
  input: AdminAchievementStagePatch,
): Promise<AdminAchievementStageDTO> {
  const rewardChanged =
    input.rewardCurrency !== undefined ||
    input.rewardStars !== undefined ||
    input.rewardExperience !== undefined ||
    input.rewardTokens !== undefined;
  if (rewardChanged) {
    const claimed = await db.query(
      `select 1 from user_achievement_stages
        where achievement_id = $1 and stage_number = $2 and claimed_at is not null limit 1`,
      [achievementId, stageNumber],
    );
    if (claimed.rowCount !== 0) {
      throw new AppError('conflict', 'claimed stage rewards are immutable', 409);
    }
  }

  const assignments: string[] = [];
  const values: unknown[] = [achievementId, stageNumber];
  const add = (column: string, value: unknown, cast = '') => {
    values.push(value);
    assignments.push(`${column} = $${values.length}${cast}`);
  };
  if (input.requirement !== undefined) add('requirement', input.requirement);
  if (input.target !== undefined) add('target', JSON.stringify(input.target), '::jsonb');
  if (input.rewardCurrency !== undefined) add('reward_currency', input.rewardCurrency);
  if (input.rewardStars !== undefined) add('reward_stars', input.rewardStars);
  if (input.rewardExperience !== undefined) add('reward_experience', input.rewardExperience);
  if (input.rewardTokens !== undefined) add('reward_tokens', input.rewardTokens);
  if (input.isEnabled !== undefined) add('is_enabled', input.isEnabled);

  const updated = await db.query(
    `update achievement_stages set ${assignments.join(', ')}
      where achievement_id = $1 and stage_number = $2 returning stage_number`,
    values,
  );
  if (updated.rowCount !== 1) throw new AppError('not_found', 'achievement stage not found', 404);
  return (await listAdminAchievementStages(db, achievementId))[stageNumber - 1]!;
}
