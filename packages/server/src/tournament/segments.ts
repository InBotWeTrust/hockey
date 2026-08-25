export type FixtureSegmentKind =
  | 'regulation'
  | 'overtime'
  | 'shootout_initial'
  | 'shootout_sudden_death';

export interface FixtureSegmentCursor {
  kind: FixtureSegmentKind;
  sequenceNumber: number;
  pairNumber: number | null;
}

export type FixtureSegmentDecision =
  | { completed: true; winner: 'home' | 'away' }
  | { completed: false; next: FixtureSegmentCursor; shotsPerParticipant: number | null };

export function decideNextFixtureSegment(
  current: FixtureSegmentCursor,
  homeScore: number,
  awayScore: number,
  rules: { overtimeCount: number; shootoutInitialShots: number },
): FixtureSegmentDecision {
  if (homeScore !== awayScore) {
    return { completed: true, winner: homeScore > awayScore ? 'home' : 'away' };
  }
  if (current.kind === 'regulation') {
    if (rules.overtimeCount > 0) {
      return {
        completed: false,
        next: { kind: 'overtime', sequenceNumber: current.sequenceNumber + 1, pairNumber: 1 },
        shotsPerParticipant: null,
      };
    }
    return {
      completed: false,
      next: { kind: 'shootout_initial', sequenceNumber: current.sequenceNumber + 1, pairNumber: null },
      shotsPerParticipant: rules.shootoutInitialShots,
    };
  }
  if (current.kind === 'overtime' && (current.pairNumber ?? 0) < rules.overtimeCount) {
    return {
      completed: false,
      next: {
        kind: 'overtime',
        sequenceNumber: current.sequenceNumber + 1,
        pairNumber: (current.pairNumber ?? 0) + 1,
      },
      shotsPerParticipant: null,
    };
  }
  if (current.kind === 'overtime') {
    return {
      completed: false,
      next: { kind: 'shootout_initial', sequenceNumber: current.sequenceNumber + 1, pairNumber: null },
      shotsPerParticipant: rules.shootoutInitialShots,
    };
  }
  return {
    completed: false,
    next: {
      kind: 'shootout_sudden_death',
      sequenceNumber: current.sequenceNumber + 1,
      pairNumber: current.kind === 'shootout_initial' ? 1 : (current.pairNumber ?? 0) + 1,
    },
    shotsPerParticipant: 1,
  };
}
