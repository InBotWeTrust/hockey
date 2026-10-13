import { expect, it } from 'vitest';
import { GOALIES, PUCK_START, GOAL_OPENING } from '@hockey/game-core';
import { resolveVersionedBeachShot } from '../../src/bonusGames/beachShot.js';
const environment = { beach: { version: 1 as const, meltDurationMs: 150000, finalSpeedMultiplier: .85,
  puddles: [{ id: 'water', x: 286, y: 300, radiusX: 200, radiusY: 50, deepRatio: 1, speedMultiplier: .65,
    warningMs: 0, activeMs: 0, fullMs: 0, initialScale: 1 }] } };
const args = { input: { tapTime: 2000, shooterMotionTime: 250, shooterFrequency: 1, puckSpeedPerMs: 1 },
  goalie: GOALIES[0]!, seed: 'seed', shotIndex: 1, slug: 'challenge-beach', coreVersion: 72, environment };
it('computes blocked shot from saved geometry and returns authoritative flight metadata', () => {
  const shot = resolveVersionedBeachShot(args)!;
  expect(shot.result.type).toBe('miss');
  expect(shot.blockedByWater).toBe(true);
  expect(shot.flight.durationMs).toBeLessThan(PUCK_START.y - GOAL_OPENING.y);
  expect(JSON.stringify(resolveVersionedBeachShot(args))).toEqual(JSON.stringify(shot));
});
it('leaves legacy snapshots on their existing resolver', () => {
  expect(resolveVersionedBeachShot({ ...args, environment: null, coreVersion: 71 })).toBeNull();
});
it('rejects beach mechanics under old core or another location', () => {
  expect(() => resolveVersionedBeachShot({ ...args, coreVersion: 71 })).toThrow();
  expect(() => resolveVersionedBeachShot({ ...args, slug: 'challenge-desert' })).toThrow();
});
