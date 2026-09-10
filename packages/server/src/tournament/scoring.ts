export interface RegularScoringPoints {
  regulationWin: number;
  overtimeWin: number;
  overtimeLoss: number;
  draw: number;
  loss: number;
  technicalLoss: number;
}

export type TournamentFixtureScoringOutcome =
  | 'home_win'
  | 'away_win'
  | 'draw'
  | 'home_forfeit'
  | 'away_forfeit'
  | 'double_forfeit';

export function scoreTournamentFixture(
  outcome: TournamentFixtureScoringOutcome,
  decidedIn: 'regulation' | 'overtime' | 'shootout',
  points: RegularScoringPoints,
): { home: number; away: number } {
  if (outcome === 'double_forfeit') return { home: 0, away: 0 };
  if (outcome === 'draw') return { home: points.draw, away: points.draw };
  if (outcome === 'home_forfeit') return { home: points.technicalLoss, away: points.regulationWin };
  if (outcome === 'away_forfeit') return { home: points.regulationWin, away: points.technicalLoss };
  const overtime = decidedIn !== 'regulation';
  const winnerPoints = overtime ? points.overtimeWin : points.regulationWin;
  const loserPoints = overtime ? points.overtimeLoss : points.loss;
  return outcome === 'home_win'
    ? { home: winnerPoints, away: loserPoints }
    : { home: loserPoints, away: winnerPoints };
}
