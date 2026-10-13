import { describe, expect, it } from 'vitest';
import { getSessionPhaseOffsets } from './session.js';
import { sampleSkiPlayer, createSkiSlips, skiGoalClock, skiNotice } from './skiEnvironment.js';
const speeds = { goal: 0.5, goalie: 0.6, player: 0.75 };
const offsets = { goal: 230, goalie: 125, player: 200 };
const position = (clock: number, frequency: number, offset: number) => {
  const period = 1000 / frequency,
    p = (((clock + offset) % period) + period) % period;
  return p < period / 2 ? p : period - p;
};
describe('progressive ski fatigue and frequent entity slips', () => {
  it('reports slowdown against the starting bonus speed and increments after two climbs', () => {
    const first = sampleSkiPlayer(0, 1, 0);
    expect(first.slowdownPercent).toBe(35);
    expect(sampleSkiPlayer(1900, 1, 0).slowdownPercent).toBe(35);
    expect(sampleSkiPlayer(2400, 1, 0).slowdownPercent).toBe(40);
    expect(sampleSkiPlayer(2400, 1, 0).notice).toContain('40%');
  });
  it('keeps downhill at 125% at every fatigue stage, rests and starts the cycle again', () => {
    let rests = 0,
      foundRecovery = false;
    for (let t = 0; t < 60000; t += 10) {
      const a = sampleSkiPlayer(t, 1, 0),
        b = sampleSkiPlayer(t + 1, 1, 0);
      if (a.direction === 'downhill' && b.direction === 'downhill')
        expect(b.clock - a.clock).toBeCloseTo(1.25, 5);
      if (!a.canShoot) {
        rests++;
        expect(a.clock).toBeCloseTo(b.clock, 5);
      }
      if (a.recovering) {
        foundRecovery = true;
        expect(a.slowdownPercent).toBe(35);
      }
    }
    expect(rests).toBeGreaterThan(0);
    expect(foundRecovery).toBe(true);
  });
  it('distributes 22 seeded slips across eight-second windows', () => {
    const events = createSkiSlips('ski-test', 180000, 0.5, 230, { speeds, offsets });
    expect(events).toHaveLength(22);
    const counts = ['goal', 'goalie', 'player']
      .map((target) => events.filter((e) => e.target === target).length)
      .sort();
    expect(counts).toEqual([7, 7, 8]);
    expect(events).toEqual(createSkiSlips('ski-test', 180000, 0.5, 230, { speeds, offsets }));
    events.forEach((e, i) => {
      if (i) expect(e.startMs - events[i - 1]!.endMs).toBeGreaterThanOrEqual(4000);
      expect(e.endMs).toBeLessThan(180000);
    });
  });
  it('slides each target at normal descent speed with continuous entry and exit', () => {
    const events = createSkiSlips('ski-test', 180000, 0.5, 230, { speeds, offsets });
    for (const e of events) {
      const f = speeds[e.target],
        offset = offsets[e.target];
      const clock = (t: number) =>
        e.target === 'player'
          ? sampleSkiPlayer(t, f, offset, [], events).clock
          : skiGoalClock(
              t,
              f,
              offset,
              events.filter((g) => g.target === e.target),
            );
      expect(
        Math.abs(
          position(clock(e.startMs + 0.001), f, offset) -
            position(clock(e.startMs - 0.001), f, offset),
        ),
      ).toBeLessThan(0.01);
      expect(position(clock(e.startMs + 10), f, offset)).toBeCloseTo(
        position(clock(e.startMs), f, offset) - 12.5,
        5,
      );
      expect(position(clock(e.endMs), f, offset)).toBeCloseTo(0, 5);
      expect(position(clock(e.endMs + 1), f, offset)).toBeGreaterThan(0);
    }
  });
});

describe('slip feedback ends at the downhill edge', () => {
  it('clears the pose and notice as soon as the descent ends', async () => {
    const { skiVisualAt } = await import('./skiEnvironment.js');
    const event = { startMs: 1000, endMs: 1200, startPhase: 250, target: 'goal' as const };
    expect(skiVisualAt([event], 1199)?.target).toBe('goal');
    expect(skiVisualAt([event], 1200)).toBeNull();
  });
});

