import { describe, expect, it } from 'vitest';
import type { RecordedRun } from './marksmanshipReplayData.js';
import { getReplayFrame, seekReplayTime } from './marksmanshipReplayTimeline.js';
import { RECORDED_RUNS } from './marksmanshipReplayData.js';

const run: RecordedRun = {
  key: 'test', label: 'Тест', goalieId: 'rookie', stickZoneMultiplier: 1,
  phaseOffsets: { shooter: 0, goal: 0, goalie: 0 },
  shots: [
    { index: 1, wallMs: 1_000, sceneMs: 900, shooterMs: 850, seed: 'one', result: 'goal',
      input: { tapTime: 900, shooterTapTime: 850, puckSpeedPerMs: 10 } },
    { index: 2, wallMs: 3_000, sceneMs: 1_700, shooterMs: 1_600, seed: 'two', result: 'miss',
      input: { tapTime: 1_700, shooterTapTime: 1_600, puckSpeedPerMs: 10 } },
  ],
};

describe('recorded-run timeline', () => {
  it('uses both exact saved clocks at the moment of each tap', () => {
    expect(getReplayFrame(run, 1_000)).toMatchObject({ sceneMs: 900, shooterMs: 850,
      phase: 'flight', shot: { index: 1 } });
    expect(getReplayFrame(run, 3_000)).toMatchObject({ sceneMs: 1_700, shooterMs: 1_600,
      phase: 'flight', shot: { index: 2 } });
  });

  it('moves the scene but freezes the player during flight, then pauses both at the result', () => {
    const flight = getReplayFrame(run, 1_020);
    expect(flight.sceneMs).toBe(920);
    expect(flight.shooterMs).toBe(850);
    const result = getReplayFrame(run, 1_200);
    expect(result.phase).toBe('result');
    expect(result.shooterMs).toBe(850);
    expect(result.sceneMs).toBeGreaterThan(900);
    expect(getReplayFrame(run, 1_500).sceneMs).toBe(result.sceneMs);
  });

  it('never lets a previous result cover the next saved shot', () => {
    expect(getReplayFrame(run, 2_999).shot).toBeNull();
    expect(getReplayFrame(run, 3_000)).toMatchObject({ phase: 'flight', shot: { index: 2 } });
  });

  it('clamps wheel and arrow moves to the three-minute period', () => {
    expect(seekReplayTime(0, -50)).toBe(0);
    expect(seekReplayTime(100, 50)).toBe(150);
    expect(seekReplayTime(180_000, 50)).toBe(180_000);
    expect(getReplayFrame(run, 180_050).wallMs).toBe(180_000);
  });

  it('lands on both saved clocks at all 173 historical shot anchors', () => {
    for (const recordedRun of RECORDED_RUNS) {
      for (const shot of recordedRun.shots) {
        const frame = getReplayFrame(recordedRun, shot.wallMs);
        expect([frame.shot?.index, frame.sceneMs, frame.shooterMs]).toEqual([
          shot.index, shot.sceneMs, shot.shooterMs,
        ]);
      }
    }
  });
});
