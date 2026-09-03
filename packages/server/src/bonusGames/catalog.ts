import type { Pool, PoolClient } from 'pg';
import { getGameSettings } from '../duel/gameSettings.js';
import { resolveCompetitionLevel } from '../profile/summary.js';
import { normalizeBonusQualificationRules, type BonusQualificationRules } from './qualification.js';
import type {
  BonusGameAccessType,
  BonusSkillCode,
  BonusGameAttemptState,
  BonusPeriodRule,
  BonusRulesSnapshot,
  BonusRewardSnapshot,
} from './types.js';

type Queryable = Pool | PoolClient;

export type BonusGameCardState =
  | 'level_locked'
  | 'sequence_locked'
  | 'purchase_required'
  | 'available'
  | 'in_progress'
  | 'completed'
  | 'archived';

export interface BonusGameCardAttemptDto {
  id: string;
  game_id: string;
  state: BonusGameAttemptState;
  current_period: number;
  period_started_at: string | null;
  break_started_at: string | null;
  shots_taken: number;
  goals: number;
}

export interface BonusGameCardDto {
  id: string;
  slug: string;
  title: string;
  skill_code: BonusSkillCode;
  description: string;
  sort_order: number;
  access_type: BonusGameAccessType;
  unlock_price_stars: number;
  target_goals: number;
  qualification_rules: BonusQualificationRules;
  total_periods: number;
  break_duration_ms: number;
  use_inventory: boolean;
  preview_title: string;
  preview_story: string;
  preview_artwork_url: string;
  preview_revision: number;
  period_rules: BonusPeriodRule[];
  reward: BonusRewardSnapshot;
  goalkeeper_ready_url: string;
  goalkeeper_save_url: string;
  prerequisite: { game_id: string; title: string } | null;
  arena: {
    id: string;
    slug: string;
    title: string;
    artwork_url: string;
    thumbnail_url: string;
  };
  is_unlocked: boolean;
  is_completed: boolean;
  state: BonusGameCardState;
  active_attempt: BonusGameCardAttemptDto | null;
}

interface UserAccessRow {
  level: number;
  lifetime_goals_total: number;
}

interface CatalogRow {
  id: string;
  slug: string;
  title: string;
  skill_code: BonusSkillCode;
  description: string;
  sort_order: number;
  status: 'active' | 'archived';
  access_type: BonusGameAccessType;
  unlock_price_stars: number;
  target_goals: number;
  qualification_rules: unknown | null;
  total_periods: number;
  break_duration_ms: number;
  use_inventory: boolean;
  preview_title: string;
  preview_story: string;
  preview_artwork_url: string;
  preview_revision: number;
  period_rules: BonusPeriodRule[];
  reward_coins: number;
  reward_stars: number;
  reward_experience: number;
  goalkeeper_ready_url: string;
  goalkeeper_save_url: string;
  arena_id: string;
  arena_slug: string;
  arena_title: string;
  arena_artwork_url: string;
  arena_thumbnail_url: string;
  predecessor_id: string | null;
  predecessor_title: string | null;
  predecessor_completed: boolean;
  unlock_id: string | null;
  completion_id: string | null;
  attempt_id: string | null;
  attempt_state: BonusGameAttemptState | null;
  attempt_current_period: number | null;
  attempt_period_started_at: Date | null;
  attempt_break_started_at: Date | null;
  attempt_shots_taken: number | null;
  attempt_goals: number | null;
  attempt_rules_snapshot: BonusRulesSnapshot | null;
  attempt_reward_snapshot: BonusRewardSnapshot | null;
}

