import { describe, expect, it } from 'vitest';
import { parseTournamentConfig } from '../../src/tournament/config.js';
import { canTransitionTournament } from '../../src/tournament/lifecycle.js';

const baseConfig = {
  regularSource: 'head_to_head',
  participantLimit: 16,
  playoffSize: 8,
  timezone: 'Europe/Moscow',
  registrationMode: 'open',
  visibility: 'public',
  entryFeeCoins: 0,
  roundRobinCycles: 2,
  roundsPerDay: 2,
  firstRoundLocalTime: '10:00',
  fixtureWindowMs: 3_600_000,
  roundBreakMs: 900_000,
  dailyDays: null,
  dailyMetric: null,
  bestDays: null,
} as const;

describe('tournament config', () => {
  it('accepts a head-to-head schedule that fits inside a day', () => {
    const config = parseTournamentConfig(baseConfig);

    expect(config.regularSource).toBe('head_to_head');
    expect(config.participantLimit).toBe(16);
  });

  it('rejects head-to-head round windows that do not fit inside a day', () => {
    expect(() =>
      parseTournamentConfig({
        ...baseConfig,
        roundsPerDay: 4,
        fixtureWindowMs: 6 * 3_600_000,
        roundBreakMs: 60_000,
      }),
    ).toThrow('round windows must fit inside one day');
  });

  it('enforces format-specific participant limits', () => {
    expect(() => parseTournamentConfig({ ...baseConfig, participantLimit: 65 })).toThrow(
      'head-to-head tournaments support at most 64 participants',
    );

    const daily = parseTournamentConfig({
      ...baseConfig,
      regularSource: 'daily_aggregate',
      participantLimit: 10_000,
      roundRobinCycles: null,
      roundsPerDay: null,
      firstRoundLocalTime: null,
      fixtureWindowMs: null,
      roundBreakMs: null,
      dailyDays: 30,
      dailyMetric: 'goals_sum',
      bestDays: 20,
    });
    expect(daily.participantLimit).toBe(10_000);
  });

  it('accepts a configurable three-period classic regular season', () => {
    const classic = parseTournamentConfig({
      ...baseConfig,
      regularSource: 'classic',
      participantLimit: 128,
      roundRobinCycles: null,
      roundsPerDay: null,
      firstRoundLocalTime: null,
      fixtureWindowMs: null,
      roundBreakMs: null,
      dailyDays: 14,
      dailyMetric: 'goals_sum',
      bestDays: 10,
      classicRules: {
        shotsPerPeriod: 30,
        periodDurationMs: 20 * 60_000,
        breakDurationMs: 15 * 60_000,
        incompleteResultPolicy: 'completed_game',
        periodSpeedPresets: [
          {
            periodNumber: 1,
            goalFrequency: 0.55,
            goalieFrequency: 0.65,
            shooterFrequency: 0.8,
            puckSpeedPerMs: 1.3,
          },
          {
            periodNumber: 2,
            goalFrequency: 0.72,
            goalieFrequency: 0.84,
            shooterFrequency: 1,
            puckSpeedPerMs: 1.55,
          },
          {
            periodNumber: 3,
            goalFrequency: 0.9,
            goalieFrequency: 1.05,
            shooterFrequency: 1.18,
            puckSpeedPerMs: 1.8,
          },
        ],
      },
    });

    expect(classic.regularSource).toBe('classic');
    expect(classic.classicRules.incompleteResultPolicy).toBe('completed_game');
    expect(classic.classicRules.goalieId).toBe('rookie');
    expect(classic.classicRules.periodSpeedPresets).toHaveLength(3);
  });

  it('rejects classic rules without exactly one speed preset for each period', () => {
    expect(() =>
      parseTournamentConfig({
        ...baseConfig,
        regularSource: 'classic',
        roundRobinCycles: null,
        roundsPerDay: null,
        firstRoundLocalTime: null,
        fixtureWindowMs: null,
        roundBreakMs: null,
        dailyDays: 7,
        dailyMetric: 'accuracy_average',
        bestDays: null,
        classicRules: {
          shotsPerPeriod: 20,
          periodDurationMs: 600_000,
          breakDurationMs: 60_000,
          incompleteResultPolicy: 'completed_periods',
          periodSpeedPresets: [
            {
              periodNumber: 1,
              goalFrequency: 0.55,
              goalieFrequency: 0.65,
              shooterFrequency: 0.8,
              puckSpeedPerMs: 1.3,
            },
          ],
        },
      }),
    ).toThrow('classic requires speed settings for periods 1, 2 and 3');
  });
});

describe('tournament lifecycle', () => {
  it('allows the published happy path and explicit pause/resume', () => {
    expect(canTransitionTournament('draft', 'registration')).toBe(true);
    expect(canTransitionTournament('registration', 'scheduling')).toBe(true);
    expect(canTransitionTournament('regular', 'paused')).toBe(true);
    expect(canTransitionTournament('paused', 'regular')).toBe(true);
    expect(canTransitionTournament('playoff', 'completed')).toBe(true);
  });

  it('does not allow a completed tournament to return to play', () => {
    expect(canTransitionTournament('completed', 'regular')).toBe(false);
    expect(canTransitionTournament('archived', 'registration')).toBe(false);
  });
});
