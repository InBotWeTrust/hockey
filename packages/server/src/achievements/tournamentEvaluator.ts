import type { Pool, PoolClient } from 'pg';
import type { TournamentRegularSource } from '../tournament/types.js';
import { completeAchievementCandidates, type AchievementCompletionCandidate } from './service.js';
import {
  accuracyAtLeast,
  hockeySeasonKey,
  isSeriesComeback,
  reachesDeathBracket,
  type ResolvedPlayerSeries,
} from './tournamentRules.js';

type Queryable = Pool | PoolClient;
type TournamentAchievementSource = 'tournament_live' | 'tournament_backfill';

export const TOURNAMENT_ACHIEVEMENT_IDS = [
  'regular-season-champion',
  'regular-season-medalist',
  'playoff-semifinal',
  'playoff-final',
  'tournament-cup',
  'dark-horse',
  'death-bracket',
  'series-comeback',
  'no-shake',
  'tournament-streak',
] as const;

export interface TournamentAchievementDiagnostics {
  timestampFallbacks: number;
  ambiguousExperienceSeries: number;
}

interface BoundaryRow {
  status: string;
  regular_source: TournamentRegularSource;
  starts_at: Date | null;
  completed_at: Date | null;
  updated_at: Date;
  rules_snapshot: Record<string, unknown>;
}

interface SeriesRow {
  series_id: string;
  tournament_id: string;
  user_id: string;
  participant_id: string;
  opponent_participant_id: string | null;
  winner_participant_id: string | null;
  wins_required: number;
  status: string;
  completed_at: Date;
  admin_decided: boolean;
  played_wins: number;
  player_experience: number | null;
  opponent_experience: number | null;
}

function localSeasonKey(startsAt: Date, timezone: string): { key: string; fallback: boolean } {
  let activeTimezone = timezone;
  let fallback = false;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: activeTimezone }).format(startsAt);
  } catch {
    activeTimezone = 'UTC';
    fallback = true;
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: activeTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(startsAt);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((candidate) => candidate.type === type)?.value ?? 0);
  return {
    key: hockeySeasonKey(new Date(Date.UTC(part('year'), part('month') - 1, part('day')))),
    fallback,
  };
}

function candidateContext(
  source: TournamentAchievementSource,
  values: Record<string, unknown>,
): Record<string, unknown> {
  return { source, ruleVersion: 1, ...values };
}

