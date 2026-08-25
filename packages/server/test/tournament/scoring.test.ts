import { describe, expect, it } from 'vitest';
import { scoreTournamentFixture } from '../../src/tournament/scoring.js';

describe('regular fixture scoring', () => {
  const points = {
    regulationWin: 3,
    overtimeWin: 2,
    overtimeLoss: 1,
    draw: 1,
    loss: 0,
    technicalLoss: -1,
  };

  it('distinguishes regulation and overtime results', () => {
    expect(scoreTournamentFixture('home_win', 'regulation', points)).toEqual({ home: 3, away: 0 });
    expect(scoreTournamentFixture('away_win', 'overtime', points)).toEqual({ home: 1, away: 2 });
  });

  it('supports draws, forfeits and double no-shows', () => {
    expect(scoreTournamentFixture('draw', 'regulation', points)).toEqual({ home: 1, away: 1 });
    expect(scoreTournamentFixture('home_forfeit', 'regulation', points)).toEqual({ home: -1, away: 3 });
    expect(scoreTournamentFixture('double_forfeit', 'regulation', points)).toEqual({ home: 0, away: 0 });
  });
});
