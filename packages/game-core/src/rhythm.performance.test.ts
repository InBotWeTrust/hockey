import { afterEach, expect, it, vi } from 'vitest';
import * as rng from './rng.js';
import { createRhythmMovementSampler } from './rhythm.js';

const input = {seed: 'movement', userId: 'local', periodNumber: 1, elapsedMs: 0,
  movementDistancePx: 0, baseLaneWidthPx: 600, baselineShooterSpeed: .75,
  currentShooterSpeed: .75, loadout: {stick: null, skates: null, nutrition: null}};
afterEach(() => { vi.restoreAllMocks(); });

it('does not regenerate the same stumble events on every 10ms step during late-period catchup', () => {
  const random = vi.spyOn(rng, 'createRng');
  const sampler = createRhythmMovementSampler({...input, seed: 'late-catchup-budget'});
  sampler.motionAt(150000);
  // A 150s period contains tens of stumble events, not thousands of random seeds.
  // Count actual costly RNG construction, rather than a machine-dependent time limit.
  expect(random.mock.calls.length).toBeLessThan(1000);
});

it('preserves recorded movement and contact results across pause insertion and backwards sampling', () => {
  const sampler = createRhythmMovementSampler(input);
  const pauses = [{tapTime: 1234, flightMs: 517}, {tapTime: 90234, flightMs: 611}];
  for (const [time, motion, contacts, canShoot] of [
    [30000, 20294.5, 30, true], [150000, 96698.75, 145, true],
    [90000, 59604.5, 89, false], [1510, 1234, 2, true], [90235, 59604.5, 89, false],
  ] as const) {
    expect(sampler.motionAt(time, pauses)).toBe(motion);
    expect(sampler.boardContactsAt(time, pauses)).toBe(contacts);
    expect(sampler.conditionAt(time, pauses).canShoot).toBe(canShoot);
  }
});
