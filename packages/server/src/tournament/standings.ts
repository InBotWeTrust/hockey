import type { TournamentDailyMetric } from './types.js';

export interface DailyPlacementInput {
  participantId: string;
  value: number;
  durationMs?: number;
}

export interface DailyPlacement {
  participantId: string;
  place: number;
  points: number;
}

function normalizedDuration(durationMs: number | undefined): number | null {
  return durationMs !== undefined && Number.isFinite(durationMs) ? Math.max(0, durationMs) : null;
}

function compareDurations(left: number | null, right: number | null): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left - right;
}

export function awardSharedPlacePoints(
  input: DailyPlacementInput[],
  pointsByPlace: number[],
): DailyPlacement[] {
  const sorted = [...input].sort(
    (left, right) =>
      right.value - left.value ||
      compareDurations(
        normalizedDuration(left.durationMs),
        normalizedDuration(right.durationMs),
      ) ||
      left.participantId.localeCompare(right.participantId),
  );
  const result: DailyPlacement[] = [];
  let index = 0;
  while (index < sorted.length) {
    const value = sorted[index]!.value;
    const durationMs = normalizedDuration(sorted[index]!.durationMs);
    let end = index + 1;
    while (
      end < sorted.length &&
      sorted[end]!.value === value &&
      normalizedDuration(sorted[end]!.durationMs) === durationMs
    ) {
      end += 1;
    }
    const sharedPoints =
      Array.from({ length: end - index }, (_, offset) => pointsByPlace[index + offset] ?? 0).reduce(
        (sum, points) => sum + points,
        0,
      ) /
      (end - index);
    for (let cursor = index; cursor < end; cursor += 1) {
      result.push({
        participantId: sorted[cursor]!.participantId,
        place: index + 1,
        points: sharedPoints,
      });
    }
    index = end;
  }
  return result;
}

export interface DailyResultInput {
  participantId: string;
  day: number;
  goals: number;
  shots: number;
  completed: boolean;
  placePoints?: number;
  durationMs?: number;
}

export interface DailyAggregateStanding {
  participantId: string;
  value: number;
  countedDays: number[];
  totalDurationMs?: number;
}

export function calculateDailyAggregateStandings(
  results: DailyResultInput[],
  options: { metric: TournamentDailyMetric; bestDays: number | null },
): DailyAggregateStanding[] {
  const byParticipant = new Map<
    string,
    Array<{ day: number; value: number; durationMs: number | null }>
  >();
  for (const result of results) {
    const participantResults = byParticipant.get(result.participantId) ?? [];
    if (!result.completed) {
      participantResults.push({ day: result.day, value: 0, durationMs: null });
      byParticipant.set(result.participantId, participantResults);
      continue;
    }
    const value =
      options.metric === 'goals_sum'
        ? result.goals
        : options.metric === 'accuracy_average'
          ? result.shots === 0
            ? 0
            : result.goals / result.shots
          : (result.placePoints ?? 0);
    participantResults.push({
      day: result.day,
      value,
      durationMs: normalizedDuration(result.durationMs),
    });
    byParticipant.set(result.participantId, participantResults);
  }

  return [...byParticipant.entries()]
    .map(([participantId, participantResults]) => {
      const counted = [...participantResults]
        .sort(
          (left, right) =>
            right.value - left.value ||
            compareDurations(left.durationMs, right.durationMs) ||
            left.day - right.day,
        )
        .slice(0, options.bestDays ?? participantResults.length);
      const sum = counted.reduce((total, result) => total + result.value, 0);
      const hasDuration = counted.length > 0 && counted.every((result) => result.durationMs !== null);
      const totalDurationMs = hasDuration
        ? counted.reduce((total, result) => total + result.durationMs!, 0)
        : null;
      return {
        participantId,
        value: options.metric === 'accuracy_average' && counted.length > 0 ? sum / counted.length : sum,
        countedDays: counted.map((result) => result.day),
        ...(totalDurationMs === null ? {} : { totalDurationMs }),
      };
    })
    .sort(
      (left, right) =>
        right.value - left.value ||
        compareDurations(left.totalDurationMs ?? null, right.totalDurationMs ?? null) ||
        left.participantId.localeCompare(right.participantId),
    );
}

export type HeadToHeadTieCriterion = 'points' | 'wins' | 'goal_difference' | 'goals_for';

export interface HeadToHeadStandingInput {
  participantId: string;
  points: number;
  wins: number;
  goalsFor: number;
  goalsAgainst: number;
}

function criterionValue(row: HeadToHeadStandingInput, criterion: HeadToHeadTieCriterion): number {
  switch (criterion) {
    case 'points':
      return row.points;
    case 'wins':
      return row.wins;
    case 'goal_difference':
      return row.goalsFor - row.goalsAgainst;
    case 'goals_for':
      return row.goalsFor;
  }
}

export function rankHeadToHeadStandings(
  rows: HeadToHeadStandingInput[],
  criteria: HeadToHeadTieCriterion[],
  playoffSize: number,
): { rows: HeadToHeadStandingInput[]; boundaryTieParticipantIds: string[] } {
  const compareByCriteria = (left: HeadToHeadStandingInput, right: HeadToHeadStandingInput) => {
    for (const criterion of criteria) {
      const difference = criterionValue(right, criterion) - criterionValue(left, criterion);
      if (difference !== 0) return difference;
    }
    return 0;
  };
  const ranked = [...rows].sort(
    (left, right) => compareByCriteria(left, right) || left.participantId.localeCompare(right.participantId),
  );
  const boundary = ranked[playoffSize - 1];
  const next = ranked[playoffSize];
  const boundaryTieParticipantIds =
    boundary !== undefined && next !== undefined && compareByCriteria(boundary, next) === 0
      ? ranked
          .filter((row) => compareByCriteria(row, boundary) === 0)
          .map((row) => row.participantId)
      : [];
  return { rows: ranked, boundaryTieParticipantIds };
}
