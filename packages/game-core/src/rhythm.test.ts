import { getDuelPlayerCondition } from './duelInventory.js';
import { describe, it, expect } from 'vitest';
import { projectRhythm, compareRhythmSeries, createRhythmMovementSampler } from './rhythm.js';
describe('Rhythm goal windows', () => {
  it('accepts the exact boundary and rejects a late goal', () => {
    expect(projectRhythm({ version: 1, shots: [{ travel: 2, goal: true }], travel: 2 }).score).toBe(1);
    expect(projectRhythm({ version: 1, shots: [{ travel: 2.001, goal: true }], travel: 2.001 }).score).toBe(0);
  });
  it('preserves windows across misses and scores across broken series', () => {
    expect(
      projectRhythm({ version: 1,
        shots: [
          { travel: 1, goal: true },
          { travel: 2, goal: false },
          { travel: 3, goal: true },
        ],
        travel: 3,
      }),
    ).toMatchObject({ score: 2, currentSeries: 2 });
    expect(
      projectRhythm({ version: 1,
        shots: [
          { travel: 1, goal: true },
          { travel: 3.1, goal: true },
          { travel: 4, goal: true },
        ],
        travel: 4,
      }),
    ).toMatchObject({ score: 2, currentSeries: 1, series: [1, 1] });
  });
  it('compares all sorted series', () => {
    expect(compareRhythmSeries([4, 1, 1], [3, 3])).toBe(1);
    expect(compareRhythmSeries([4, 2, 1], [4, 3])).toBe(-1);
    expect(compareRhythmSeries([1, 4], [4, 1])).toBe(0);
  });
});

describe('Rhythm confirmed series', () => {
  it('keeps the first goal pending even after the initial two traversals', () => {
    expect(projectRhythm({ shots: [{ travel: 5, goal: true }], travel: 5 }))
      .toMatchObject({ score: 0, currentSeries: 1, series: [], remainingTraversals: 2 });
  });
  it('credits both goals when the second shot starts at the two-traversal boundary', () => {
    expect(projectRhythm({ shots: [{ travel: 5, goal: true }, { travel: 7, goal: true }], travel: 7 }))
      .toMatchObject({ score: 2, currentSeries: 2, series: [2] });
  });
  it('discards an unconfirmed goal on expiry and starts a new pending pair', () => {
    expect(projectRhythm({ shots: [{ travel: 1, goal: true }], travel: 3.001 }))
      .toMatchObject({ score: 0, currentSeries: 0, series: [] });
    const shots = [{ travel: 1, goal: true }, { travel: 3.001, goal: true }];
    expect(projectRhythm({ shots, travel: 3.001 })).toMatchObject({ score: 0, currentSeries: 1, series: [] });
    expect(projectRhythm({ shots: [...shots, { travel: 4, goal: true }], travel: 4 }))
      .toMatchObject({ score: 2, currentSeries: 2, series: [2] });
  });
  it('preserves confirmed points through a miss, expiry and an unconfirmed last goal', () => {
    expect(projectRhythm({ shots: [
      { travel: 4, goal: true }, { travel: 5, goal: false },
      { travel: 6, goal: true }, { travel: 7, goal: true }, { travel: 10, goal: true },
    ], travel: 13 })).toMatchObject({ score: 3, currentSeries: 0, series: [3] });
  });
  it('preserves the original scoring of version-one match snapshots', () => {
    expect(projectRhythm({ version: 1, shots: [{ travel: 1, goal: true }], travel: 1 }))
      .toMatchObject({ score: 1, currentSeries: 1, series: [1] });
  });
});

describe('Rhythm movement integral', () => {
  const input = {
    seed: 'movement',
    userId: 'local',
    periodNumber: 1,
    elapsedMs: 0,
    movementDistancePx: 0,
    baseLaneWidthPx: 600,
    baselineShooterSpeed: 0.75,
    currentShooterSpeed: 0.75,
    loadout: { stick: null, skates: null, nutrition: null },
  };
  it('measures full widths rather than board touches and excludes flight stops', () => {
    const sample = createRhythmMovementSampler(input);
    expect(sample.travelAt(1000)).toBeCloseTo(1.5, 9);
    expect(sample.travelAt(1000, [{ tapTime: 200, flightMs: 400 }])).toBeCloseTo(0.9, 9);
    expect(sample.travelAt(600, [{ tapTime: 200, flightMs: 400 }])).toBe(
      sample.travelAt(200, [{ tapTime: 200, flightMs: 400 }]),
    );
  });
  it('is independent of sampling order, repeated calls and frame rate', () => {
    const a = createRhythmMovementSampler(input),
      b = createRhythmMovementSampler(input);
    const pauses = [
      { tapTime: 400, flightMs: 350 },
      { tapTime: 1700, flightMs: 500 },
    ];
    for (let ms = 0; ms < 5000; ms += 17) a.travelAt(ms, pauses);
    expect(a.travelAt(5000, pauses)).toBe(b.travelAt(5000, pauses));
    a.travelAt(150000, pauses);
    expect(a.travelAt(1500, pauses)).toBe(b.travelAt(1500, pauses));
  });
  it('integrates fatigue and rest instead of time multiplied by starting speed', () => {
    const sample = createRhythmMovementSampler(input);
    const late = sample.travelAt(120000) - sample.travelAt(110000);
    expect(late).toBeLessThan(15);
    expect(sample.travelAt(120000)).toBeGreaterThan(sample.travelAt(110000));
  });
  it('keeps the existing visible stumble hold frozen before resuming', () => {
    const sample = createRhythmMovementSampler(input);
    let seen = false,
      end = 0;
    for (let t = 0; t < 30000; t += 10) {
      const raw = getDuelPlayerCondition({
        ...input,
        elapsedMs: t,
        movementDistancePx: (t * 0.75 * 2 * 600) / 1000,
      });
      if (raw.stumbleActive) seen = true;
      else if (seen) {
        end = t;
        break;
      }
    }
    expect(end).toBeGreaterThan(0);
    expect(sample.motionAt(end + 300)).toBe(sample.motionAt(end));
  });
});
