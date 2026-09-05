import type { Pool, PoolClient } from 'pg';
import {
  fetchAchievementCatalogueForUser,
  grantStatAchievements,
  type ProfileAchievementDTO,
} from '../achievements/service.js';
import { getGameSettings } from '../duel/gameSettings.js';

type Queryable = Pool | PoolClient;

export type CompetitionLevel = 'beginner' | 'amateur' | 'professional';

export interface ProfileStatsDTO {
  shots: number;
  goals: number;
  accuracy: number;
  playStreakDays: number;
  bestPlayStreakDays: number;
}

export interface ProfileProgressDTO {
  competitionLevel: CompetitionLevel;
  stats: ProfileStatsDTO;
  achievements: ProfileAchievementDTO[];
  unclaimedAchievementsCount: number;
}

export interface TrophySummaryDTO {
  regularSeasonWins: number;
  tournamentChampionships: number;
  tournamentPodiums: number;
  completedChallenges: number;
}

export async function fetchTrophySummary(db: Queryable, userId: string): Promise<TrophySummaryDTO> {
  const { rows } = await db.query<{
    regular_season_wins: number;
    tournament_championships: number;
    tournament_podiums: number;
    completed_challenges: number;
  }>(
    `with completed_playoff_finals as (
       select distinct on (series.tournament_id)
              series.tournament_id,
              series.higher_seed_participant_id,
              series.lower_seed_participant_id,
              series.winner_participant_id
         from tournament_playoff_series series
         join tournament_round round_record on round_record.id = series.round_id
        where series.kind = 'championship' and series.status = 'completed'
        order by series.tournament_id, round_record.number desc
     ),
     playoff_podiums as (
       select final.tournament_id,
              case
                when final.winner_participant_id = final.higher_seed_participant_id
                  then final.lower_seed_participant_id
                else final.higher_seed_participant_id
              end as participant_id
         from completed_playoff_finals final
       union all
       select series.tournament_id, series.winner_participant_id
         from tournament_playoff_series series
        where series.kind = 'third_place' and series.status = 'completed'
     )
     select
       (select count(*)::int
          from tournament_standing standing
          join tournament_participant participant on participant.id = standing.participant_id
          join tournament tournament_record on tournament_record.id = standing.tournament_id
         where participant.user_id = $1 and standing.rank = 1
           and tournament_record.status = 'completed') as regular_season_wins,
       (select count(distinct final.tournament_id)::int
          from completed_playoff_finals final
          join tournament_participant winner on winner.id = final.winner_participant_id
         where winner.user_id = $1) as tournament_championships,
       (select count(distinct podium.tournament_id)::int
          from playoff_podiums podium
          join tournament_participant participant on participant.id = podium.participant_id
         where participant.user_id = $1) as tournament_podiums,
       (select count(*)::int from weekly_challenge_reward_claims where user_id = $1)
         as completed_challenges`,
    [userId],
  );
  const row = rows[0]!;
  return {
    regularSeasonWins: Number(row.regular_season_wins),
    tournamentChampionships: Number(row.tournament_championships),
    tournamentPodiums: Number(row.tournament_podiums),
    completedChallenges: Number(row.completed_challenges),
  };
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

export function resolveCompetitionLevel(
  level: number,
  lifetimeGoals: number,
  amateurUnlockGoalsRequired = 300,
): CompetitionLevel {
  if (level >= 3) return 'professional';
  if (level >= 2 || lifetimeGoals >= amateurUnlockGoalsRequired) return 'amateur';
  return 'beginner';
}

export async function fetchPlayStreakDays(
  db: Queryable,
  userId: string,
  timezone: string,
): Promise<number> {
  const stats = await fetchPlayStreakStats(db, userId, timezone);
  return stats.currentDays;
}

export async function fetchPlayStreakStats(
  db: Queryable,
  userId: string,
  timezone: string,
): Promise<{ currentDays: number; bestDays: number }> {
  const { rows } = await db.query<{ current_days: number; best_days: number }>(
    `with activity_days as (
       select distinct (created_at at time zone $2)::date as day
         from shot_session
        where user_id = $1
          and mode in ('daily', 'amateur_duel', 'tournament_classic')
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
     ),
     current_streak as (
       select count(*)::int as days
         from ordered o
         cross join anchor a
        where o.day = a.day - (o.rn::int - 1)
     ),
     grouped_days as (
       select ad.day,
              ad.day - (row_number() over (order by ad.day))::int as streak_group
         from activity_days ad
     ),
     streaks as (
       select count(*)::int as days
         from grouped_days
        group by streak_group
     )
     select coalesce((select days from current_streak), 0)::int as current_days,
            coalesce((select max(days) from streaks), 0)::int as best_days`,
    [userId, timezone],
  );
  const row = rows[0];
  return {
    currentDays: Number(row?.current_days ?? 0),
    bestDays: Number(row?.best_days ?? 0),
  };
}

export async function buildProfileProgress(
  db: Queryable,
  row: ProfileProgressRow,
): Promise<ProfileProgressDTO> {
  const level = toNumber(row.level);
  const shots = toNumber(row.lifetime_shots_total);
  const goals = toNumber(row.lifetime_goals_total);
  const accuracy = shots > 0 ? Math.round((goals / shots) * 100) : 0;
  await grantStatAchievements(db, row.id, {
    lifetimeShots: shots,
    lifetimeGoals: goals,
    level,
  });

  const [settings, playStreakStats, achievements, unclaimedAchievementsCount] = await Promise.all([
    getGameSettings(db),
    fetchPlayStreakStats(db, row.id, row.timezone),
    fetchAchievementCatalogueForUser(db, row.id, { claimedOnly: true }),
    fetchUnclaimedAchievementCount(db, row.id),
  ]);

  return {
    competitionLevel: resolveCompetitionLevel(level, goals, settings.amateur.unlockGoalsRequired),
    stats: {
      shots,
      goals,
      accuracy,
      playStreakDays: playStreakStats.currentDays,
      bestPlayStreakDays: playStreakStats.bestDays,
    },
    achievements,
    unclaimedAchievementsCount,
  };
}

export async function fetchUnclaimedAchievementCount(
  db: Queryable,
  userId: string,
): Promise<number> {
  const { rows } = await db.query<{ count: number | string }>(
    `select count(*)::int as count
       from user_achievements
      where user_id = $1 and claimed_at is null`,
    [userId],
  );
  return Number(rows[0]?.count ?? 0);
}
