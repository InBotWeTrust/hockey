import { describe, expect, it } from 'vitest';
import {
  allocateSeriesGamesByDay,
  calculateHardGameDeadline,
  resolveTournamentDuelResult,
  validateRoundGameDays,
} from '../../src/tournament/playoffScheduling.js';

describe('validateRoundGameDays', () => {
  it('accepts strictly ordered days whose capacity covers every possible series game', () => {
    expect(() =>
      validateRoundGameDays({
        winsRequired: 2,
        readinessMinutes: 15,
        plannedStartIntervalMinutes: 30,
        days: [
          { localDate: '2026-09-10', firstWaveLocalTime: '10:00', maxResultGames: 2 },
          { localDate: '2026-09-11', firstWaveLocalTime: '11:30', maxResultGames: 1 },
        ],
      }),
    ).not.toThrow();
  });

  it.each([
    ['no days', [], 'at least one game day is required'],
    [
      'an invalid local date',
      [{ localDate: '2026-02-29', firstWaveLocalTime: '10:00', maxResultGames: 3 }],
      'game day localDate must be a valid YYYY-MM-DD date',
    ],
    [
      'an invalid first-wave time',
      [{ localDate: '2026-09-10', firstWaveLocalTime: '24:00', maxResultGames: 3 }],
      'game day firstWaveLocalTime must be a valid HH:mm time',
    ],
    [
      'dates that are not strictly increasing',
      [
        { localDate: '2026-09-10', firstWaveLocalTime: '10:00', maxResultGames: 2 },
        { localDate: '2026-09-10', firstWaveLocalTime: '10:00', maxResultGames: 1 },
      ],
      'game day dates must be strictly increasing',
    ],
    [
      'a non-positive daily limit',
      [{ localDate: '2026-09-10', firstWaveLocalTime: '10:00', maxResultGames: 0 }],
      'game day maxResultGames must be a positive integer',
    ],
  ] as const)('rejects %s', (_label, days, message) => {
    expect(() =>
      validateRoundGameDays({
        winsRequired: 2,
        readinessMinutes: 15,
        plannedStartIntervalMinutes: 30,
        days,
      }),
    ).toThrow(message);
  });

  it('rejects a capacity that does not cover every possible game in the series', () => {
    expect(() =>
      validateRoundGameDays({
        winsRequired: 2,
        readinessMinutes: 15,
        plannedStartIntervalMinutes: 30,
        days: [{ localDate: '2026-09-10', firstWaveLocalTime: '10:00', maxResultGames: 2 }],
      }),
    ).toThrow('game day limits must equal the maximum possible series games');
  });

  it.each([
    ['wins required', { winsRequired: 0 }, 'wins required must be a positive integer'],
    [
      'readiness lower bound',
      { readinessMinutes: 0 },
      'readiness minutes must be between 1 and 120',
    ],
    [
      'readiness upper bound',
      { readinessMinutes: 121 },
      'readiness minutes must be between 1 and 120',
    ],
    [
      'planned-start interval lower bound',
      { plannedStartIntervalMinutes: 0 },
      'planned start interval minutes must be between 1 and 1440',
    ],
    [
      'planned-start interval upper bound',
      { plannedStartIntervalMinutes: 1441 },
      'planned start interval minutes must be between 1 and 1440',
    ],
  ] as const)('rejects an invalid %s', (_label, overrides, message) => {
    expect(() =>
      validateRoundGameDays({
        winsRequired: 2,
        readinessMinutes: 15,
        plannedStartIntervalMinutes: 30,
        days: [{ localDate: '2026-09-10', firstWaveLocalTime: '10:00', maxResultGames: 3 }],
        ...overrides,
      }),
    ).toThrow(message);
  });
});

