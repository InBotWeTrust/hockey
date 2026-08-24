import { describe, expect, it } from 'vitest';
import {
  awardSharedPlacePoints,
  calculateDailyAggregateStandings,
  rankHeadToHeadStandings,
} from '../../src/tournament/standings.js';

describe('daily aggregate standings', () => {
  it('shares the average points for tied occupied places', () => {
    expect(
      awardSharedPlacePoints(
        [
          { participantId: 'a', value: 10 },
          { participantId: 'b', value: 8 },
          { participantId: 'c', value: 8 },
          { participantId: 'd', value: 4 },
        ],
        [10, 6, 3, 1],
      ),
    ).toEqual([
      { participantId: 'a', place: 1, points: 10 },
      { participantId: 'b', place: 2, points: 4.5 },
      { participantId: 'c', place: 2, points: 4.5 },
      { participantId: 'd', place: 4, points: 1 },
    ]);
  });

  it('counts only complete days and keeps the best N results', () => {
    const standings = calculateDailyAggregateStandings(
      [
        { participantId: 'a', day: 1, goals: 10, shots: 20, completed: true },
        { participantId: 'a', day: 2, goals: 8, shots: 20, completed: true },
        { participantId: 'a', day: 3, goals: 100, shots: 100, completed: false },
        { participantId: 'b', day: 1, goals: 9, shots: 10, completed: true },
        { participantId: 'b', day: 2, goals: 9, shots: 10, completed: true },
      ],
      { metric: 'goals_sum', bestDays: 1 },
    );

    expect(standings).toEqual([
      { participantId: 'a', value: 10, countedDays: [1] },
      { participantId: 'b', value: 9, countedDays: [1] },
    ]);
  });

  it('averages accuracy per completed day instead of pooling shots', () => {
    const standings = calculateDailyAggregateStandings(
      [
        { participantId: 'a', day: 1, goals: 1, shots: 1, completed: true },
        { participantId: 'a', day: 2, goals: 0, shots: 9, completed: true },
      ],
      { metric: 'accuracy_average', bestDays: null },
    );
    expect(standings[0]?.value).toBe(0.5);
  });
});

describe('head-to-head tie-break chain', () => {
  it('uses criteria in configured order and reports a playoff-boundary tie', () => {
    const result = rankHeadToHeadStandings(
      [
        { participantId: 'a', points: 10, wins: 3, goalsFor: 9, goalsAgainst: 4 },
        { participantId: 'b', points: 10, wins: 2, goalsFor: 20, goalsAgainst: 5 },
        { participantId: 'c', points: 8, wins: 2, goalsFor: 10, goalsAgainst: 5 },
        { participantId: 'd', points: 8, wins: 2, goalsFor: 10, goalsAgainst: 5 },
      ],
      ['points', 'wins', 'goal_difference'],
      3,
    );

    expect(result.rows.map((row) => row.participantId)).toEqual(['a', 'b', 'c', 'd']);
    expect(result.boundaryTieParticipantIds).toEqual(['c', 'd']);
  });
});
