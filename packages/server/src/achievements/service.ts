import type { Pool, PoolClient } from 'pg';
import { getGameSettings } from '../duel/gameSettings.js';
import { observeAchievementStage, openFirstAchievementStages } from './stageProgress.js';
import { ACTIVITY_STREAK_CTES } from '../profile/activityStreak.js';

type Queryable = Pool | PoolClient;

export interface AchievementCompletionCandidate {
  userId: string;
  achievementId: string;
  achievedAt: Date;
  context: Record<string, unknown>;
}

export type AchievementStatus = 'locked' | 'completed_unclaimed' | 'claimed';
export type AchievementAvailability = 'active' | 'future' | 'hidden';

export interface AchievementStats {
  lifetimeShots: number;
  lifetimeGoals: number;
  level: number;
}

export interface ProfileAchievementDTO {
  id: string;
  photoUrl: string;
  title: string;
  description: string;
  requirement: string;
  category: string;
  availability: AchievementAvailability;
  futureTag: string | null;
  rewardCurrency: number;
  rewardStars: number;
  rewardExperience: number;
  rewardTokens: number;
  status: AchievementStatus;
  isUnlocked: boolean;
  isClaimable: boolean;
  completedAt?: string;
  claimedAt?: string;
  stage?: {
    current: number;
    total: number;
    requirement: string;
    progressValue: number;
    targetValue: number;
    history: Array<{ stageNumber: number; claimedAt: string; requirement: string }>;
  };
}

interface AchievementRow {
  id: string;
  photo_url: string;
  title: string;
  description: string;
  requirement: string;
  category: string;
  availability: AchievementAvailability;
  future_tag: string | null;
  reward_currency: number | string;
  reward_stars: number | string;
  reward_experience: number | string;
  reward_tokens: number | string;
  completed_at: Date | null;
  claimed_at: Date | null;
  stage_number: number | null;
  stage_total: number | string | null;
  stage_requirement: string | null;
  stage_target: Record<string, number | string | boolean> | null;
  stage_progress: Record<string, number | string | boolean> | null;
  stage_reward_currency: number | string | null;
  stage_reward_stars: number | string | null;
  stage_reward_experience: number | string | null;
  stage_reward_tokens: number | string | null;
  stage_completed_at: Date | null;
  stage_claimed_at: Date | null;
  stage_history: Array<{ stageNumber: number; claimedAt: string; requirement: string }> | null;
}

const STAT_ACHIEVEMENT_RULES = [
  {
    id: 'first-goal',
    isSatisfied: (stats: AchievementStats) => stats.lifetimeGoals >= 1,
  },
] as const;

function mapAchievementRow(row: AchievementRow): ProfileAchievementDTO {
  const isTiered = row.stage_number !== null;
  const completedAt = isTiered ? row.stage_completed_at : row.completed_at;
  const claimedAt = isTiered ? row.stage_claimed_at : row.claimed_at;
  const status: AchievementStatus =
    completedAt === null ? 'locked' : claimedAt === null ? 'completed_unclaimed' : 'claimed';

  const targetEntries = Object.entries(row.stage_target ?? {}).filter(
    ([, value]) => typeof value === 'number',
  ) as Array<[string, number]>;
  const targetEntry = targetEntries.find(([key]) =>
    [
      'total',
      'goalStreak',
      'accuracyPercent',
      'minimumFirstTwoGoals',
      'endingGoalStreak',
      'recoveryGoalStreak',
      'days',
      'openingGoalStreak',
      'minimumExperienceDifference',
      'wins',
      'minimumMargin',
      'goals',
      'maximumNonGoals',
    ].includes(key),
  );
  const progressValue = Number(
    targetEntry === undefined ? 0 : (row.stage_progress?.[targetEntry[0]] ?? 0),
  );

  return {
    id: row.id,
    photoUrl: row.photo_url,
    title: row.title,
    description: row.description,
    requirement: row.stage_requirement ?? row.requirement,
    category: row.category,
    availability: row.availability,
    futureTag: row.future_tag,
    rewardCurrency: Number(row.stage_reward_currency ?? row.reward_currency),
    rewardStars: Number(row.stage_reward_stars ?? row.reward_stars),
    rewardExperience: Number(row.stage_reward_experience ?? row.reward_experience),
    rewardTokens: Number(row.stage_reward_tokens ?? row.reward_tokens),
    status,
    isUnlocked: completedAt !== null,
    isClaimable: status === 'completed_unclaimed',
    ...(completedAt !== null ? { completedAt: completedAt.toISOString() } : {}),
    ...(claimedAt !== null ? { claimedAt: claimedAt.toISOString() } : {}),
    ...(isTiered
      ? {
          stage: {
            current: row.stage_number!,
            total: Number(row.stage_total ?? 0),
            requirement: row.stage_requirement!,
            progressValue,
            targetValue: targetEntry?.[1] ?? 0,
            history: (row.stage_history ?? []).map((history) => ({
              ...history,
              claimedAt: new Date(history.claimedAt).toISOString(),
            })),
          },
        }
      : {}),
  };
}

