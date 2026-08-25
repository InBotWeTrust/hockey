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
