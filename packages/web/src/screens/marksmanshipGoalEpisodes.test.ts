import { describe, expect, it } from 'vitest';
import { groupGoalEpisodes } from './marksmanshipGoalEpisodes.js';

describe('groupGoalEpisodes', () => {
  it('combines adjacent goal samples and chooses a playable moment inside each window', () => {
    const episodes = groupGoalEpisodes([
      { timeMs: 0, points: 0, technique: null },
      { timeMs: 50, points: 10, technique: 'ordinary' },
      { timeMs: 100, points: 20, technique: 'precise' },
      { timeMs: 150, points: 0, technique: null },
      { timeMs: 200, points: 15, technique: 'near_goalie' },
    ]);
    expect(episodes).toEqual([
      { startMs: 50, endMs: 100, timeMs: 100, points: 20, technique: 'precise' },
      { startMs: 200, endMs: 200, timeMs: 200, points: 15, technique: 'near_goalie' },
    ]);
  });
});
