import { describe, expect, it } from 'vitest';
import { getGoalie } from './balance/goalies.js';
import { DEFAULT_MARKSMANSHIP_V4_SCORING_RULES, classifyMarksmanshipShot } from './marksmanship.js';
import { PUCK_START, GOAL_OPENING } from './rink.js';
import { GOALIE_Y } from './goalie/types.js';
import { buildMarksmanshipReplaySnapshot, projectManualMarksmanship } from './marksmanshipConstructor.js';

const input = {
  shotInput: {
    tapTime: 1_200,
    shooterTapTime: 1_180,
    puckSpeedPerMs: 1.25,
    shooterFrequency: 0.75,
    goalieFrequency: 0.6,
    goalFrequency: 0.5,
  },
  goalie: getGoalie('rookie'),
  seed: 'constructor-fixture',
  shotIndex: 1,
  phaseOffsets: { shooter: 0, goal: 0, goalie: 0 },
  earliestTapTime: 0,
  scoring: DEFAULT_MARKSMANSHIP_V4_SCORING_RULES,
};

describe('marksmanship replay snapshot', () => {
  it('uses the authoritative V4 shot classification', () => {
    const snapshot = buildMarksmanshipReplaySnapshot(input);
    expect(snapshot.classification).toEqual(classifyMarksmanshipShot(input));
  });

  it('labels distinct goalie and goal crossing times from puck flight', () => {
    const snapshot = buildMarksmanshipReplaySnapshot(input);
    expect(snapshot.tap.timeMs).toBe(1_200);
    expect(snapshot.goalieCross.timeMs).toBe(1_200 + (PUCK_START.y - GOALIE_Y) / 1.25);
    expect(snapshot.goalCross.timeMs).toBe(1_200 + (PUCK_START.y - GOAL_OPENING.y) / 1.25);
    expect(snapshot.goalieCross.timeMs).toBeLessThan(snapshot.goalCross.timeMs);
  });

  it('reports ordered hitbox bounds rather than only centers', () => {
    const snapshot = buildMarksmanshipReplaySnapshot(input);
    expect(snapshot.goalieCross.goalieHitbox.minX).toBeLessThan(snapshot.goalieCross.goalieHitbox.maxX);
    expect(snapshot.goalCross.goalHitbox.minX).toBeLessThan(snapshot.goalCross.goalHitbox.maxX);
    expect(snapshot.tap.playerX).toBeGreaterThanOrEqual(0);
  });
});

describe('manual marksmanship projection', () => {
  const base = { playerX: 300, goalCenterX: 300, goalieCenterX: 300, goalWidth: 80, goalieWidth: 60 };

  it.each([
    [{ ...base }, 'save'],
    [{ ...base, playerX: 335 }, 'goal'],
    [{ ...base, playerX: 341 }, 'miss'],
    [{ ...base, playerX: 330 }, 'save'],
    [{ ...base, playerX: 340 }, 'goal'],
  ] as const)('classifies static X intersections at the hitbox edges', (sample, expected) => {
    const projection = projectManualMarksmanship(sample);
    expect(projection.result).toBe(expected);
    expect(projection.points).toBeNull();
    expect(projection.category).toBeNull();
    expect(projection.reason).toBe('manual_static_only');
  });

  it('clamps centers so the entire hitbox stays on the rink', () => {
    const projection = projectManualMarksmanship({ ...base, goalCenterX: 0, goalieCenterX: 572 });
    expect(projection.goalCenterX).toBe(40);
    expect(projection.goalHitbox).toEqual({ minX: 0, maxX: 80 });
    expect(projection.goalieCenterX).toBe(542);
    expect(projection.goalieHitbox).toEqual({ minX: 512, maxX: 572 });
  });

  it('rejects non-finite coordinates and impossible widths', () => {
    expect(() => projectManualMarksmanship({ ...base, playerX: Number.NaN })).toThrow();
    expect(() => projectManualMarksmanship({ ...base, goalWidth: 573 })).toThrow();
  });
});
