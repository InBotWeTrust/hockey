import { describe, expect, it } from 'vitest';
import {
  automaticLifecycleVersion,
  normalizePublishedTournamentLifecycleRules,
} from '../../src/tournament/lifecycleRules.js';
import { parseRules } from '../../src/tournament/routes.js';

describe('normalizePublishedTournamentLifecycleRules', () => {
  it('marks newly published tournament rules for automatic lifecycle v1', () => {
    const normalized = normalizePublishedTournamentLifecycleRules({
      config: { regularSource: 'daily_aggregate' },
      playoffRounds: [],
    });

    expect(normalized.automaticLifecycleVersion).toBe(1);
    expect(automaticLifecycleVersion(normalized)).toBe(1);
  });

  it('does not treat an unmarked persisted rules snapshot as automatic lifecycle enabled', () => {
    expect(
      automaticLifecycleVersion({
        config: { regularSource: 'head_to_head' },
        playoffRounds: [],
      }),
    ).toBeNull();
  });

  it('marks newly published head-to-head rules for lifecycle v2', () => {
    expect(
      normalizePublishedTournamentLifecycleRules({
        config: { regularSource: 'head_to_head' },
        playoffRounds: [],
      }),
    ).toMatchObject({ duelLifecycleVersion: 2 });
  });

  it('defaults readiness, cadence, and best-of-seven two-day capacities', () => {
    const normalized = normalizePublishedTournamentLifecycleRules({
      config: { regularSource: 'head_to_head' },
      playoffRounds: [
        {
          roundNumber: 1,
          winsRequired: 4,
          scheduleDays: [
            { localDate: '2030-10-26', firstWaveLocalTime: '20:00' },
            { localDate: '2030-10-27', firstWaveLocalTime: '20:00' },
          ],
        },
      ],
    });

    expect(normalized.playoffRounds).toEqual([
      expect.objectContaining({
        readinessMinutes: 5,
        plannedStartIntervalMinutes: 20,
        scheduleDays: [
          { localDate: '2030-10-26', firstWaveLocalTime: '20:00', maxResultGames: 4 },
          { localDate: '2030-10-27', firstWaveLocalTime: '20:00', maxResultGames: 3 },
        ],
      }),
    ]);
  });

  it('defaults a one-day best-of-seven capacity to all seven games', () => {
    const normalized = normalizePublishedTournamentLifecycleRules({
      config: { regularSource: 'daily_aggregate' },
      playoffRounds: [
        {
          roundNumber: 1,
          winsRequired: 4,
          scheduleDays: [{ localDate: '2030-10-26', firstWaveLocalTime: '20:00' }],
        },
      ],
    });

    expect(normalized.playoffRounds).toEqual([
      expect.objectContaining({
        scheduleDays: [{ localDate: '2030-10-26', firstWaveLocalTime: '20:00', maxResultGames: 7 }],
      }),
    ]);
    expect(normalized).not.toHaveProperty('duelLifecycleVersion');
  });

  it('accepts an explicit three-day best-of-three schedule', () => {
    const normalized = normalizePublishedTournamentLifecycleRules({
      config: { regularSource: 'head_to_head' },
      playoffRounds: [
        {
          roundNumber: 1,
          winsRequired: 2,
          scheduleDays: [
            { localDate: '2030-10-26', firstWaveLocalTime: '20:00', maxResultGames: 1 },
            { localDate: '2030-10-27', firstWaveLocalTime: '20:00', maxResultGames: 1 },
            { localDate: '2030-10-28', firstWaveLocalTime: '20:00', maxResultGames: 1 },
          ],
        },
      ],
    });

    expect(normalized.playoffRounds).toEqual([
      expect.objectContaining({
        readinessMinutes: 5,
        plannedStartIntervalMinutes: 20,
        scheduleDays: [
          { localDate: '2030-10-26', firstWaveLocalTime: '20:00', maxResultGames: 1 },
          { localDate: '2030-10-27', firstWaveLocalTime: '20:00', maxResultGames: 1 },
          { localDate: '2030-10-28', firstWaveLocalTime: '20:00', maxResultGames: 1 },
        ],
      }),
    ]);
  });

  it('validates explicit day capacities through the shared Task 1 contract', () => {
    expect(() =>
      normalizePublishedTournamentLifecycleRules({
        config: { regularSource: 'head_to_head' },
        playoffRounds: [
          {
            roundNumber: 1,
            winsRequired: 4,
            readinessMinutes: 5,
            plannedStartIntervalMinutes: 20,
            scheduleDays: [
              {
                localDate: '2030-10-26',
                firstWaveLocalTime: '20:00',
                maxResultGames: 3,
              },
              {
                localDate: '2030-10-27',
                firstWaveLocalTime: '20:00',
                maxResultGames: 3,
              },
            ],
          },
        ],
      }),
    ).toThrow('game day limits must equal the maximum possible series games');
  });

  it('keeps old persisted rules unmarked when explicitly normalizing in legacy mode', () => {
    expect(
      normalizePublishedTournamentLifecycleRules(
        { config: { regularSource: 'head_to_head' }, playoffRounds: [] },
        { markNewHeadToHead: false },
      ),
    ).not.toHaveProperty('duelLifecycleVersion');
  });
});

