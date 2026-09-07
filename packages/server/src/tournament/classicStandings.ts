import type { PoolClient } from 'pg';
import { awardSharedPlacePoints, calculateClassicStandings } from './standings.js';
import type { TournamentDailyMetric } from './types.js';

export interface ClassicStandingsRulesSnapshot {
  config: {
    regularSource: 'classic';
    dailyDays: number;
    dailyMetric: TournamentDailyMetric;
    bestDays: number | null;
  };
  dailyPlacePoints?: number[];
}

interface ClassicResultRow {
  participant_id: string;
  tournament_day: number;
  goals: number;
  shots: number;
  completed: boolean;
  place_points: number;
  source_snapshot: {
    source?: unknown;
    sessionId?: unknown;
    activeDurationMs?: unknown;
    gameCompleted?: unknown;
    incompleteResultPolicy?: unknown;
  };
}

interface ClassicPeriodDuration {
  allMs: number;
  completedMs: number;
}

function resultKey(result: Pick<ClassicResultRow, 'participant_id' | 'tournament_day'>): string {
  return `${result.participant_id}:${result.tournament_day}`;
}

async function loadClassicResultDurations(
  client: PoolClient,
  results: ClassicResultRow[],
): Promise<Map<string, number>> {
  const sessionIds = results.flatMap((result) => {
    const snapshot = result.source_snapshot;
    return snapshot.source === 'tournament_classic' && typeof snapshot.sessionId === 'string'
      ? [snapshot.sessionId]
      : [];
  });
  const durationsBySession = new Map<string, ClassicPeriodDuration>();
  if (sessionIds.length > 0) {
    const periods = await client.query<{
      session_id: string;
      closed_reason: string;
      duration_ms: number | string;
    }>(
      `select session_id, closed_reason,
              greatest(0, extract(epoch from (ended_at - started_at)) * 1000)::bigint as duration_ms
         from tournament_classic_period
        where session_id::text = any($1::text[])`,
      [sessionIds],
    );
    for (const period of periods.rows) {
      const current = durationsBySession.get(period.session_id) ?? { allMs: 0, completedMs: 0 };
      const durationMs = Number(period.duration_ms);
      current.allMs += durationMs;
      if (period.closed_reason !== 'day_end') current.completedMs += durationMs;
      durationsBySession.set(period.session_id, current);
    }
  }

  const result = new Map<string, number>();
  for (const row of results) {
    const snapshot = row.source_snapshot;
    if (snapshot.source !== 'tournament_classic') continue;
    const storedDuration =
      typeof snapshot.activeDurationMs === 'number' ? snapshot.activeDurationMs : Number.NaN;
    if (Number.isFinite(storedDuration) && storedDuration >= 0) {
      result.set(resultKey(row), storedDuration);
      continue;
    }
    if (typeof snapshot.sessionId !== 'string') continue;
    const periodDuration = durationsBySession.get(snapshot.sessionId);
    if (periodDuration === undefined) continue;
    result.set(
      resultKey(row),
      snapshot.gameCompleted === true || snapshot.incompleteResultPolicy === 'all_shots'
        ? periodDuration.allMs
        : periodDuration.completedMs,
    );
  }
  return result;
}

export async function refreshClassicDayPlacements(
  client: PoolClient,
  tournamentId: string,
  tournamentDay: number,
  rules: ClassicStandingsRulesSnapshot,
): Promise<void> {
  const results = await client.query<{
    participant_id: string;
    tournament_day: number;
    goals: number;
    shots: number;
    completed: boolean;
    place_points: number;
    source_snapshot: ClassicResultRow['source_snapshot'];
  }>(
    `select participant_id, tournament_day, goals, shots, completed, place_points, source_snapshot
       from tournament_daily_result
      where tournament_id = $1 and tournament_day = $2 and completed = true`,
    [tournamentId, tournamentDay],
  );
  const durationByResult = await loadClassicResultDurations(client, results.rows);
  const placementInput = results.rows.map((result) => ({
    participantId: result.participant_id,
    value:
      rules.config.dailyMetric === 'accuracy_average'
        ? Number(result.shots) === 0
          ? 0
          : Number(result.goals) / Number(result.shots)
        : Number(result.goals),
    ...(durationByResult.get(resultKey(result)) === undefined
      ? {}
      : { durationMs: durationByResult.get(resultKey(result))! }),
  }));
  const placements = awardSharedPlacePoints(
    placementInput,
    rules.dailyPlacePoints ?? placementInput.map((_, index) => placementInput.length - index),
  );
  for (const placement of placements) {
    await client.query(
      `update tournament_daily_result
          set place = $4, place_points = $5
        where tournament_id = $1 and tournament_day = $2 and participant_id = $3`,
      [tournamentId, tournamentDay, placement.participantId, placement.place, placement.points],
    );
  }
}