export async function collectTournamentAchievementCandidates(
  db: Queryable,
  input: { tournamentId: string; source: TournamentAchievementSource },
): Promise<{
  candidates: AchievementCompletionCandidate[];
  diagnostics: TournamentAchievementDiagnostics;
}> {
  const diagnostics: TournamentAchievementDiagnostics = {
    timestampFallbacks: 0,
    ambiguousExperienceSeries: 0,
  };
  const boundaryResult = await db.query<BoundaryRow>(
    `select tournament.status, tournament.regular_source, tournament.starts_at,
            tournament.completed_at, tournament.updated_at, revision.rules_snapshot
       from tournament
       join tournament_revision revision on revision.id = tournament.published_revision_id
      where tournament.id = $1`,
    [input.tournamentId],
  );
  const boundary = boundaryResult.rows[0];
  if (boundary === undefined || boundary.status === 'cancelled') {
    return { candidates: [], diagnostics };
  }

  const collected = new Map<string, AchievementCompletionCandidate>();
  const add = (
    userId: string,
    achievementId: (typeof TOURNAMENT_ACHIEVEMENT_IDS)[number],
    achievedAt: Date,
    context: Record<string, unknown>,
  ) => {
    const key = `${userId}\u0000${achievementId}`;
    const next: AchievementCompletionCandidate = {
      userId,
      achievementId,
      achievedAt,
      context: candidateContext(input.source, { tournamentId: input.tournamentId, ...context }),
    };
    const existing = collected.get(key);
    if (existing === undefined || next.achievedAt < existing.achievedAt) collected.set(key, next);
  };

  const participantResult = await db.query<{ user_id: string }>(
    `select user_id from tournament_participant where tournament_id = $1`,
    [input.tournamentId],
  );
  const affectedUserIds = participantResult.rows.map((row) => row.user_id);

  if (['playoff', 'completed', 'archived'].includes(boundary.status)) {
    const regularTimestamp = await loadRegularCompletionTimestamp(
      db,
      input.tournamentId,
      boundary.regular_source,
    );
    let achievedAt = regularTimestamp;
    if (achievedAt === null) {
      const fallback = await db.query<{ achieved_at: Date | null }>(
        `select min(coalesce(round.starts_at, series.created_at)) as achieved_at
           from tournament_playoff_series series
           join tournament_round round on round.id = series.round_id
          where series.tournament_id = $1`,
        [input.tournamentId],
      );
      achievedAt = fallback.rows[0]?.achieved_at ?? boundary.updated_at;
      diagnostics.timestampFallbacks += 1;
    }
    const standings = await db.query<{ user_id: string; rank: number }>(
      `select participant.user_id, standing.rank
         from tournament_standing standing
         join tournament_participant participant on participant.id = standing.participant_id
        where standing.tournament_id = $1 and standing.rank between 1 and 3`,
      [input.tournamentId],
    );
    for (const standing of standings.rows) {
      if (Number(standing.rank) === 1) {
        add(standing.user_id, 'regular-season-champion', achievedAt, { rank: 1 });
      } else {
        add(standing.user_id, 'regular-season-medalist', achievedAt, {
          rank: Number(standing.rank),
        });
      }
    }
  }

  const assignedSeries = await db.query<{
    series_id: string;
    round_number: number;
    max_round_number: number;
    higher_user_id: string;
    lower_user_id: string;
    achieved_at: Date;
  }>(
    `select series.id as series_id, round.number as round_number,
            (select max(final_round.number)
               from tournament_playoff_series final_series
               join tournament_round final_round on final_round.id = final_series.round_id
              where final_series.tournament_id = series.tournament_id
                and final_series.kind = 'championship'
                and final_series.status <> 'cancelled') as max_round_number,
            higher.user_id as higher_user_id, lower.user_id as lower_user_id,
            coalesce(round.starts_at, series.created_at) as achieved_at
       from tournament_playoff_series series
       join tournament_round round on round.id = series.round_id
       join tournament_participant higher on higher.id = series.higher_seed_participant_id
       join tournament_participant lower on lower.id = series.lower_seed_participant_id
      where series.tournament_id = $1 and series.kind = 'championship'
        and series.status <> 'cancelled'`,
    [input.tournamentId],
  );
  for (const series of assignedSeries.rows) {
    const roundNumber = Number(series.round_number);
    const maxRound = Number(series.max_round_number);
    const achievementId =
      roundNumber === maxRound
        ? 'playoff-final'
        : roundNumber === maxRound - 1
          ? 'playoff-semifinal'
          : null;
    if (achievementId !== null) {
      for (const userId of [series.higher_user_id, series.lower_user_id]) {
        add(userId, achievementId, series.achieved_at, {
          seriesId: series.series_id,
          roundNumber,
        });
      }
    }
  }

  await collectFixturePerformance(db, input, add);

  if (affectedUserIds.length > 0) {
    const history = await loadAffectedUserSeriesHistory(db, affectedUserIds);
    for (const userId of affectedUserIds) {
      const userSeries = history.filter((series) => series.user_id === userId);
      for (const series of userSeries.filter((row) => row.tournament_id === input.tournamentId)) {
        const isPlayedWinner =
          series.status === 'completed' &&
          series.winner_participant_id === series.participant_id &&
          !series.admin_decided &&
          Number(series.played_wins) >= Number(series.wins_required);
        if (isPlayedWinner) {
          if (series.player_experience === null || series.opponent_experience === null) {
            diagnostics.ambiguousExperienceSeries += 1;
          } else if (series.opponent_experience > series.player_experience) {
            add(userId, 'dark-horse', series.completed_at, { seriesId: series.series_id });
          }
          const fixtures = await loadSeriesFixtures(db, series.series_id);
          if (
            isSeriesComeback({
              winsRequired: Number(series.wins_required),
              eventualWinnerParticipantId: series.participant_id,
              fixtures,
            })
          ) {
            add(userId, 'series-comeback', series.completed_at, {
              seriesId: series.series_id,
            });
          }
        }
      }

      const resolved: ResolvedPlayerSeries[] = userSeries.map((series) => {
        const isWinner = series.winner_participant_id === series.participant_id;
        const playedWinner =
          isWinner &&
          !series.admin_decided &&
          Number(series.played_wins) >= Number(series.wins_required);
        return {
          seriesId: series.series_id,
          tournamentId: series.tournament_id,
          completedAt: series.completed_at,
          result:
            series.status === 'cancelled'
              ? 'cancelled'
              : isWinner
                ? playedWinner
                  ? 'played_win'
                  : 'technical_win'
                : 'loss',
          playerExperience: series.player_experience,
          opponentExperience: series.opponent_experience,
        };
      });
      const deathBracket = reachesDeathBracket(resolved);
      if (deathBracket.achievedAt !== null) {
        const achievingSeries = userSeries.find(
          (series) =>
            series.series_id === deathBracket.qualifyingSeriesIds[2] &&
            series.tournament_id === input.tournamentId,
        );
        if (achievingSeries !== undefined) {
          add(userId, 'death-bracket', deathBracket.achievedAt, {
            seriesIds: deathBracket.qualifyingSeriesIds,
          });
        }
      }
    }
  }

  if (boundary.status === 'completed' && boundary.completed_at !== null) {
    const champion = await loadOfficialChampion(db, input.tournamentId);
    if (champion !== null) {
      add(champion.userId, 'tournament-cup', boundary.completed_at, {
        seriesId: champion.seriesId,
      });
      const championships = await loadAffectedUserChampionships(db, [champion.userId]);
      const grouped = new Map<string, typeof championships>();
      for (const championship of championships) {
        const season = localSeasonKey(championship.starts_at, championship.timezone);
        if (season.fallback) diagnostics.timestampFallbacks += 1;
        const values = grouped.get(season.key) ?? [];
        values.push(championship);
        grouped.set(season.key, values);
      }
      for (const [seasonKey, values] of grouped) {
        values.sort(
          (left, right) =>
            left.completed_at.getTime() - right.completed_at.getTime() ||
            left.tournament_id.localeCompare(right.tournament_id),
        );
        const third = values[2];
        if (third?.tournament_id === input.tournamentId) {
          add(champion.userId, 'tournament-streak', third.completed_at, { seasonKey });
        }
      }
    }
  }

  return { candidates: [...collected.values()], diagnostics };
}

