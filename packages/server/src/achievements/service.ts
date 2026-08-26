import type { Pool, PoolClient } from 'pg';

type Queryable = Pool | PoolClient;

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
  isUnlocked: boolean;
  unlockedAt?: string;
}

interface AchievementRow {
  id: string;
  photo_url: string;
  title: string;
  description: string;
  requirement: string;
  unlocked_at: Date | null;
}

const STAT_ACHIEVEMENT_RULES = [
  {
    id: 'first-goal',
    isSatisfied: (stats: AchievementStats) => stats.lifetimeGoals >= 1,
  },
  {
    id: 'amateur-ticket',
    isSatisfied: (stats: AchievementStats) => stats.lifetimeGoals >= 1000,
  },
  {
    id: 'pro-ticket',
    isSatisfied: (stats: AchievementStats) => stats.level >= 3,
  },
] as const;

export async function grantAchievements(
  db: Queryable,
  userId: string,
  achievementIds: string[],
): Promise<void> {
  if (achievementIds.length === 0) return;

  await db.query(
    `insert into user_achievements (user_id, achievement_id)
       select $1::uuid, a.id
         from achievements a
         join unnest($2::text[]) as unlocked(id) on unlocked.id = a.id
      on conflict do nothing`,
    [userId, achievementIds],
  );
}

export async function grantStatAchievements(
  db: Queryable,
  userId: string,
  stats: AchievementStats,
): Promise<void> {
  const achievementIds = STAT_ACHIEVEMENT_RULES.filter((rule) => rule.isSatisfied(stats)).map(
    (rule) => rule.id,
  );
  await grantAchievements(db, userId, achievementIds);
}

export async function fetchProfileAchievements(
  db: Queryable,
  userId: string,
  stats: AchievementStats,
): Promise<ProfileAchievementDTO[]> {
  await grantStatAchievements(db, userId, stats);

  const { rows } = await db.query<AchievementRow>(
    `select a.id, a.photo_url, a.title, a.description, a.requirement, ua.unlocked_at
       from achievements a
       left join user_achievements ua
         on ua.achievement_id = a.id and ua.user_id = $1
      order by a.sort_order asc`,
    [userId],
  );

  return rows.map((row) => ({
    id: row.id,
    photoUrl: row.photo_url,
    title: row.title,
    description: row.description,
    requirement: row.requirement,
    isUnlocked: row.unlocked_at !== null,
    ...(row.unlocked_at !== null ? { unlockedAt: row.unlocked_at.toISOString() } : {}),
  }));
}