export async function rebuildClassicStandings(
  client: PoolClient,
  tournamentId: string,
  rules: ClassicStandingsRulesSnapshot,
): Promise<void> {
  await client.query(`select pg_advisory_xact_lock(hashtext($1))`, [
    `tournament-daily-standings:${tournamentId}`,
  ]);
  const [participants, allResults] = await Promise.all([
    client.query<{ participant_id: string }>(
      `select id as participant_id
         from tournament_participant
        where tournament_id = $1
          and state in ('approved', 'withdrawn', 'removed', 'disqualified')
        order by id`,
      [tournamentId],
    ),
    client.query<ClassicResultRow>(
      `select participant_id, tournament_day, goals, shots, completed, place_points,
              source_snapshot
         from tournament_daily_result where tournament_id = $1`,
      [tournamentId],
    ),
  ]);
  const durationByResult = await loadClassicResultDurations(client, allResults.rows);
  const calculated = calculateClassicStandings(
    allResults.rows.map((row) => ({
      participantId: row.participant_id,
      day: Number(row.tournament_day),
      goals: Number(row.goals),
      shots: Number(row.shots),
      completed: row.completed,
      placePoints: Number(row.place_points),
      ...(durationByResult.get(resultKey(row)) === undefined
        ? {}
        : { durationMs: durationByResult.get(resultKey(row))! }),
    })),
    { metric: rules.config.dailyMetric, bestDays: rules.config.bestDays },
  );
  const calculatedByParticipant = new Map(
    calculated.map((standing) => [standing.participantId, standing]),
  );
  const playedByParticipant = new Map<string, number>();
  for (const result of allResults.rows) {
    if (!result.completed) continue;
    playedByParticipant.set(
      result.participant_id,
      (playedByParticipant.get(result.participant_id) ?? 0) + 1,
    );
  }
  const standings: Array<{
    participantId: string;
    value: number;
    countedDays: number[];
    played: number;
    totalDurationMs?: number;
  }> = participants.rows
    .map(({ participant_id: participantId }) => {
      const calculatedStanding = calculatedByParticipant.get(participantId);
      return {
        participantId,
        value: calculatedStanding?.value ?? 0,
        countedDays: calculatedStanding?.countedDays ?? [],
        played: playedByParticipant.get(participantId) ?? 0,
        ...(calculatedStanding?.totalDurationMs === undefined
          ? {}
          : { totalDurationMs: calculatedStanding.totalDurationMs }),
      };
    })
    .sort(
      (left, right) =>
        right.value - left.value ||
        (left.totalDurationMs === undefined && right.totalDurationMs === undefined
          ? 0
          : left.totalDurationMs === undefined
            ? 1
            : right.totalDurationMs === undefined
              ? -1
              : left.totalDurationMs - right.totalDurationMs) ||
        left.participantId.localeCompare(right.participantId),
    );

  await client.query(`delete from tournament_standing where tournament_id = $1`, [tournamentId]);
  for (const [index, standing] of standings.entries()) {
    await client.query(
      `insert into tournament_standing
         (tournament_id, participant_id, rank, played, points, metrics, tie_key, source_version)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        tournamentId,
        standing.participantId,
        index + 1,
        standing.played,
        standing.value,
        JSON.stringify({
          metric: rules.config.dailyMetric,
          countedDays: standing.countedDays,
          ...(standing.totalDurationMs === undefined
            ? {}
            : { totalDurationMs: standing.totalDurationMs }),
        }),
        JSON.stringify(
          standing.totalDurationMs === undefined
            ? [standing.value]
            : [standing.value, standing.totalDurationMs],
        ),
        allResults.rows.length,
      ],
    );
  }
}