describe('skidding shot gate', () => {
  it('blocks player shots during descent and enables them at the edge', () => {
    const config = {
      speeds: { goal: 0.5, goalie: 0.6, player: 0.75 },
      offsets: { goal: 230, goalie: 125, player: 200 },
    };
    const events = createSkiSlips('ski-test', 180000, 0.5, 230, config);
    const e = events.find((e) => e.target === 'player')!;
    expect(sampleSkiPlayer(e.endMs - 1, 0.75, 200, [], events).canShoot).toBe(false);
    expect(sampleSkiPlayer(e.endMs, 0.75, 200, [], events).canShoot).toBe(true);
  });
});

describe('ski movement regressions', () => {
  it('does not stall at turns with the real session phase', () => {
    const offset = getSessionPhaseOffsets('ski-local-slope-v1').shooter;
    for (let t = 0; t < 7900; t += 100)
      expect(
        sampleSkiPlayer(t + 100, 0.75, offset).clock - sampleSkiPlayer(t, 0.75, offset).clock,
      ).toBeGreaterThan(30);
  });
  it('freezes throughout a real shot pause and resumes without a jump', () => {
    const pauses = [{ tapTime: 500, flightMs: 1000 }];
    expect(sampleSkiPlayer(1500, 1, 0, pauses).clock).toBe(
      sampleSkiPlayer(500, 1, 0, pauses).clock,
    );
    expect(
      sampleSkiPlayer(1501, 1, 0, pauses).clock - sampleSkiPlayer(1500, 1, 0, pauses).clock,
    ).toBeCloseTo(0.65);
  });
  it('never brings the slope hint back and shows a fatigue percentage on descent too', () => {
    expect(skiNotice(0, sampleSkiPlayer(0, 1), [])).toContain('Влево');
    for (let t = 5000; t < 180000; t += 100)
      expect(skiNotice(t, sampleSkiPlayer(t, 1), [])).not.toContain('Влево');
    const down = sampleSkiPlayer(900, 1);
    expect(down.direction).toBe('downhill');
    expect(down.notice).toContain('35%');
  });
  it('defers a player slip that intersects a shot while preserving all scheduled events and their spacing', () => {
    const config = {
      speeds: { goal: 0.5, goalie: 0.6, player: 0.75 },
      offsets: { goal: 230, goalie: 125, player: 200 },
    };
    const base = createSkiSlips('ski-test', 180000, 0.5, 230, config);
    const e = base.find((e) => e.target === 'player')!;
    const pause = { tapTime: e.startMs - 20, flightMs: 1000 };
    const moved = createSkiSlips('ski-test', 180000, 0.5, 230, { ...config, pauses: [pause] });
    expect(moved).toHaveLength(22);
    const first = moved.find((e) => e.target === 'player')!;
    expect(first.startMs).toBeGreaterThanOrEqual(pause.tapTime + pause.flightMs);
    moved.forEach((e, i) => {
      if (i) expect(e.startMs - moved[i - 1]!.endMs).toBeGreaterThanOrEqual(4000);
    });
    expect(sampleSkiPlayer(pause.tapTime + 500, 0.75, 200, [pause], moved).slip).toBeNull();
  });
});

it('defers player slips past a chain of shot pauses', () => {
  const config = {
    speeds: { goal: 0.5, goalie: 0.6, player: 0.75 },
    offsets: { goal: 230, goalie: 125, player: 200 },
  };
  for (let seed = 0; seed < 20; seed++) {
    const key = `chain-${seed}`,
      base = createSkiSlips(key, 180000, 0.5, 230, config);
    const start = base.find((e) => e.target === 'player')!.startMs;
    const pauses = Array.from({ length: 5 }, (_, i) => ({
      tapTime: start - 20 + i * 105,
      flightMs: 100,
    }));
    const events = createSkiSlips(key, 180000, 0.5, 230, { ...config, pauses });
    for (const e of events.filter((e) => e.target === 'player'))
      expect(pauses.some((p) => e.startMs >= p.tapTime && e.startMs < p.tapTime + p.flightMs)).toBe(
        false,
      );
  }
});