function toIso(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

function deriveCardState(row: CatalogRow, hasAmateurAccess: boolean): BonusGameCardState {
  if (row.status === 'archived') return 'archived';
  if (!hasAmateurAccess) return 'level_locked';
  if (row.attempt_id !== null) return 'in_progress';
  if (row.completion_id !== null) return 'completed';
  if (row.predecessor_id !== null && !row.predecessor_completed) return 'sequence_locked';
  if (row.access_type === 'paid' && row.unlock_id === null) return 'purchase_required';
  return 'available';
}

function toActiveAttempt(row: CatalogRow): BonusGameCardAttemptDto | null {
  if (
    row.attempt_id === null ||
    row.attempt_state === null ||
    row.attempt_current_period === null ||
    row.attempt_shots_taken === null ||
    row.attempt_goals === null
  ) {
    return null;
  }
  return {
    id: row.attempt_id,
    game_id: row.id,
    state: row.attempt_state,
    current_period: Number(row.attempt_current_period),
    period_started_at: toIso(row.attempt_period_started_at),
    break_started_at: toIso(row.attempt_break_started_at),
    shots_taken: Number(row.attempt_shots_taken),
    goals: Number(row.attempt_goals),
  };
}

export async function listBonusGameCards(
  db: Queryable,
  userId: string,
): Promise<BonusGameCardDto[]> {
  const [settings, user] = await Promise.all([
    getGameSettings(db),
    db.query<UserAccessRow>(
      `select level, lifetime_goals_total
         from users
        where id = $1`,
      [userId],
    ),
  ]);
  const userRow = user.rows[0];
  const hasAmateurAccess =
    userRow !== undefined &&
    resolveCompetitionLevel(
      Number(userRow.level),
      Number(userRow.lifetime_goals_total),
      settings.amateur.unlockGoalsRequired,
    ) !== 'beginner';

  const { rows } = await db.query<CatalogRow>(
    `with catalog_games as (
       select bg.*,
              case when bg.status = 'active' then (
                select previous.id
                  from bonus_game previous
                 where previous.status = 'active'
                   and previous.skill_code = bg.skill_code
                   and previous.sort_order < bg.sort_order
                 order by previous.sort_order desc, previous.id desc
                 limit 1
              ) else null end as predecessor_id
             ,case when bg.status = 'active' then (
                select previous.title
                  from bonus_game previous
                 where previous.status = 'active'
                   and previous.skill_code = bg.skill_code
                   and previous.sort_order < bg.sort_order
                 order by previous.sort_order desc, previous.id desc
                 limit 1
              ) else null end as predecessor_title
         from bonus_game bg
        where bg.status = 'active'
           or (
             bg.status = 'archived'
             and exists (
               select 1
                 from bonus_game_attempt archived_attempt
                where archived_attempt.user_id = $1
                  and archived_attempt.bonus_game_id = bg.id
                  and archived_attempt.status = 'active'
             )
           )
     )
     select game.id, game.slug, game.title, game.skill_code, game.description, game.sort_order, game.status,
            game.access_type, game.unlock_price_stars, game.target_goals,
            game.qualification_rules, game.total_periods,
            game.break_duration_ms, game.use_inventory, game.preview_title,
            game.preview_story, game.preview_artwork_url, game.preview_revision,
            game.period_rules,
            game.reward_coins, game.reward_stars, game.reward_experience,
            game.goalkeeper_ready_url, game.goalkeeper_save_url,
            arena.id as arena_id, arena.slug as arena_slug, arena.title as arena_title,
            arena.artwork_url as arena_artwork_url,
            arena.thumbnail_url as arena_thumbnail_url,
            game.predecessor_id,
            game.predecessor_title,
            (predecessor_completion.id is not null) as predecessor_completed,
            unlock.id as unlock_id,
            completion.id as completion_id,
            attempt.id as attempt_id,
            attempt.state as attempt_state,
            attempt.current_period as attempt_current_period,
            attempt.period_started_at as attempt_period_started_at,
            attempt.break_started_at as attempt_break_started_at,
            attempt.shots_taken as attempt_shots_taken,
            attempt.goals as attempt_goals,
            attempt.rules_snapshot as attempt_rules_snapshot,
            attempt.reward_snapshot as attempt_reward_snapshot
       from catalog_games game
       join arena_theme arena on arena.id = game.arena_theme_id
       left join user_bonus_game_completion predecessor_completion
         on predecessor_completion.user_id = $1
        and predecessor_completion.bonus_game_id = game.predecessor_id
       left join user_bonus_game_unlock unlock
         on unlock.user_id = $1 and unlock.bonus_game_id = game.id
       left join user_bonus_game_completion completion
         on completion.user_id = $1 and completion.bonus_game_id = game.id
       left join bonus_game_attempt attempt
         on attempt.user_id = $1
        and attempt.bonus_game_id = game.id
        and attempt.status = 'active'
      order by game.skill_code, game.sort_order, game.id`,
    [userId],
  );

  return rows.map((row) => {
    const state = deriveCardState(row, hasAmateurAccess);
    const activeRules = row.attempt_id === null ? null : row.attempt_rules_snapshot;
    const periodRules = activeRules?.periods ?? row.period_rules;
    const targetGoals = activeRules?.targetGoals ?? Number(row.target_goals);
    const qualificationRules = normalizeBonusQualificationRules(
      activeRules?.qualificationRules ?? row.qualification_rules,
      {
        targetGoals,
        shotsLimit: periodRules.reduce((sum, period) => sum + (period.shotsLimit ?? 0), 0),
      },
    );
    const activeArena = activeRules?.arena;
    const reward = row.attempt_reward_snapshot ?? {
      coins: Number(row.reward_coins),
      stars: Number(row.reward_stars),
      experience: Number(row.reward_experience),
    };
    return {
      id: row.id,
      slug: activeRules?.slug ?? row.slug,
      title: activeRules?.title ?? row.title,
      skill_code: activeRules?.skillCode ?? row.skill_code,
      description: row.description,
      sort_order: Number(row.sort_order),
      access_type: row.access_type,
      unlock_price_stars: Number(row.unlock_price_stars),
      target_goals: targetGoals,
      qualification_rules: qualificationRules,
      total_periods: activeRules?.totalPeriods ?? Number(row.total_periods),
      break_duration_ms: activeRules?.breakDurationMs ?? Number(row.break_duration_ms),
      use_inventory: activeRules?.useInventory ?? row.use_inventory,
      preview_title: activeRules?.previewTitle ?? row.preview_title,
      preview_story: activeRules?.previewStory ?? row.preview_story,
      preview_artwork_url: activeRules?.previewArtworkUrl ?? row.preview_artwork_url,
      preview_revision: activeRules?.previewRevision ?? Number(row.preview_revision),
      period_rules: periodRules,
      reward,
      goalkeeper_ready_url: activeRules?.goalkeeperReadyUrl ?? row.goalkeeper_ready_url,
      goalkeeper_save_url: activeRules?.goalkeeperSaveUrl ?? row.goalkeeper_save_url,
      arena: activeArena
        ? {
            id: activeArena.id,
            slug: activeArena.slug,
            title: activeArena.title,
            artwork_url: activeArena.artworkUrl,
            thumbnail_url: activeArena.thumbnailUrl,
          }
        : {
            id: row.arena_id,
            slug: row.arena_slug,
            title: row.arena_title,
            artwork_url: row.arena_artwork_url,
            thumbnail_url: row.arena_thumbnail_url,
          },
      is_unlocked: row.access_type === 'free' || row.unlock_id !== null,
      is_completed: row.completion_id !== null,
      state,
      prerequisite:
        state === 'sequence_locked' && row.predecessor_id !== null && row.predecessor_title !== null
          ? { game_id: row.predecessor_id, title: row.predecessor_title }
          : null,
      active_attempt: toActiveAttempt(row),
    };
  });
}
