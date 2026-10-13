import { describe, expect, it } from 'vitest';
import * as core from './index.js';
describe('immutable ski attempts', () => {
  it('uses accepted pauses and blocks shots only until descent ends', () => {
    expect(core).toHaveProperty('createSkiAttemptSampler');
    const sampler = core.createSkiAttemptSampler(
      { version: 1, seed: 'ski-test', durationMs: 180000 },
      { goal: 0.5, goalie: 0.6, player: 0.75 },
    );
    const pauses = [{ tapTime: 2000, flightMs: 400 }];
    expect(sampler.player(2200, pauses).clock).toBe(sampler.player(2000, pauses).clock);
    const events = sampler.events(pauses);
    expect(events).toHaveLength(22);
    const slip = events.find((e) => e.target === 'player')!;
    expect(sampler.player(slip.startMs + 1, pauses).canShoot).toBe(false);
    expect(sampler.player(slip.endMs, pauses).canShoot).toBe(true);
    expect(events.every((e, i) => !i || e.startMs - events[i - 1]!.endMs >= 4000)).toBe(true);
  });
});

it('derives collision clocks from the snapshot and ignores claimed movement', () => {
  expect(core).toHaveProperty('resolveSkiCourtShot');
  const config = {
    id: 'ski',
    name: 'ski',
    pattern: 'linear' as const,
    hp: 0,
    baseReward: 0,
    firstClearBonus: 0,
    speed: 0,
    amplitude: 1,
    frequency: 0.6,
    goalAmplitude: 220,
    goalFrequency: 0.5,
  };
  const rules = { version: 1 as const, seed: 'ski-test', durationMs: 180000 };
  const input = {
    tapTime: 2500,
    shooterFrequency: 0.75,
    goalFrequency: 0.5,
    goalieFrequency: 0.6,
    puckSpeedPerMs: 1.25,
  };
  expect(
    core.resolveSkiCourtShot({ ...input, shooterMotionTime: 999999 }, config, 'shot', 1, rules, []),
  ).toEqual(core.resolveSkiCourtShot(input, config, 'shot', 1, rules, []));
});
