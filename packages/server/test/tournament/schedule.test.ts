import { describe, expect, it } from 'vitest';
import { assignSequentialRoundWindows, generateRoundRobin } from '../../src/tournament/schedule.js';

describe('generateRoundRobin', () => {
  it.each([
    [1, ['neutral_default']],
    [2, ['home_selected', 'home_selected']],
    [3, ['home_selected', 'home_selected', 'neutral_default']],
    [4, ['home_selected', 'home_selected', 'home_selected', 'home_selected']],
    [5, ['home_selected', 'home_selected', 'home_selected', 'home_selected', 'neutral_default']],
  ] as const)(
    'assigns literal venue modes across %i cycle(s)',
    (cycles, expectedVenueModes) => {
      const rounds = generateRoundRobin(['a', 'b'], cycles);

      expect(rounds.map((round) => round.fixtures[0]!.venueMode)).toEqual(expectedVenueModes);
    },
  );

  it('gives each participant one selected-home fixture in an even paired cycle set', () => {
    const rounds = generateRoundRobin(['a', 'b'], 4);
    const fixtures = rounds.map((round) => round.fixtures[0]!);

    expect(fixtures).toEqual([
      { homeParticipantId: 'a', awayParticipantId: 'b', venueMode: 'home_selected' },
      { homeParticipantId: 'b', awayParticipantId: 'a', venueMode: 'home_selected' },
      { homeParticipantId: 'a', awayParticipantId: 'b', venueMode: 'home_selected' },
      { homeParticipantId: 'b', awayParticipantId: 'a', venueMode: 'home_selected' },
    ]);
  });

  it('keeps deterministic home and away score sides in the unmatched neutral cycle', () => {
    const rounds = generateRoundRobin(['a', 'b'], 5);
    const neutralFixture = rounds[4]!.fixtures[0]!;

    expect(neutralFixture).toEqual({
      homeParticipantId: 'a',
      awayParticipantId: 'b',
      venueMode: 'neutral_default',
    });
  });

  it('creates every pair once per cycle and reverses homes in the second cycle', () => {
    const rounds = generateRoundRobin(['a', 'b', 'c', 'd'], 2);

    expect(rounds).toHaveLength(6);
    expect(rounds[0]).toEqual({
      cycleNumber: 1,
      roundNumber: 1,
      fixtures: [
        { homeParticipantId: 'a', awayParticipantId: 'd', venueMode: 'home_selected' },
        { homeParticipantId: 'c', awayParticipantId: 'b', venueMode: 'home_selected' },
      ],
      byeParticipantId: null,
    });

    const pairCounts = new Map<string, number>();
    for (const round of rounds) {
      for (const fixture of round.fixtures) {
        const key = [fixture.homeParticipantId, fixture.awayParticipantId].sort().join(':');
        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
      }
    }
    expect([...pairCounts.values()]).toEqual([2, 2, 2, 2, 2, 2]);

    const first = rounds[0]!.fixtures[0]!;
    const reversed = rounds[3]!.fixtures.find(
      (fixture) =>
        fixture.homeParticipantId === first.awayParticipantId &&
        fixture.awayParticipantId === first.homeParticipantId,
    );
    expect(reversed).toBeDefined();
  });

  it('gives every participant one bye in an odd-sized cycle', () => {
    const rounds = generateRoundRobin(['a', 'b', 'c'], 1);

    expect(rounds).toHaveLength(3);
    expect(rounds.map((round) => round.byeParticipantId).sort()).toEqual(['a', 'b', 'c']);
    expect(rounds.every((round) => round.fixtures.length === 1)).toBe(true);
  });
});

describe('assignSequentialRoundWindows', () => {
  it('packs rounds sequentially and starts a new matchday after the configured count', () => {
    const windows = assignSequentialRoundWindows({
      roundCount: 3,
      roundsPerDay: 2,
      firstStart: new Date('2026-09-01T07:00:00.000Z'),
      fixtureWindowMs: 60 * 60_000,
      roundBreakMs: 30 * 60_000,
    });

    expect(windows).toEqual([
      {
        roundNumber: 1,
        matchdayNumber: 1,
        startsAt: '2026-09-01T07:00:00.000Z',
        endsAt: '2026-09-01T08:00:00.000Z',
      },
      {
        roundNumber: 2,
        matchdayNumber: 1,
        startsAt: '2026-09-01T08:30:00.000Z',
        endsAt: '2026-09-01T09:30:00.000Z',
      },
      {
        roundNumber: 3,
        matchdayNumber: 2,
        startsAt: '2026-09-02T07:00:00.000Z',
        endsAt: '2026-09-02T08:00:00.000Z',
      },
    ]);
  });

  it('keeps the configured local first-round time across a DST transition', () => {
    const windows = assignSequentialRoundWindows({
      roundCount: 3,
      roundsPerDay: 1,
      firstStart: new Date('2026-03-07T15:00:00.000Z'),
      timezone: 'America/New_York',
      firstRoundLocalTime: '10:00',
      fixtureWindowMs: 60 * 60_000,
      roundBreakMs: 0,
    });

    expect(windows.map((window) => window.startsAt)).toEqual([
      '2026-03-07T15:00:00.000Z',
      '2026-03-08T14:00:00.000Z',
      '2026-03-09T14:00:00.000Z',
    ]);
  });
});