describe('allocateSeriesGamesByDay', () => {
  it('allocates a two-day best-of-five series as two wins then one conditional game', () => {
    expect(allocateSeriesGamesByDay(2, 2)).toEqual([2, 1]);
  });

  it('allocates every possible game to a single day when there is one day', () => {
    expect(allocateSeriesGamesByDay(3, 1)).toEqual([5]);
  });

  it('rejects a two-day best-of-one allocation because it would create a zero-capacity day', () => {
    expect(() => allocateSeriesGamesByDay(1, 2)).toThrow(
      'a best-of-one series cannot use the two-day default allocation',
    );
  });

  it.each([0, 3])('rejects an unsupported %i-day allocation', (dayCount) => {
    expect(() => allocateSeriesGamesByDay(2, dayCount)).toThrow(
      'only one or two game days are supported for the default series allocation',
    );
  });
});

describe('resolveTournamentDuelResult', () => {
  it('awards the player with more goals before consulting a format tiebreak', () => {
    expect(
      resolveTournamentDuelResult({
        format: 'classic',
        home: { goals: 3, accuracyPercent: 10, activeElapsedMs: 99_000 },
        away: { goals: 2, accuracyPercent: 99, activeElapsedMs: 1_000 },
      }),
    ).toBe('home_win');
  });

  it('uses accuracy rounded to hundredths of a percent for a tied Express game', () => {
    expect(
      resolveTournamentDuelResult({
        format: 'express',
        home: { goals: 2, accuracyPercent: 50.004, activeElapsedMs: 80_000 },
        away: { goals: 2, accuracyPercent: 50.005, activeElapsedMs: 90_000 },
      }),
    ).toBe('away_win');
  });

  it('rounds the 1.005 decimal boundary upward before choosing the Express winner', () => {
    expect(
      resolveTournamentDuelResult({
        format: 'express',
        home: { goals: 2, accuracyPercent: 1.005, activeElapsedMs: 80_000 },
        away: { goals: 2, accuracyPercent: 1.004, activeElapsedMs: 90_000 },
      }),
    ).toBe('home_win');
  });

  it('rounds the 10.075 decimal boundary upward before choosing the Express winner', () => {
    expect(
      resolveTournamentDuelResult({
        format: 'express',
        home: { goals: 2, accuracyPercent: 10.075, activeElapsedMs: 80_000 },
        away: { goals: 2, accuracyPercent: 10.074, activeElapsedMs: 90_000 },
      }),
    ).toBe('home_win');
  });

  it('returns replay when Express accuracy becomes equal after hundredth-percent rounding', () => {
    expect(
      resolveTournamentDuelResult({
        format: 'express',
        home: { goals: 2, accuracyPercent: 50.004, activeElapsedMs: 80_000 },
        away: { goals: 2, accuracyPercent: 50.001, activeElapsedMs: 90_000 },
      }),
    ).toBe('replay');
  });

  it.each(['mix', 'classic'] as const)(
    'uses lower elapsed time rounded to whole seconds for a tied %s game',
    (format) => {
      expect(
        resolveTournamentDuelResult({
          format,
          home: { goals: 2, accuracyPercent: 1, activeElapsedMs: 60_499 },
          away: { goals: 2, accuracyPercent: 99, activeElapsedMs: 60_500 },
        }),
      ).toBe('home_win');
    },
  );

  it('returns replay instead of overtime or shootout when Classic time is exactly tied', () => {
    expect(
      resolveTournamentDuelResult({
        format: 'classic',
        home: { goals: 2, accuracyPercent: 10, activeElapsedMs: 60_499 },
        away: { goals: 2, accuracyPercent: 99, activeElapsedMs: 60_100 },
      }),
    ).toBe('replay');
  });

  it.each([0, 100])('accepts %i as an inclusive accuracy-percent boundary', (accuracyPercent) => {
    expect(
      resolveTournamentDuelResult({
        format: 'express',
        home: { goals: 1, accuracyPercent, activeElapsedMs: 60_000 },
        away: { goals: 1, accuracyPercent, activeElapsedMs: 60_000 },
      }),
    ).toBe('replay');
  });

  it('rejects accuracy above 100 percent before resolving an Express winner', () => {
    expect(() =>
      resolveTournamentDuelResult({
        format: 'express',
        home: { goals: 1, accuracyPercent: 100.005, activeElapsedMs: 60_000 },
        away: { goals: 1, accuracyPercent: 100, activeElapsedMs: 60_000 },
      }),
    ).toThrow('home accuracyPercent must be a finite number between 0 and 100');
  });

  it.each([
    [
      'fractional goals',
      { goals: 1.5, accuracyPercent: 50, activeElapsedMs: 60_000 },
      { goals: 1, accuracyPercent: 50, activeElapsedMs: 60_000 },
      'home goals must be a non-negative integer',
    ],
    [
      'fractional active elapsed milliseconds',
      { goals: 1, accuracyPercent: 50, activeElapsedMs: 60_000.5 },
      { goals: 1, accuracyPercent: 50, activeElapsedMs: 60_000 },
      'home activeElapsedMs must be a non-negative integer',
    ],
  ] as const)('rejects %s from persisted score metrics', (_label, home, away, message) => {
    expect(() => resolveTournamentDuelResult({ format: 'classic', home, away })).toThrow(message);
  });

  it.each([
    [
      'NaN goals',
      { goals: Number.NaN, accuracyPercent: 50, activeElapsedMs: 60_000 },
      { goals: 1, accuracyPercent: 50, activeElapsedMs: 60_000 },
      'home goals must be a finite non-negative number',
    ],
    [
      'infinite accuracy',
      { goals: 1, accuracyPercent: 50, activeElapsedMs: 60_000 },
      { goals: 1, accuracyPercent: Number.POSITIVE_INFINITY, activeElapsedMs: 60_000 },
      'away accuracyPercent must be a finite non-negative number',
    ],
    [
      'negative elapsed time',
      { goals: 1, accuracyPercent: 50, activeElapsedMs: -1 },
      { goals: 1, accuracyPercent: 50, activeElapsedMs: 60_000 },
      'home activeElapsedMs must be a finite non-negative number',
    ],
  ] as const)(
    'rejects %s score metrics instead of converting them into replay',
    (_label, home, away, message) => {
      expect(() => resolveTournamentDuelResult({ format: 'express', home, away })).toThrow(message);
    },
  );
});

