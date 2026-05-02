import type { Pool, PoolClient } from 'pg';
import { fetchProfileAchievements, type ProfileAchievementDTO } from '../achievements/service.js';

type Queryable = Pool | PoolClient;

export type CompetitionLevel = 'beginner' | 'amateur' | 'professional';

export interface ProfileStatsDTO {
  shots: number;
  goals: number;
  accuracy: number;
  playStreakDays: number;
}

export interface ProfileProgressDTO {
  competitionLevel: CompetitionLevel;
  stats: ProfileStatsDTO;
  achievements: ProfileAchievementDTO[];
}

export interface ProfileProgressRow {
  id: string;
  level: number | string;
  timezone: string;
  lifetime_shots_total: number | string;
  lifetime_goals_total: number | string;
}

function toNumber(value: number | string): number {
  return typeof value === 'number' ? value : Number(value);
}

export function resolveCompetitionLevel(level: number, lifetimeGoals: number): CompetitionLevel {
  if (level >= 3) return 'professional';
  if (level >= 2 || lifetimeGoals >= 1000) return 'amateur';
  return 'beginner';
}

export async function fetchPlayStreakDays(
  db: Queryable,
  userId: string,
  timezone: string,
): Promise<number> {
  const { rows } = await db.query<{ days: number }>(
    `with activity_days as (
       select distinct (created_at at time zone $2)::date as day
         from shot_session
        where user_id = $1
     ),
     params as (
       select (now() at time zone $2)::date as today
     ),
     anchor as (
       select max(ad.day) as day
         from activity_days ad
         cross join params p
        where ad.day between p.today - 1 and p.today
     ),
     ordered as (
       select ad.day,
              row_number() over (order by ad.day desc) as rn
         from activity_days ad
         cross join anchor a
        where a.day is not null
          and ad.day <= a.day
     )
     select count(*)::int as days
       from ordered o
       cross join anchor a
      where o.day = a.day - (o.rn::int - 1)`,
    [userId, timezone],
  );
  return Number(rows[0]?.days ?? 0);
}

export async function buildProfileProgress(
  db: Queryable,
  row: ProfileProgressRow,
): Promise<ProfileProgressDTO> {
  const level = toNumber(row.level);
  const shots = toNumber(row.lifetime_shots_total);
  const goals = toNumber(row.lifetime_goals_total);
  const accuracy = shots > 0 ? Math.round((goals / shots) * 100) : 0;
  const playStreakDays = await fetchPlayStreakDays(db, row.id, row.timezone);
  const achievements = await fetchProfileAchievements(db, row.id, {
    lifetimeShots: shots,
    lifetimeGoals: goals,
    level,
  });

  return {
    competitionLevel: resolveCompetitionLevel(level, goals),
    stats: {
      shots,
      goals,
      accuracy,
      playStreakDays,
    },
    achievements,
  };
}
