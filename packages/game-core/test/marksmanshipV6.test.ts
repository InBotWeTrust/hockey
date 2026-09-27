import { describe, expect, it } from 'vitest';
import { classifyMarksmanshipV5Score } from '../src/marksmanshipV5.js';
import {
  classifyMarksmanshipV6Score,
  type MarksmanshipV6Measurements,
} from '../src/marksmanshipV6.js';

const baseline: MarksmanshipV6Measurements = {
  puckX: 280,
  goalMin: 220.2,
  goalMax: 300,
  goalieMin: 190,
  goalieMax: 260,
  shooterDirection: 1,
  goalDirection: 1,
  goalieDirection: 1,
};

function score(overrides: Partial<MarksmanshipV6Measurements>) {
  return classifyMarksmanshipV6Score({ ...baseline, ...overrides });
}

describe('marksmanship V6 classification', () => {
  it.each([
    [{ goalieMax: 290, puckX: 295 }, 'super_precise', 20],
    [{ goalieMax: 270, puckX: 276 }, 'edge', 18],
    [{ goalieMax: 240, puckX: 280 }, 'precise', 14],
    [{ goalieMax: 239.999, puckX: 280 }, 'complex', 13],
    [{ goalieMax: 220.2, puckX: 280 }, 'complex', 13],
    [{ goalMin: 162.161, goalMax: 241.961, goalieMin: 106.392,
      goalieMax: 180.152, puckX: 220.099, shooterDirection: -1,
      goalDirection: 1, goalieDirection: -1 }, 'complex', 13],
    [{ goalieMin: 140, goalieMax: 219.7, goalDirection: -1 }, 'counter_direction', 13],
    [{ goalieMin: 140, goalieMax: 219.7 }, 'near_goalie', 12],
    [{ goalieMin: 70, goalieMax: 145.2, goalDirection: -1 }, 'counter_direction', 13],
    [{ goalieMin: 70, goalieMax: 145.199, goalDirection: -1 }, 'ordinary', 10],
  ] as const)('classifies %s as %s worth %i tenths', (input, technique, points) => {
    expect(score(input)).toMatchObject({ technique, points });
  });

  it('uses the puck side, not the opposite gap, at 10 and 60', () => {
    expect(score({ goalieMax: 290, puckX: 295 }).technique).toBe('super_precise');
    expect(score({ goalieMax: 240, puckX: 280 }).technique).toBe('precise');
    expect(score({ goalMin: 272, goalMax: 351.8, goalieMin: 332, goalieMax: 405,
      puckX: 300, shooterDirection: -1, goalieDirection: -1 }).technique).toBe('precise');
    expect(score({ goalMin: 272, goalMax: 351.8, goalieMin: 332.001, goalieMax: 405,
      puckX: 300, shooterDirection: -1 }).technique).toBe('complex');
  });

  it('requires an edge puck within six units beyond the super-precise gap', () => {
    expect(score({ goalieMax: 270, puckX: 276 }).technique).toBe('edge');
    expect(score({ goalieMax: 270, puckX: 276.001 }).technique).toBe('precise');
    expect(score({ goalieMax: 290, puckX: 296 }).technique).toBe('super_precise');
  });

  it.each([
    { goalMin: 55, goalMax: 134.8, goalieMin: 85, goalieMax: 158.76, puckX: 65 },
    { goalMin: 437.2, goalMax: 517, goalieMin: 413.24, goalieMax: 487, puckX: 500 },
    { goalMin: 40, goalMax: 119.8, goalieMin: 70, goalieMax: 143.76, puckX: 50 },
    { goalMin: 452.2, goalMax: 532, goalieMin: 428.24, goalieMax: 502, puckX: 520 },
  ])('keeps the four corner windows mirrored on the puck side', (input) => {
    expect(score(input)).toMatchObject({ technique: 'corner', points: 17 });
  });

  it('does not award a left-board corner to a puck passing on the right', () => {
    expect(score({ goalMin: 55, goalMax: 134.8, goalieMin: 45,
      goalieMax: 94.8, puckX: 120 }).technique).toBe('precise');
  });

  it('awards behind-goalie only on the shooter travel side in both directions', () => {
    expect(score({ goalieMax: 260, goalDirection: -1, goalieDirection: -1 })
      .technique).toBe('behind_goalie');
    expect(score({ goalMin: 272, goalMax: 351.8, goalieMin: 312, goalieMax: 385.76,
      puckX: 292, shooterDirection: -1, goalDirection: 1, goalieDirection: 1 })
      .technique).toBe('behind_goalie');
    expect(score({ goalieMin: 240, goalieMax: 310, puckX: 230, goalDirection: -1,
      goalieDirection: -1 }).availableTechniques).not.toContain('behind_goalie');
  });

  it('selects the higher-priority category when conditions overlap', () => {
    expect(score({ goalMin: 55, goalMax: 134.8, goalieMin: 85, goalieMax: 158.76,
      puckX: 80 }).technique).toBe('edge');
    expect(score({ goalieMax: 270, puckX: 276 }).availableTechniques).toContain('precise');
  });

  it('is deterministic and leaves the V5 interpretation of the recorded gap unchanged', () => {
    const measurements = { ...baseline, goalMin: 162.161, goalMax: 241.961,
      goalieMin: 106.392, goalieMax: 180.152, puckX: 220.099,
      shooterDirection: -1 as const };
    expect(classifyMarksmanshipV6Score(measurements)).toEqual(
      classifyMarksmanshipV6Score(measurements),
    );
    expect(classifyMarksmanshipV5Score(measurements).technique).toBe('ordinary');
  });
});
