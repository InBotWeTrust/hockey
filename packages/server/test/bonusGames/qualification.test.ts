import { describe, expect, it } from 'vitest';
import {
  advanceGoalStreak,
  evaluateBonusQualification,
  normalizeBonusQualificationRules,
  validateBonusSkillRules,
} from '../../src/bonusGames/qualification.js';

describe('normalizeBonusQualificationRules', () => {
  it.each([
    [
      { type: 'goals_from_shots', targetGoals: 18, shotsLimit: 30 },
      { type: 'goals_from_shots', targetGoals: 18, shotsLimit: 30 },
    ],
    [
      { type: 'goals_in_time', targetGoals: 20, activeTimeMs: 120_000 },
      { type: 'goals_in_time', targetGoals: 20, activeTimeMs: 120_000 },
    ],
  ])('parses supported qualification rule %#', (input, expected) => {
    expect(normalizeBonusQualificationRules(input, { targetGoals: 1, shotsLimit: 1 })).toEqual(
      expected,
    );
  });

  it('normalizes a legacy target to goals from shots', () => {
    expect(normalizeBonusQualificationRules(null, { targetGoals: 18, shotsLimit: 30 })).toEqual({
      type: 'goals_from_shots',
      targetGoals: 18,
      shotsLimit: 30,
    });
  });
});

describe('evaluateBonusQualification', () => {
  it('passes goals from shots when the target is reached', () => {
    expect(
      evaluateBonusQualification(
        { type: 'goals_from_shots', targetGoals: 18, shotsLimit: 30 },
        { goals: 18, shotsTaken: 27, bestGoalStreak: 2, activeElapsedMs: 60_000 },
      ),
    ).toMatchObject({ passed: true, primaryMet: true, streakMet: true });
  });

  it('passes goals in time only while the active-time target is met', () => {
    const rules = { type: 'goals_in_time', targetGoals: 20, activeTimeMs: 120_000 } as const;

    expect(
      evaluateBonusQualification(rules, {
        goals: 20,
        shotsTaken: 25,
        bestGoalStreak: 4,
        activeElapsedMs: 119_999,
      }).passed,
    ).toBe(true);
    expect(
      evaluateBonusQualification(rules, {
        goals: 20,
        shotsTaken: 25,
        bestGoalStreak: 4,
        activeElapsedMs: 120_001,
      }).passed,
    ).toBe(false);
  });

  it('requires the configured goal streak in addition to the primary target', () => {
    const result = evaluateBonusQualification(
      {
        type: 'goals_from_shots',
        targetGoals: 21,
        shotsLimit: 30,
        requiredGoalStreak: 3,
      },
      { goals: 24, shotsTaken: 30, bestGoalStreak: 2, activeElapsedMs: 30_000 },
    );

    expect(result).toMatchObject({ passed: false, primaryMet: true, streakMet: false });
  });
});

describe('validateBonusSkillRules', () => {
  const period = (periodNumber: number, durationMs: number, shotsLimit: number | null) => ({
    periodNumber,
    durationMs,
    shotsLimit,
    goalFrequency: 1,
    goalieFrequency: 1,
    shooterFrequency: 1,
    puckSpeedPerMs: 1,
    goaliePattern: 'linear' as const,
    goalieAmplitude: 1,
    goalAmplitude: 100,
  });

  it('accepts speed only with a time target, nullable quotas, and matching total active time', () => {
    expect(() =>
      validateBonusSkillRules(
        'speed',
        { type: 'goals_in_time', targetGoals: 18, activeTimeMs: 120_000 },
        [period(1, 60_000, null), period(2, 60_000, null)],
      ),
    ).not.toThrow();

    expect(() =>
      validateBonusSkillRules(
        'speed',
        { type: 'goals_in_time', targetGoals: 18, activeTimeMs: 120_000 },
        [period(1, 60_000, 30), period(2, 60_000, null)],
      ),
    ).toThrow('speed periods cannot have a shots limit');
  });

  it('accepts accuracy only when every period has a quota whose sum matches the target quota', () => {
    expect(() =>
      validateBonusSkillRules(
        'accuracy',
        { type: 'goals_from_shots', targetGoals: 18, shotsLimit: 30 },
        [period(1, 60_000, 15), period(2, 60_000, 15)],
      ),
    ).not.toThrow();

    expect(() =>
      validateBonusSkillRules(
        'accuracy',
        { type: 'goals_from_shots', targetGoals: 18, shotsLimit: 30 },
        [period(1, 60_000, 15), period(2, 60_000, null)],
      ),
    ).toThrow('accuracy periods require a shots limit');
  });
});

describe('advanceGoalStreak', () => {
  it('carries a goal streak across accepted goals and retains the best streak', () => {
    expect(advanceGoalStreak({ current: 2, best: 4 }, 'goal')).toEqual({ current: 3, best: 4 });
    expect(advanceGoalStreak({ current: 4, best: 4 }, 'goal')).toEqual({ current: 5, best: 5 });
  });

  it.each(['save', 'miss'] as const)('resets the current streak after %s', (result) => {
    expect(advanceGoalStreak({ current: 4, best: 6 }, result)).toEqual({ current: 0, best: 6 });
  });
});