async function loadRegularCompletionTimestamp(
  db: Queryable,
  tournamentId: string,
  regularSource: TournamentRegularSource,
): Promise<Date | null> {
  if (regularSource === 'head_to_head') {
    const result = await db.query<{ achieved_at: Date | null }>(
      `select max(fixture.settled_at) as achieved_at
         from tournament_fixture fixture
         join tournament_round round on round.id = fixture.round_id
        where fixture.tournament_id = $1 and round.stage in ('regular', 'tiebreak')`,
      [tournamentId],
    );
    return result.rows[0]?.achieved_at ?? null;
  }
  const result = await db.query<{ achieved_at: Date | null }>(
    `select max(finalized_at) as achieved_at from tournament_daily_result where tournament_id = $1`,
    [tournamentId],
  );
  return result.rows[0]?.achieved_at ?? null;
}

async function loadSeriesFixtures(db: Queryable, seriesId: string) {
  const result = await db.query<{
    fixture_id: string;
    settled_at: Date;
    winner_participant_id: string | null;
    played: boolean;
  }>(
    `select fixture.id as fixture_id, fixture.settled_at,
            fixture.winner_participant_id,
            exists (
              select 1 from tournament_fixture_attempt attempt
               where attempt.fixture_id = fixture.id and attempt.status = 'settled'
                 and attempt.amateur_duel_match_id is not null
              union all
              select 1 from tournament_fixture_segment segment
               where segment.fixture_id = fixture.id and segment.status = 'settled'
                 and segment.duel_match_id is not null
            ) as played
       from tournament_fixture fixture
      where fixture.series_id = $1 and fixture.settled_at is not null
      order by fixture.settled_at, fixture.id`,
    [seriesId],
  );
  return result.rows.map((row) => ({
    fixtureId: row.fixture_id,
    settledAt: row.settled_at,
    winnerParticipantId: row.winner_participant_id,
    played: row.played,
  }));
}