describe('published tournament route rules', () => {
  it('persists lifecycle defaults after parsing a new head-to-head draft', () => {
    const parsed = parseRules({
      config: {
        regularSource: 'head_to_head',
        participantLimit: 4,
        playoffSize: 2,
        timezone: 'Europe/Moscow',
        registrationMode: 'open',
        visibility: 'public',
        entryFeeCoins: 0,
        roundRobinCycles: 1,
        roundsPerDay: 1,
        firstRoundLocalTime: '10:00',
        fixtureWindowMs: 3_600_000,
        roundBreakMs: 0,
        dailyDays: null,
        dailyMetric: null,
        bestDays: null,
      },
      eligibility: {
        minLevel: null,
        maxLevel: null,
        minGoals: 0,
        minExperience: 0,
        invitedUserIds: [],
        bannedUserIds: [],
      },
      playoffRounds: [
        {
          roundNumber: 1,
          winsRequired: 1,
          scheduleDays: [{ localDate: '2030-10-26', firstWaveLocalTime: '20:00' }],
        },
      ],
    });

    expect(parsed).toMatchObject({
      duelLifecycleVersion: 2,
      automaticLifecycleVersion: 1,
      playoffRounds: [
        {
          readinessMinutes: 5,
          plannedStartIntervalMinutes: 20,
          scheduleDays: [{ maxResultGames: 1 }],
        },
      ],
    });
  });

  it('rejects explicit invalid lifecycle values as bad requests', () => {
    const cases = [
      {
        round: { readinessMinutes: 121 },
        message: 'readiness minutes must be between 1 and 120',
      },
      {
        round: { plannedStartIntervalMinutes: 1441 },
        message: 'planned start interval minutes must be between 1 and 1440',
      },
      {
        round: {
          scheduleDays: [
            { localDate: '2030-10-26', firstWaveLocalTime: '20:00', maxResultGames: 0 },
          ],
        },
        message: 'game day maxResultGames must be a positive integer',
      },
    ];

    for (const testCase of cases) {
      let thrown: unknown;
      try {
        parseRules({
          config: {
            regularSource: 'head_to_head',
            participantLimit: 4,
            playoffSize: 2,
            timezone: 'Europe/Moscow',
            registrationMode: 'open',
            visibility: 'public',
            entryFeeCoins: 0,
            roundRobinCycles: 1,
            roundsPerDay: 1,
            firstRoundLocalTime: '10:00',
            fixtureWindowMs: 3_600_000,
            roundBreakMs: 0,
            dailyDays: null,
            dailyMetric: null,
            bestDays: null,
          },
          eligibility: {
            minLevel: null,
            maxLevel: null,
            minGoals: 0,
            minExperience: 0,
            invitedUserIds: [],
            bannedUserIds: [],
          },
          playoffRounds: [
            {
              roundNumber: 1,
              winsRequired: 1,
              readinessMinutes: 5,
              plannedStartIntervalMinutes: 20,
              scheduleDays: [
                { localDate: '2030-10-26', firstWaveLocalTime: '20:00', maxResultGames: 1 },
              ],
              ...testCase.round,
            },
          ],
        });
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toMatchObject({
        code: 'bad_request',
        statusCode: 400,
        message: testCase.message,
      });
    }
  });
});
