import { describe, expect, it } from 'vitest';
import { resolveClassicResult } from '../../src/tournament/classic.js';

const completedPeriods = [
  { periodNumber: 1, shots: 30, goals: 18 },
  { periodNumber: 2, shots: 30, goals: 20 },
];

describe('classic tournament result policy', () => {
  it('counts every confirmed shot when the tournament allows partial play', () => {
    expect(
      resolveClassicResult({
        policy: 'all_shots',
        completedPeriods,
        activePeriod: { shots: 12, goals: 7 },
      }),
    ).toEqual({ goals: 45, shots: 72, counted: true, gameCompleted: false });
  });

  it('excludes an unfinished period when only completed periods count', () => {
    expect(
      resolveClassicResult({
        policy: 'completed_periods',
        completedPeriods,
        activePeriod: { shots: 12, goals: 7 },
      }),
    ).toEqual({ goals: 38, shots: 60, counted: true, gameCompleted: false });
  });

  it('returns a zero uncounted result when the whole game is required', () => {
    expect(
      resolveClassicResult({
        policy: 'completed_game',
        completedPeriods,
        activePeriod: { shots: 12, goals: 7 },
      }),
    ).toEqual({ goals: 0, shots: 0, counted: false, gameCompleted: false });
  });

  it('counts all three periods as a completed game for every policy', () => {
    expect(
      resolveClassicResult({
        policy: 'completed_game',
        completedPeriods: [
          ...completedPeriods,
          { periodNumber: 3, shots: 30, goals: 22 },
        ],
        activePeriod: null,
      }),
    ).toEqual({ goals: 60, shots: 90, counted: true, gameCompleted: true });
  });
});
