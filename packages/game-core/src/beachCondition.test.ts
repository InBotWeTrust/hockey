import { expect, it } from 'vitest';
import { getBonusChallengeCondition, getBonusChallengeShooterMotionTime, type BonusChallengeEnvironmentRules } from './bonusChallenge.js';

const rules: BonusChallengeEnvironmentRules = {
  baseModifiers: { goalMultiplier: 1, goalieMultiplier: 1, shooterMultiplier: .9, puckSpeedMultiplier: .9, label: 'test' },
  fatigue: { slowdownStartMs: 8, heavyStartMs: 18, stopStartMs: 30, stopDurationMs: 4, recoveryDurationMs: 8, slowMultiplier: .85, heavyMultiplier: .65 },
  beach: { version: 1, meltDurationMs: 100, finalSpeedMultiplier: .8, puddles: [] },
  stumbleWindows: [{ startMs: 33, durationMs: 4 }, { startMs: 50, durationMs: 2 }],
};
it('uses duel recovery cycle only for new beach snapshots', () => {
  expect(getBonusChallengeCondition(rules, 42).fatigueLevel).toBe('medium');
  const legacy = { ...rules };
    delete legacy.beach;
  expect(getBonusChallengeCondition(legacy, 42).fatigueLevel).toBe('none');
});
it('multiplies melt slowdown with base and fatigue, including after rest', () => {
  expect(getBonusChallengeCondition(rules, 10).shooterSpeedMultiplier).toBeCloseTo(.9 * .98 * .85);
  expect(getBonusChallengeCondition(rules, 35).shooterSpeedMultiplier).toBeCloseTo(.9 * .93);
  expect(getBonusChallengeCondition(rules, 100).puckSpeedMultiplier).toBeCloseTo(.72);
});
it('skips an entire stumble overlapping rest, including its tail', () => {
  expect(getBonusChallengeCondition(rules, 34)).toMatchObject({ canShoot: true, stumbleActive: false });
  expect(getBonusChallengeCondition(rules, 50)).toMatchObject({ canShoot: false, stumbleActive: true });
});
it('integrates linear melting analytically across rests, stumbles, shots and frequency clamp', () => {
  const pauses = [{ tapTime: 9, flightMs: 4 }, { tapTime: 12, flightMs: 5 }];
  for (const frequency of [.75, .12]) {
    let reference = 0;
    const step = .01;
    for (let i = 0; i < 15000; i++) {
      const t = (i + .5) * step;
      const state = getBonusChallengeCondition(rules, t);
      if (state.canShoot && !pauses.some(p => t >= p.tapTime && t < p.tapTime + p.flightMs)) {
        reference += step * Math.max(.1 / frequency, state.shooterSpeedMultiplier);
      }
    }
    expect(getBonusChallengeShooterMotionTime(rules, 150, frequency, pauses)).toBeCloseTo(reference, 7);
    const split = getBonusChallengeShooterMotionTime(rules, 50, frequency, pauses)
      + getBonusChallengeShooterMotionTime(rules, 150, frequency, pauses, 50);
    expect(split).toBeCloseTo(reference, 7);
  }
});
it('handles millions of tiny fatigue cycles without frame sampling', () => {
  const tiny: BonusChallengeEnvironmentRules = { ...rules, fatigue: { ...rules.fatigue!, slowdownStartMs: 0, heavyStartMs: 0, stopStartMs: 1, stopDurationMs: 1, recoveryDurationMs: 0 }, stumbleWindows: [] };
  expect(getBonusChallengeShooterMotionTime(tiny, 10_800_000, 1, [])).toBeGreaterThan(0);
}, 1000);

it('uses identical bounded puck speed precision for client and server', async () => {
  const { getBeachPuckSpeed } = await import('./bonusChallenge.js');
  expect(getBeachPuckSpeed(1.25, .87654321)).toBe(1.0957);
  expect(getBeachPuckSpeed(.2, .01)).toBe(.2);
});

it('keeps the same position when local pauses become authoritative after a delayed response', async () => {
  const { createBonusChallengeMotionSampler } = await import('./bonusChallenge.js');
  const local = [{ tapTime: 29, flightMs: 10 }];
  const before = createBonusChallengeMotionSampler(rules, .75, []);
  const after = createBonusChallengeMotionSampler(rules, .75, local);
  expect(before(50, local)).toBeCloseTo(after(50, local), 10);
  expect(after(90, local)).toBeCloseTo(getBonusChallengeShooterMotionTime(rules, 90, .75, local), 10);
});
