import { expect, it } from 'vitest';
import { getBonusChallengeShooterMotionTime, type BonusChallengeEnvironmentRules } from '@hockey/game-core';
import { beachWindMotion, beachWindClock, createWindSchedule, windIsActive } from './beachWind.js';
const rules: BonusChallengeEnvironmentRules = { beach: { version: 1, meltDurationMs: 150000, finalSpeedMultiplier: 1, puddles: [] } };
it('chooses one deterministic gust per 15 seconds with at least 5 seconds between starts', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const schedule = createWindSchedule(seed, 150000);
    expect(schedule).toHaveLength(10);
    for (const target of ['player', 'goalie', 'goal']) expect(schedule.filter(g => g.target === target).length).toBeGreaterThanOrEqual(3);
    expect(schedule).toEqual(createWindSchedule(seed, 150000));
    schedule.forEach((gust, i) => {
      const start = gust.startMs;
      expect(start).toBeGreaterThanOrEqual(i * 15000);
      expect(start).toBeLessThan((i + 1) * 15000);
      if (i) expect(start - schedule[i - 1]!.startMs).toBeGreaterThanOrEqual(5000);
    });
  }
});
it('reverses continuously for one second at thirty percent speed and resumes from the displaced phase', () => {
  const motion = (t: number) => beachWindMotion(rules, t, 1, [], [{startMs: 2000, target: 'player'}]);
  expect(motion(2000)).toBe(2000);
  expect(motion(2250)).toBe(1925);
  expect(motion(2500)).toBe(1850);
  expect(motion(3000)).toBe(1700);
  expect(motion(3250)).toBe(1950);
  expect(windIsActive([{startMs: 2000, target: 'player'}], 2999)).toBe(true);
  expect(windIsActive([{startMs: 2000, target: 'player'}], 3000)).toBe(false);
});
it('does not move a frozen shooter during shots or rest', () => {
  const stopped: BonusChallengeEnvironmentRules = { ...rules,
    fatigue: { slowdownStartMs: 1000, heavyStartMs: 1500, stopStartMs: 2000, stopDurationMs: 1000,
      recoveryDurationMs: 1000, slowMultiplier: .85, heavyMultiplier: .65 },
    stumbleWindows: [{ startMs: 4000, durationMs: 700 }] };
  for (const [config, start, pauses] of [[rules, 2000, [{tapTime: 1900, flightMs: 1000}]],
    [stopped, 2000, []]] as const) {
    expect(beachWindMotion(config, start + 500, 1, pauses, [{startMs: start, target: 'player'}]))
      .toBeCloseTo(getBonusChallengeShooterMotionTime(config, start, 1, pauses));
  }
});

it('only reverses the selected court entity and keeps continuous boundary clocks', () => {
  const schedule = [{ startMs: 2000, target: 'goal' as const }];
  expect(beachWindClock(schedule, 'goal', 2250)).toBe(1925);
  expect(beachWindClock(schedule, 'goalie', 2250)).toBe(2250);
  expect(beachWindClock(schedule, 'goal', 3000)).toBe(1700);
  expect(beachWindClock(schedule, 'goal', 3001)).toBe(1701);
  expect(beachWindMotion(rules, 2250, 1, [], schedule)).toBe(2250);
});

it('moves at thirty percent through stumbling and resumes without a phase jump', () => {
  const stumbling = { ...rules, stumbleWindows: [{startMs: 2000, durationMs: 700}] };
  const motion = (time: number) => beachWindMotion(stumbling, time, 1, [], []);
  expect(motion(2000)).toBe(2000);
  expect(motion(2300)).toBe(2090);
  expect(motion(2700)).toBe(2210);
  expect(motion(2701)).toBe(2211);
  expect(beachWindMotion(stumbling, 2500, 1, [{tapTime: 2000, flightMs: 700}], [])).toBe(2000);
});