async function loadAffectedUserSeriesHistory(
  db: Queryable,
  userIds: string[],
): Promise<SeriesRow[]> {
  const result = await db.query<SeriesRow>(
    `select series.id as series_id, series.tournament_id, participant.user_id,
            participant.id as participant_id,
            case when participant.id = series.higher_seed_participant_id
                 then series.lower_seed_participant_id else series.higher_seed_participant_id end
              as opponent_participant_id,
            series.winner_participant_id, series.wins_required, series.status,
            series.updated_at as completed_at,
            exists (select 1 from tournament_series_admin_decision decision
                     where decision.series_id = series.id and decision.status = 'confirmed')
              as admin_decided,
            (select count(*)::int from tournament_fixture fixture
              where fixture.series_id = series.id
                and fixture.winner_participant_id = participant.id
                and exists (
                  select 1 from tournament_fixture_attempt attempt
                   where attempt.fixture_id = fixture.id and attempt.status = 'settled'
                     and attempt.amateur_duel_match_id is not null
                  union all
                  select 1 from tournament_fixture_segment segment
                   where segment.fixture_id = fixture.id and segment.status = 'settled'
                     and segment.duel_match_id is not null
                )) as played_wins,
            experience.player_experience, experience.opponent_experience
       from tournament_playoff_series series
       join lateral (values (series.higher_seed_participant_id),
                            (series.lower_seed_participant_id)) selected(participant_id) on true
       join tournament_participant participant on participant.id = selected.participant_id
       left join lateral (
         select player.experience_snapshot as player_experience,
                opponent.experience_snapshot as opponent_experience
           from (
             select attempt.amateur_duel_match_id as match_id,
                    coalesce(attempt.settled_at, attempt.updated_at) as played_at
               from tournament_fixture fixture
               join tournament_fixture_attempt attempt on attempt.fixture_id = fixture.id
              where fixture.series_id = series.id and attempt.status = 'settled'
                and attempt.amateur_duel_match_id is not null
             union all
             select segment.duel_match_id as match_id,
                    coalesce(segment.settled_at, segment.created_at) as played_at
               from tournament_fixture fixture
               join tournament_fixture_segment segment on segment.fixture_id = fixture.id
              where fixture.series_id = series.id and segment.status = 'settled'
                and segment.duel_match_id is not null
           ) played
           join amateur_duel_participant player
             on player.match_id = played.match_id and player.user_id = participant.user_id
           join amateur_duel_participant opponent
             on opponent.match_id = played.match_id and opponent.user_id <> participant.user_id
          order by played.played_at, played.match_id
          limit 1
       ) experience on true
      where participant.user_id = any($1::uuid[])
        and series.status in ('completed', 'cancelled')
        and series.higher_seed_participant_id is not null
        and series.lower_seed_participant_id is not null
      order by series.updated_at, series.id`,
    [userIds],
  );
  return result.rows;
}

