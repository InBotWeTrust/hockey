import { describe, expect, it } from 'vitest';
import { getGoalie } from './balance/goalies.js';
import { DEFAULT_MARKSMANSHIP_V4_SCORING_RULES, classifyMarksmanshipShot } from './marksmanship.js';
import { PUCK_START, GOAL_OPENING } from './rink.js';
import { GOALIE_Y } from './goalie/types.js';
import { buildMarksmanshipReplaySnapshot } from './marksmanshipConstructor.js';

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