describe('calculateHardGameDeadline', () => {
  it('adds ready-check, snapshotted periods, and only between-period breaks to the planned start', () => {
    expect(
      calculateHardGameDeadline({
        plannedStartAt: new Date('2026-09-10T10:00:00.000Z'),
        readyCheckDurationMs: 15 * 60_000,
        templateTiming: {
          periodDurationsMs: [3 * 60_000, 2 * 60_000],
          breakDurationsMs: [15_000],
        },
      }).toISOString(),
    ).toBe('2026-09-10T10:20:15.000Z');
  });

  it.each([
    [
      'an invalid planned start',
      new Date('invalid'),
      60_000,
      { periodDurationsMs: [60_000], breakDurationsMs: [] },
      'planned start must be a valid date',
    ],
    [
      'a non-positive ready check',
      new Date('2026-09-10T10:00:00.000Z'),
      0,
      { periodDurationsMs: [60_000], breakDurationsMs: [] },
      'ready check duration must be a positive integer',
    ],
    [
      'an empty period list',
      new Date('2026-09-10T10:00:00.000Z'),
      60_000,
      { periodDurationsMs: [], breakDurationsMs: [] },
      'template must contain at least one positive period duration',
    ],
    [
      'an invalid period duration',
      new Date('2026-09-10T10:00:00.000Z'),
      60_000,
      { periodDurationsMs: [0], breakDurationsMs: [] },
      'template must contain at least one positive period duration',
    ],
    [
      'a mismatched break list',
      new Date('2026-09-10T10:00:00.000Z'),
      60_000,
      { periodDurationsMs: [60_000, 60_000], breakDurationsMs: [] },
      'template break durations must cover every interval between periods',
    ],
    [
      'a negative break',
      new Date('2026-09-10T10:00:00.000Z'),
      60_000,
      { periodDurationsMs: [60_000, 60_000], breakDurationsMs: [-1] },
      'template break durations must be non-negative integers',
    ],
  ] as const)(
    'rejects %s',
    (_label, plannedStartAt, readyCheckDurationMs, templateTiming, message) => {
      expect(() =>
        calculateHardGameDeadline({ plannedStartAt, readyCheckDurationMs, templateTiming }),
      ).toThrow(message);
    },
  );
});