async function collectFixturePerformance(
  db: Queryable,
  input: { tournamentId: string; source: TournamentAchievementSource },
  add: (
    userId: string,
    achievementId: (typeof TOURNAMENT_ACHIEVEMENT_IDS)[number],
    achievedAt: Date,
    context: Record<string, unknown>,
  ) => void,
): Promise<void> {
  const result = await db.query<{
    fixture_id: string;
    user_id: string;
    settled_at: Date;
    goals: number;
    shots: number;
  }>(
    `with match_links as (
       select fixture.id as fixture_id, attempt.amateur_duel_match_id as match_id
         from tournament_fixture fixture
         join tournament_round round on round.id = fixture.round_id
         join tournament_fixture_attempt attempt on attempt.fixture_id = fixture.id
        where fixture.tournament_id = $1 and round.stage in ('playoff', 'third_place')
          and fixture.status = 'settled' and attempt.status = 'settled'
          and attempt.amateur_duel_match_id is not null
       union
       select fixture.id, segment.duel_match_id
         from tournament_fixture fixture
         join tournament_round round on round.id = fixture.round_id
         join tournament_fixture_segment segment on segment.fixture_id = fixture.id
        where fixture.tournament_id = $1 and round.stage in ('playoff', 'third_place')
          and fixture.status = 'settled' and segment.status = 'settled'
          and segment.duel_match_id is not null
     )
     select fixture.id as fixture_id, participant.user_id, fixture.settled_at,
            sum(participant.goals)::int as goals,
            sum(participant.shots_taken)::int as shots
       from match_links link
       join tournament_fixture fixture on fixture.id = link.fixture_id
       join amateur_duel_match match on match.id = link.match_id and match.status = 'settled'
       join amateur_duel_participant participant on participant.match_id = match.id
      group by fixture.id, participant.user_id, fixture.settled_at`,
    [input.tournamentId],
  );
  for (const row of result.rows) {
    if (accuracyAtLeast(Number(row.goals), Number(row.shots), 0.9)) {
      add(row.user_id, 'no-shake', row.settled_at, {
        fixtureId: row.fixture_id,
        goals: Number(row.goals),
        shots: Number(row.shots),
      });
    }
  }
}

async function loadOfficialChampion(
  db: Queryable,
  tournamentId: string,
): Promise<{ userId: string; seriesId: string } | null> {
  const result = await db.query<{ user_id: string; series_id: string }>(
    `select participant.user_id, series.id as series_id
       from tournament_playoff_series series
       join tournament_round round on round.id = series.round_id
       join tournament_participant participant on participant.id = series.winner_participant_id
      where series.tournament_id = $1 and series.kind = 'championship'
        and series.status = 'completed'
      order by round.number desc limit 1`,
    [tournamentId],
  );
  const row = result.rows[0];
  return row === undefined ? null : { userId: row.user_id, seriesId: row.series_id };
}

async function loadAffectedUserChampionships(db: Queryable, userIds: string[]) {
  const result = await db.query<{
    tournament_id: string;
    user_id: string;
    starts_at: Date;
    completed_at: Date;
    timezone: string;
  }>(
    `select tournament.id as tournament_id, participant.user_id,
            tournament.starts_at, tournament.completed_at,
            coalesce(revision.rules_snapshot->'config'->>'timezone', 'UTC') as timezone
       from tournament
       join tournament_revision revision on revision.id = tournament.published_revision_id
       join tournament_playoff_series series on series.tournament_id = tournament.id
       join tournament_round round on round.id = series.round_id
       join tournament_participant participant on participant.id = series.winner_participant_id
      where tournament.status = 'completed' and tournament.completed_at is not null
        and tournament.starts_at is not null and participant.user_id = any($1::uuid[])
        and series.kind = 'championship' and series.status = 'completed'
        and round.number = (
          select max(final_round.number)
            from tournament_playoff_series final_series
            join tournament_round final_round on final_round.id = final_series.round_id
           where final_series.tournament_id = tournament.id
             and final_series.kind = 'championship' and final_series.status <> 'cancelled'
        )`,
    [userIds],
  );
  return result.rows;
}

export async function reconcileTournamentAchievements(
  db: Queryable,
  input: { tournamentId: string; source: TournamentAchievementSource },
): Promise<{
  attempted: number;
  inserted: number;
  diagnostics: TournamentAchievementDiagnostics;
}> {
  const collected = await collectTournamentAchievementCandidates(db, input);
  const persisted = await completeAchievementCandidates(db, collected.candidates);
  return { ...persisted, diagnostics: collected.diagnostics };
}
