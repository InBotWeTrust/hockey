import { describe, expect, it } from 'vitest';
import { qualificationDescription, qualificationProgress } from './bonusGameQualification.js';

describe('qualificationDescription', () => {
  it('describes goals from shots', () => {
    expect(
      qualificationDescription({ type: 'goals_from_shots', targetGoals: 18, shotsLimit: 30 }),
    ).toBe('18 голов из 30 бросков');
  });

  it('describes goals in active time', () => {
    expect(
      qualificationDescription({ type: 'goals_in_time', targetGoals: 20, activeTimeMs: 120_000 }),
    ).toBe('20 голов за 02:00');
  });

  it('describes accuracy qualification as goals from a fixed shot quota', () => {
    expect(
      qualificationDescription({
        type: 'goals_from_shots',
        targetGoals: 21,
        shotsLimit: 30,
        requiredGoalStreak: 3,
      }),
    ).toBe('21 голов из 30 бросков · серия 3');
  });
});

describe('qualificationProgress', () => {
  it('shows goal and streak progress', () => {
    expect(
      qualificationProgress(
        { type: 'goals_from_shots', targetGoals: 18, shotsLimit: 30, requiredGoalStreak: 3 },
        { goals: 14, shots: 22, currentStreak: 2, bestStreak: 2 },
      ),
    ).toBe('ЦЕЛЬ 14/18 · СЕРИЯ 2/3');
  });

  it('resets the displayed streak after a save or miss', () => {
    expect(
      qualificationProgress(
        { type: 'goals_from_shots', targetGoals: 42, shotsLimit: 50, requiredGoalStreak: 4 },
        { goals: 5, shots: 8, currentStreak: 0, bestStreak: 3 },
      ),
    ).toBe('ЦЕЛЬ 5/42 · СЕРИЯ 0/4');
  });

  it('keeps an achieved streak fulfilled after a later-period miss', () => {
    expect(
      qualificationProgress(
        { type: 'goals_from_shots', targetGoals: 42, shotsLimit: 50, requiredGoalStreak: 4 },
        { goals: 18, shots: 28, currentStreak: 1, bestStreak: 4 },
      ),
    ).toBe('ЦЕЛЬ 18/42 · СЕРИЯ 4/4');
  });

  it('shows goal progress for accuracy qualifications', () => {
    expect(
      qualificationProgress(
        { type: 'goals_from_shots', targetGoals: 21, shotsLimit: 30 },
        { goals: 10, shots: 15, currentStreak: 1, bestStreak: 4 },
      ),
    ).toBe('ЦЕЛЬ 10/21');
  });
});
