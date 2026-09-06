export type TournamentSeriesResultKind = 'played_win' | 'technical_win' | 'loss' | 'cancelled';

export interface ResolvedPlayerSeries {
  seriesId: string;
  tournamentId: string;
  completedAt: Date;
  result: TournamentSeriesResultKind;
  playerExperience: number | null;
  opponentExperience: number | null;
}

export function hockeySeasonKey(startsAt: Date): string {
  const year = startsAt.getUTCFullYear();
  const startsInYear = startsAt.getUTCMonth() >= 8 ? year : year - 1;
  return `${startsInYear}-${startsInYear + 1}`;
}

export function accuracyAtLeast(goals: number, shots: number, threshold: number): boolean {
  return shots > 0 && goals / shots >= threshold;
}

export function isMoreExperiencedOpponent(series: ResolvedPlayerSeries): boolean {
  return (
    series.playerExperience !== null &&
    series.opponentExperience !== null &&
    series.opponentExperience > series.playerExperience
  );
}

export function reachesDeathBracket(series: readonly ResolvedPlayerSeries[]): {
  achievedAt: Date | null;
  qualifyingSeriesIds: string[];
} {
  const chronological = [...series].sort(
    (left, right) =>
      left.completedAt.getTime() - right.completedAt.getTime() ||
      left.seriesId.localeCompare(right.seriesId),
  );
  let qualifyingSeriesIds: string[] = [];

  for (const resolvedSeries of chronological) {
    if (resolvedSeries.result === 'played_win' && isMoreExperiencedOpponent(resolvedSeries)) {
      qualifyingSeriesIds.push(resolvedSeries.seriesId);
      if (qualifyingSeriesIds.length === 3) {
        return { achievedAt: resolvedSeries.completedAt, qualifyingSeriesIds };
      }
    } else {
      qualifyingSeriesIds = [];
    }
  }

  return { achievedAt: null, qualifyingSeriesIds: [] };
}

export function isSeriesComeback(input: {
  winsRequired: number;
  eventualWinnerParticipantId: string;
  fixtures: readonly {
    fixtureId: string;
    settledAt: Date;
    winnerParticipantId: string | null;
    played: boolean;
  }[];
}): boolean {
  if (input.winsRequired < 2) return false;

  const fixtures = [...input.fixtures].sort(
    (left, right) =>
      left.settledAt.getTime() - right.settledAt.getTime() ||
      left.fixtureId.localeCompare(right.fixtureId),
  );
  let winnerWins = 0;
  let opponentWins = 0;
  let trailedAfterPlayedFixture = false;

  for (const fixture of fixtures) {
    if (fixture.winnerParticipantId === input.eventualWinnerParticipantId) {
      if (!fixture.played) return false;
      winnerWins += 1;
    } else if (fixture.played && fixture.winnerParticipantId !== null) {
      opponentWins += 1;
    }

    if (fixture.played && opponentWins > winnerWins) {
      trailedAfterPlayedFixture = true;
    }
  }

  return trailedAfterPlayedFixture && winnerWins >= input.winsRequired;
}
