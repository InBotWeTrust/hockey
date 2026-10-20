import { describe, expect, it } from 'vitest';
import { classifyMarksmanshipV5Score, type MarksmanshipV5Measurements } from '../src/marksmanshipV5.js';

const baseline: MarksmanshipV5Measurements = {
  puckX: 290,
  goalMin: 220.2,
  goalMax: 300,
  goalieMin: 210,
  goalieMax: 280,
  shooterDirection: 1,
  goalDirection: 1,
  goalieDirection: 1,
};

function score(overrides: Partial<MarksmanshipV5Measurements>) {
  return classifyMarksmanshipV5Score({ ...baseline, ...overrides });
}

describe('marksmanship V5 visible techniques', () => {
  it.each([
    [{ goalMin: 220.2, goalMax: 300, goalieMin: 220, goalieMax: 294, puckX: 297 }, 'super_precise', 20],
    [{ goalieMin: 210, goalieMax: 290, puckX: 292 }, 'edge', 18],
    [{ goalMin: 55, goalMax: 134.8, goalieMin: 45, goalieMax: 114.8, puckX: 120 }, 'corner', 17],
    [{ goalieMin: 210, goalieMax: 280, puckX: 290, goalDirection: -1, goalieDirection: -1 }, 'behind_goalie', 16],
    [{ goalieMin: 210, goalieMax: 280, puckX: 290 }, 'precise', 14],
    [{ goalieMin: 130, goalieMax: 204, puckX: 250, goalDirection: -1 }, 'counter_direction', 13],
    [{ goalieMin: 140, goalieMax: 214, puckX: 250 }, 'near_goalie', 12],
    [{ goalieMin: 60, goalieMax: 134, puckX: 250 }, 'ordinary', 10],
  ] as const)('classifies %s as %s worth %i tenths', (input, technique, points) => {
    expect(score(input)).toMatchObject({ technique, points });
  });

  it('selects super precise over edge at a six-unit inner gap', () => {
    const result = score({ goalieMin: 220, goalieMax: 294, puckX: 297 });
    expect(result).toMatchObject({ technique: 'super_precise', points: 20 });
    expect(result.availableTechniques).toContain('edge');
  });

  it('selects edge immediately beyond the super precise gap', () => {
    expect(score({ goalieMin: 220, goalieMax: 293.999, puckX: 296 })).toMatchObject({
      technique: 'edge', points: 18,
    });
  });

  it('requires the puck to stay within three units of the goalie edge for edge', () => {
    expect(score({ goalieMin: 210, goalieMax: 290, puckX: 293 })).toMatchObject({ technique: 'edge' });
    expect(score({ goalieMin: 210, goalieMax: 290, puckX: 293.001 })).toMatchObject({
      technique: 'precise', points: 14,
    });
  });

  it('mirrors behind-goalie without requiring both directions at once', () => {
    expect(score({
      goalieMin: 240, goalieMax: 270, puckX: 285,
      shooterDirection: 1, goalDirection: -1, goalieDirection: -1,
    })).toMatchObject({ technique: 'behind_goalie', points: 16 });
    expect(score({
      goalMin: 272, goalMax: 351.8, goalieMin: 302, goalieMax: 332, puckX: 287,
      shooterDirection: -1, goalDirection: 1, goalieDirection: 1,
    })).toMatchObject({ technique: 'behind_goalie', points: 16 });
    expect(score({
      goalieMin: 240, goalieMax: 270, puckX: 230,
      shooterDirection: 1, goalDirection: -1, goalieDirection: -1,
    }).availableTechniques).not.toContain('behind_goalie');
  });

  it.each([
    { goalMin: 55, goalMax: 134.8, goalieMin: 45, goalieMax: 114.8, puckX: 120 },
    { goalMin: 437.2, goalMax: 517, goalieMin: 457.2, goalieMax: 527, puckX: 450 },
    { goalMin: 100, goalMax: 179.8, goalieMin: 71.7, goalieMax: 145.46, puckX: 150 },
    { goalMin: 392.2, goalMax: 472, goalieMin: 427.14, goalieMax: 500.9, puckX: 420 },
  ])('scores each of the four mirrored corner positions', (input) => {
    expect(score(input)).toMatchObject({ technique: 'corner', points: 17 });
  });

  it('uses an outer gap of 8–75 only for counter-direction', () => {
    expect(score({ goalieMin: 130, goalieMax: 212.2, puckX: 250, goalDirection: -1 }))
      .toMatchObject({ technique: 'counter_direction' });
    expect(score({ goalieMin: 130, goalieMax: 145.2, puckX: 250, goalDirection: -1 }))
      .toMatchObject({ technique: 'counter_direction' });
    expect(score({ goalieMin: 130, goalieMax: 145.199, puckX: 250, goalDirection: -1 }))
      .toMatchObject({ technique: 'ordinary' });
    expect(score({ goalieMin: 130, goalieMax: 212.201, puckX: 250, goalDirection: -1 }))
      .toMatchObject({ technique: 'near_goalie' });
  });

  it('scores a wide inner gap or a narrow outer gap as near goalie', () => {
    expect(score({ goalieMin: 154, goalieMax: 228, puckX: 250 }))
      .toMatchObject({ technique: 'near_goalie', points: 12 });
    expect(score({ goalieMin: 140, goalieMax: 214, puckX: 250 }))
      .toMatchObject({ technique: 'near_goalie', points: 12 });
  });
});