export async function completeAchievements(
  db: Queryable,
  userId: string,
  achievementIds: string[],
  context: Record<string, unknown> = {},
): Promise<void> {
  const achievedAt = new Date();
  await completeAchievementCandidates(
    db,
    achievementIds.map((achievementId) => ({ userId, achievementId, achievedAt, context })),
  );
}

export async function completeAchievementCandidates(
  db: Queryable,
  candidates: readonly AchievementCompletionCandidate[],
): Promise<{ attempted: number; inserted: number }> {
  const uniqueCandidates = new Map<string, AchievementCompletionCandidate>();
  for (const candidate of candidates) {
    const key = `${candidate.userId}\u0000${candidate.achievementId}`;
    const existing = uniqueCandidates.get(key);
    if (existing === undefined || candidate.achievedAt < existing.achievedAt) {
      uniqueCandidates.set(key, candidate);
    }
  }

  if (uniqueCandidates.size === 0) return { attempted: 0, inserted: 0 };

  const payload = [...uniqueCandidates.values()].map((candidate) => ({
    user_id: candidate.userId,
    achievement_id: candidate.achievementId,
    achieved_at: candidate.achievedAt.toISOString(),
    context: candidate.context,
  }));
  const result = await db.query(
    `insert into user_achievements
       (user_id, achievement_id, completed_at, completion_context)
     select candidate.user_id, candidate.achievement_id, candidate.achieved_at, candidate.context
       from jsonb_to_recordset($1::jsonb) as candidate(
         user_id uuid,
         achievement_id text,
         achieved_at timestamptz,
         context jsonb
       )
       join achievements achievement on achievement.id = candidate.achievement_id
      where achievement.availability = 'active'
     on conflict (user_id, achievement_id) do nothing
     returning achievement_id`,
    [JSON.stringify(payload)],
  );

  return { attempted: uniqueCandidates.size, inserted: result.rowCount ?? 0 };
}

export const grantAchievements = completeAchievements;

export async function grantStatAchievements(
  db: Queryable,
  userId: string,
  stats: AchievementStats,
): Promise<void> {
  const achievementIds: string[] = STAT_ACHIEVEMENT_RULES.filter((rule) =>
    rule.isSatisfied(stats),
  ).map((rule) => rule.id);
  const settings = await getGameSettings(db);
  if (stats.lifetimeGoals >= settings.amateur.unlockGoalsRequired) {
    achievementIds.push('amateur-ticket');
  }
  if (await hasPaidPurchase(db, userId)) achievementIds.push('wallet');
  await completeAchievements(db, userId, achievementIds, { source: 'stats', stats });
}

async function hasPaidPurchase(db: Queryable, userId: string): Promise<boolean> {
  const { rows } = await db.query<{ exists: boolean }>(
    `select exists (
       select 1
         from payments
        where user_id = $1
          and status = 'paid'
     ) as exists`,
    [userId],
  );
  return rows[0]?.exists === true;
}

