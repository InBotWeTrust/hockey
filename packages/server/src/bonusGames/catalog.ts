import type { Pool, PoolClient } from 'pg';
import { assertFullAmateurAccess, resolveAmateurAccess } from '../profile/amateurAccess.js';
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

export const BEGINNER_BONUS_GAME_LIMIT_PER_SKILL = 2 as const;
export const BONUS_GAME_CATALOG_LOCK_CLASS_ID = 0x42474d45;
export const BONUS_GAME_CATALOG_LOCK_OBJECT_ID = 1;

/**
 * Catalog readers take the shared side of this transaction-scoped protocol.
 * Every admin transaction that mutates bonus-game activation/order must take
 * `lockBonusGameCatalogForMutation` before reading or writing the catalog.
 */
export async function lockBonusGameCatalogForRead(client: PoolClient): Promise<void> {
  await client.query('select pg_advisory_xact_lock_shared($1::int, $2::int)', [
    BONUS_GAME_CATALOG_LOCK_CLASS_ID,
    BONUS_GAME_CATALOG_LOCK_OBJECT_ID,
  ]);
}

export async function lockBonusGameCatalogForMutation(client: PoolClient): Promise<void> {
  await client.query('select pg_advisory_xact_lock($1::int, $2::int)', [
    BONUS_GAME_CATALOG_LOCK_CLASS_ID,
    BONUS_GAME_CATALOG_LOCK_OBJECT_ID,
  ]);
}

export async function assertBonusGameAccessibleToUser(
  db: Queryable,
  userId: string,
  gameId: string,
): Promise<void> {
  const access = await resolveAmateurAccess(db, userId);
  if (access.hasFullAccess) return;

  const { rows } = await db.query<{ category_position: number }>(
    `select category_position
       from (
         select id,
                row_number() over (partition by skill_code order by sort_order, id)::int
                  as category_position
           from bonus_game
          where status = 'active'
       ) active_games
      where id = $1`,
    [gameId],
  );
  const position = rows[0]?.category_position;
  if (position === undefined || Number(position) > BEGINNER_BONUS_GAME_LIMIT_PER_SKILL) {
    await assertFullAmateurAccess(db, userId);
  }
}

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
  category_position: number | null;
}

function toIso(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

function deriveCardState(row: CatalogRow, hasAmateurAccess: boolean): BonusGameCardState {
  if (row.status === 'archived') return 'archived';
  if (
    !hasAmateurAccess &&
    (row.category_position === null ||
      Number(row.category_position) > BEGINNER_BONUS_GAME_LIMIT_PER_SKILL)
  ) {
    return 'level_locked';
  }
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
  const access = await resolveAmateurAccess(db, userId);

  const { rows } = await db.query<CatalogRow>(
    `with active_positions as (
       select id,
              row_number() over (partition by skill_code order by sort_order, id)::int
                as category_position
         from bonus_game
        where status = 'active'
     ), catalog_games as (
       select bg.*,
              active_positions.category_position,
              case when bg.status = 'active' then (
                select previous.id
                  from bonus_game previous
                 where previous.status = 'active'
                   and previous.skill_code = bg.skill_code
                   and (previous.sort_order, previous.id) < (bg.sort_order, bg.id)
                 order by previous.sort_order desc, previous.id desc
                 limit 1
              ) else null end as predecessor_id
             ,case when bg.status = 'active' then (
                select previous.title
                  from bonus_game previous
                 where previous.status = 'active'
                   and previous.skill_code = bg.skill_code
                   and (previous.sort_order, previous.id) < (bg.sort_order, bg.id)
                 order by previous.sort_order desc, previous.id desc
                 limit 1
              ) else null end as predecessor_title
         from bonus_game bg
         left join active_positions on active_positions.id = bg.id
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
            attempt.reward_snapshot as attempt_reward_snapshot,
            game.category_position
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
    const state = deriveCardState(row, access.hasFullAccess);
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
