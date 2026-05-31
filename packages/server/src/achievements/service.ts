import type { Pool, PoolClient } from 'pg';

type Queryable = Pool | PoolClient;

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
  status: AchievementStatus;
  isUnlocked: boolean;
  isClaimable: boolean;
  completedAt?: string;
  claimedAt?: string;
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
  completed_at: Date | null;
  claimed_at: Date | null;
}

const STAT_ACHIEVEMENT_RULES = [
  {
    id: 'first-goal',
    isSatisfied: (stats: AchievementStats) => stats.lifetimeGoals >= 1,
  },
  {
    id: 'amateur-ticket',
    isSatisfied: (stats: AchievementStats) => stats.lifetimeGoals >= 300,
  },
] as const;

function mapAchievementRow(row: AchievementRow): ProfileAchievementDTO {
  const status: AchievementStatus =
    row.completed_at === null ? 'locked' : row.claimed_at === null ? 'completed_unclaimed' : 'claimed';

  return {
    id: row.id,
    photoUrl: row.photo_url,
    title: row.title,
    description: row.description,
    requirement: row.requirement,
    category: row.category,
    availability: row.availability,
    futureTag: row.future_tag,
    rewardCurrency: Number(row.reward_currency),
    rewardStars: Number(row.reward_stars),
    rewardExperience: Number(row.reward_experience),
    status,
    isUnlocked: row.completed_at !== null,
    isClaimable: status === 'completed_unclaimed',
    ...(row.completed_at !== null ? { completedAt: row.completed_at.toISOString() } : {}),
    ...(row.claimed_at !== null ? { claimedAt: row.claimed_at.toISOString() } : {}),
  };
}

export async function completeAchievements(
  db: Queryable,
  userId: string,
  achievementIds: string[],
  context: Record<string, unknown> = {},
): Promise<void> {
  if (achievementIds.length === 0) return;

  await db.query(
    `insert into user_achievements (user_id, achievement_id, completed_at, completion_context)
       select $1::uuid, a.id, now(), $3::jsonb
         from achievements a
         join unnest($2::text[]) as completed(id) on completed.id = a.id
        where a.availability = 'active'
      on conflict (user_id, achievement_id) do nothing`,
    [userId, achievementIds, JSON.stringify(context)],
  );
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
  const clauses = [opts.includeHidden === true ? 'true' : `a.availability <> 'hidden'`];
  if (opts.claimedOnly === true) clauses.push('ua.claimed_at is not null');

  const { rows } = await db.query<AchievementRow>(
    `select a.id, a.photo_url, a.title, a.description, a.requirement,
            a.category, a.availability, a.future_tag,
            a.reward_currency, a.reward_stars, a.reward_experience,
            ua.completed_at, ua.claimed_at
       from achievements a
       left join user_achievements ua
         on ua.achievement_id = a.id and ua.user_id = $1
      where ${clauses.join(' and ')}
      order by a.sort_order asc`,
    [userId],
  );

  return rows.map(mapAchievementRow);
}

export async function fetchProfileAchievements(
  db: Queryable,
  userId: string,
  stats: AchievementStats,
): Promise<ProfileAchievementDTO[]> {
  await grantStatAchievements(db, userId, stats);
  return fetchAchievementCatalogueForUser(db, userId);
}