export async function fetchAchievementCatalogueForUser(
  db: Queryable,
  userId: string,
  opts: { includeHidden?: boolean; claimedOnly?: boolean } = {},
): Promise<ProfileAchievementDTO[]> {
  await openFirstAchievementStages(db, userId, new Date());
  const clauses = [opts.includeHidden === true ? 'true' : `a.availability <> 'hidden'`];
  if (opts.claimedOnly === true) {
    clauses.push('(ua.claimed_at is not null or stage_state.stage_claimed_at is not null)');
  }

  const { rows } = await db.query<AchievementRow>(
    `select a.id, a.photo_url, a.title, a.description, a.requirement,
            a.category, a.availability, a.future_tag,
            a.reward_currency, a.reward_stars, a.reward_experience, a.reward_tokens,
            ua.completed_at, ua.claimed_at,
            stage_state.stage_number, stage_state.stage_total,
            stage_state.stage_requirement, stage_state.stage_target, stage_state.stage_progress,
            stage_state.stage_reward_currency, stage_state.stage_reward_stars,
            stage_state.stage_reward_experience, stage_state.stage_reward_tokens,
            stage_state.stage_completed_at, stage_state.stage_claimed_at,
            coalesce(stage_history.history, '[]'::jsonb) as stage_history
       from achievements a
       left join user_achievements ua
         on ua.achievement_id = a.id and ua.user_id = $1
       left join lateral (
         select user_stage.stage_number,
                (select count(*) from achievement_stages count_stage
                  where count_stage.achievement_id = a.id and count_stage.is_enabled) as stage_total,
                stage.requirement as stage_requirement,
                stage.target as stage_target,
                user_stage.progress as stage_progress,
                stage.reward_currency as stage_reward_currency,
                stage.reward_stars as stage_reward_stars,
                stage.reward_experience as stage_reward_experience,
                stage.reward_tokens as stage_reward_tokens,
                user_stage.completed_at as stage_completed_at,
                user_stage.claimed_at as stage_claimed_at
           from user_achievement_stages user_stage
           join achievement_stages stage
             on stage.achievement_id = user_stage.achievement_id
            and stage.stage_number = user_stage.stage_number
          where user_stage.user_id = $1 and user_stage.achievement_id = a.id
          order by (user_stage.claimed_at is null) desc, user_stage.stage_number desc
          limit 1
       ) stage_state on true
       left join lateral (
         select jsonb_agg(
                  jsonb_build_object(
                    'stageNumber', history_stage.stage_number,
                    'claimedAt', history_stage.claimed_at,
                    'requirement', definition.requirement
                  ) order by history_stage.stage_number
                ) as history
           from user_achievement_stages history_stage
           join achievement_stages definition
             on definition.achievement_id = history_stage.achievement_id
            and definition.stage_number = history_stage.stage_number
          where history_stage.user_id = $1
            and history_stage.achievement_id = a.id
            and history_stage.claimed_at is not null
       ) stage_history on true
      where ${clauses.join(' and ')}
      order by a.sort_order asc`,
    [userId],
  );

  return rows.map(mapAchievementRow);
}

export interface CareerGoalObservation {
  eventKey: string;
  occurredAt: Date;
  mode: string;
  lifetimeTotal: number;
}

const CAREER_GOAL_MODES = new Set(['daily', 'amateur_duel', 'tournament_classic']);

export async function observeCareerGoal(
  db: Queryable,
  userId: string,
  observation: CareerGoalObservation,
): Promise<{ completed: boolean; stageNumber: number | null }> {
  if (!CAREER_GOAL_MODES.has(observation.mode)) {
    return { completed: false, stageNumber: null };
  }
  return observeAchievementStage(db, userId, 'career-goals', {
    eventKey: observation.eventKey,
    occurredAt: observation.occurredAt,
    progress: { total: observation.lifetimeTotal },
    context: { mode: observation.mode },
  });
}

export async function observeCareerExperience(
  db: Queryable,
  userId: string,
  observation: { eventKey: string; occurredAt: Date; lifetimeTotal: number },
) {
  return observeAchievementStage(db, userId, 'career-experience', {
    eventKey: observation.eventKey,
    occurredAt: observation.occurredAt,
    progress: { total: observation.lifetimeTotal },
  });
}

export async function observeCareerStreak(
  db: Queryable,
  userId: string,
  observation: { eventKey: string; occurredAt: Date; recordDays: number },
) {
  return observeAchievementStage(db, userId, 'career-streak', {
    eventKey: observation.eventKey,
    occurredAt: observation.occurredAt,
    progress: { days: observation.recordDays },
  });
}

export async function observeCareerActivityStreak(db: Queryable, userId: string, occurredAt: Date) {
  const { rows } = await db.query<{ activity_day: string; best_days: number }>(
    `with ${ACTIVITY_STREAK_CTES}
     select (date_trunc('day', $2::timestamptz at time zone users.timezone))::date::text as activity_day,
            coalesce(historical_streaks.best_days, 0)::int as best_days
       from users
       left join historical_streaks on historical_streaks.user_id = users.id
      where users.id = $1`,
    [userId, occurredAt],
  );
  const row = rows[0];
  if (!row) return { completed: false, stageNumber: null };
  return observeCareerStreak(db, userId, {
    eventKey: `activity-day:${row.activity_day}`,
    occurredAt,
    recordDays: Number(row.best_days),
  });
}

export async function fetchProfileAchievements(
  db: Queryable,
  userId: string,
  stats: AchievementStats,
): Promise<ProfileAchievementDTO[]> {
  await grantStatAchievements(db, userId, stats);
  return fetchAchievementCatalogueForUser(db, userId);
}
