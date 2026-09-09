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

export interface TournamentTrophyDetailDTO {
  id: string;
  title: string;
  imageUrl: string | null;
  startsAt: string | null;
  endsAt: string | null;
  result: string;
}

export interface ChallengeTrophyDetailDTO {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  tasks: Array<{ title: string; target: number }>;
}

export interface TrophyDetailsDTO {
  regularSeasonWins: TournamentTrophyDetailDTO[];
  tournamentChampionships: TournamentTrophyDetailDTO[];
  tournamentPodiums: TournamentTrophyDetailDTO[];
  completedChallenges: ChallengeTrophyDetailDTO[];
}

export async function fetchTrophySummary(db: Queryable, userId: string): Promise<TrophySummaryDTO> {
  const { rows } = await db.query<{
    regular_season_wins: number;
    tournament_championships: number;
    tournament_podiums: number;
    completed_challenges: number;
  }>(
    `with playoff_finals as (
       select distinct on (series.tournament_id)
              series.tournament_id,
              series.higher_seed_participant_id,
              series.lower_seed_participant_id,
              series.winner_participant_id,
              series.status
         from tournament_playoff_series series
         join tournament_round round_record on round_record.id = series.round_id
        where series.kind = 'championship'
          and round_record.stage = 'playoff'
          and round_record.number = (
            select max(final_round.number)
              from tournament_round final_round
             where final_round.tournament_id = series.tournament_id
               and final_round.stage = 'playoff'
          )
        order by series.tournament_id, series.bracket_position, series.id
     ),
     completed_playoff_finals as (
       select tournament_id,
              higher_seed_participant_id,
              lower_seed_participant_id,
              winner_participant_id
         from playoff_finals
        where status = 'completed'
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
           and tournament_record.status = 'completed') +
       (select count(*)::int
          from tournament_placement_history history
         where history.user_id = $1 and history.stage = 'regular' and history.place = 1
           and not exists (
             select 1 from tournament where tournament.id = history.source_tournament_id
           )) as regular_season_wins,
       (select count(distinct final.tournament_id)::int
          from completed_playoff_finals final
          join tournament_participant winner on winner.id = final.winner_participant_id
         where winner.user_id = $1) +
       (select count(*)::int
          from tournament_placement_history history
         where history.user_id = $1 and history.stage = 'playoff' and history.place = 1
           and not exists (
             select 1 from tournament where tournament.id = history.source_tournament_id
           )) as tournament_championships,
       (select count(*)::int
          from tournament_standing standing
          join tournament_participant participant on participant.id = standing.participant_id
          join tournament tournament_record on tournament_record.id = standing.tournament_id
         where participant.user_id = $1 and standing.rank in (2, 3)
           and tournament_record.status = 'completed') +
       (select count(*)::int
          from playoff_podiums podium
          join tournament_participant participant on participant.id = podium.participant_id
         where participant.user_id = $1) +
       (select count(*)::int
          from tournament_placement_history history
         where history.user_id = $1 and history.place in (2, 3)
           and not exists (
             select 1 from tournament where tournament.id = history.source_tournament_id
           )) as tournament_podiums,
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

export async function fetchTrophyDetails(db: Queryable, userId: string): Promise<TrophyDetailsDTO> {
  const { rows: tournamentRows } = await db.query<{
    category: 'regularSeasonWins' | 'tournamentChampionships' | 'tournamentPodiums';
    id: string;
    title: string;
    image_url: string | null;
    starts_at: Date | null;
    ends_at: Date | null;
    result: string;
  }>(
    `with playoff_finals as (
       select distinct on (series.tournament_id)
              series.tournament_id, series.higher_seed_participant_id,
              series.lower_seed_participant_id, series.winner_participant_id,
              series.status, round_record.ends_at
         from tournament_playoff_series series
         join tournament_round round_record on round_record.id = series.round_id
        where series.kind = 'championship'
          and round_record.stage = 'playoff'
          and round_record.number = (
            select max(final_round.number)
              from tournament_round final_round
             where final_round.tournament_id = series.tournament_id
               and final_round.stage = 'playoff'
          )
        order by series.tournament_id, series.bracket_position, series.id
     ), awards as (
       select standing.tournament_id, participant.user_id, 'regularSeasonWins'::text as category,
              'Победа в регулярном чемпионате'::text as result
         from tournament_standing standing
         join tournament_participant participant on participant.id = standing.participant_id
         join tournament tournament_record on tournament_record.id = standing.tournament_id
        where standing.rank = 1 and tournament_record.status = 'completed'
       union all
       select standing.tournament_id, participant.user_id, 'tournamentPodiums'::text,
              case standing.rank when 2 then '2-е место в регулярном чемпионате'
                                 else '3-е место в регулярном чемпионате' end
         from tournament_standing standing
         join tournament_participant participant on participant.id = standing.participant_id
         join tournament tournament_record on tournament_record.id = standing.tournament_id
        where standing.rank in (2, 3) and tournament_record.status = 'completed'
       union all
       select final.tournament_id, winner.user_id, 'tournamentChampionships'::text, 'Победа в финале'
         from playoff_finals final
         join tournament_participant winner on winner.id = final.winner_participant_id
        where final.status = 'completed'
       union all
       select final.tournament_id, finalist.user_id, 'tournamentPodiums'::text, '2-е место'
         from playoff_finals final
         join tournament_participant finalist on finalist.id = case
           when final.winner_participant_id = final.higher_seed_participant_id
             then final.lower_seed_participant_id else final.higher_seed_participant_id end
        where final.status = 'completed'
       union all
       select series.tournament_id, participant.user_id, 'tournamentPodiums'::text, '3-е место'
         from tournament_playoff_series series
         join tournament_participant participant on participant.id = series.winner_participant_id
        where series.kind = 'third_place' and series.status = 'completed'
       union all
       select history.source_tournament_id, history.user_id,
              case
                when history.stage = 'regular' and history.place = 1 then 'regularSeasonWins'::text
                when history.stage = 'playoff' and history.place = 1 then 'tournamentChampionships'::text
                else 'tournamentPodiums'::text
              end,
              case
                when history.stage = 'regular' and history.place = 1
                  then 'Победа в регулярном чемпионате'
                when history.stage = 'regular' then history.place || '-е место в регулярном чемпионате'
                when history.place = 1 then 'Победа в финале'
                else history.place || '-е место'
              end
         from tournament_placement_history history
        where history.place <= 3
          and not exists (
            select 1 from tournament where tournament.id = history.source_tournament_id
          )
     )
     select awards.category, awards.tournament_id as id,
            coalesce(tournament_record.title, history.tournament_title) as title,
            coalesce(tournament_record.image_url, history.tournament_image_url) as image_url,
            coalesce(tournament_record.starts_at, tournament_schedule.starts_at,
                     history.tournament_starts_at) as starts_at,
            coalesce(tournament_schedule.ends_at, tournament_record.completed_at,
                     history.tournament_ends_at) as ends_at,
            awards.result
       from awards
       left join tournament tournament_record on tournament_record.id = awards.tournament_id
       left join tournament_placement_history history
         on history.source_tournament_id = awards.tournament_id
        and history.user_id = awards.user_id
        and history.stage = case when awards.category = 'regularSeasonWins'
                               then 'regular' else 'playoff' end
       left join lateral (
         select min(schedule_window.starts_at) as starts_at, max(schedule_window.ends_at) as ends_at
           from (
             select round_record.starts_at, round_record.ends_at
               from tournament_round round_record
              where round_record.tournament_id = tournament_record.id
             union all
             select matchday.starts_at, matchday.ends_at
               from tournament_matchday matchday
              where matchday.tournament_id = tournament_record.id
             union all
             select fixture.scheduled_starts_at,
                    coalesce(fixture.window_ends_at, fixture.scheduled_starts_at)
               from tournament_fixture fixture
              where fixture.tournament_id = tournament_record.id
           ) schedule_window
       ) tournament_schedule on true
      where awards.user_id = $1
      order by coalesce(tournament_record.completed_at, history.tournament_ends_at) desc nulls last,
               coalesce(tournament_record.starts_at, history.tournament_starts_at) desc nulls last,
               awards.tournament_id desc`,
    [userId],
  );
  const { rows: challengeRows } = await db.query<{
    id: string;
    title: string;
    start_at: Date;
    end_at: Date;
    tasks: Array<{ title: string; target: number }>;
  }>(
    `select challenge.id, challenge.title, challenge.start_at, challenge.end_at,
            jsonb_agg(jsonb_build_object(
              'title', coalesce(nullif(task.title, ''), case task.type
                when 'goals_scored' then 'Забросить шайбы'
                when 'duels_played' then 'Сыграть дуэли'
                when 'duels_won' then 'Победить в дуэлях'
                when 'duel_invites_sent' then 'Пригласить соперников'
                else 'Завершить тренировки' end),
              'target', task.target
            ) order by task.sort_order asc, task.created_at asc) as tasks
       from weekly_challenge_reward_claims claim
       join weekly_challenges challenge on challenge.id = claim.challenge_id
       join weekly_challenge_tasks task on task.challenge_id = challenge.id
      where claim.user_id = $1
      group by challenge.id
      order by challenge.end_at desc, challenge.start_at desc`,
    [userId],
  );
  const details: TrophyDetailsDTO = {
    regularSeasonWins: [],
    tournamentChampionships: [],
    tournamentPodiums: [],
    completedChallenges: challengeRows.map((row) => ({
      id: row.id,
      title: row.title,
      startsAt: row.start_at.toISOString(),
      endsAt: row.end_at.toISOString(),
      tasks: row.tasks,
    })),
  };
  for (const row of tournamentRows) {
    details[row.category].push({
      id: `${row.id}:${row.result}`,
      title: row.title,
      imageUrl: row.image_url,
      startsAt: row.starts_at?.toISOString() ?? null,
      endsAt: row.ends_at?.toISOString() ?? null,
      result: row.result,
    });
  }
  return details;
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
