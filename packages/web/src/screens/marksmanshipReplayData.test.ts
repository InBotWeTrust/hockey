import { describe, expect, it } from 'vitest';
import { RECORDED_RUNS, verifyRecordedRun } from './marksmanshipReplayData.js';

describe('recorded marksmanship runs', () => {
  it('contains only the two selected attempts with their recorded shot and goal counts', () => {
    expect(RECORDED_RUNS.map((run) => [run.key, run.shots.length,
      run.shots.filter((shot) => shot.result === 'goal').length])).toEqual([
      ['egor-78', 83, 78],
      ['dmitry-79', 90, 79],
    ]);
  });

  it('recalculates all recorded results without a mismatch', () => {
    for (const run of RECORDED_RUNS) expect(verifyRecordedRun(run)).toEqual([]);
  });

  it('keeps shot indices and approximate wall offsets ordered inside the period', () => {
    for (const run of RECORDED_RUNS) {
      expect(run.shots.map((shot) => shot.index)).toEqual(
        Array.from({ length: run.shots.length }, (_, index) => index + 1),
      );
      expect(run.shots.every((shot) => Number.isFinite(shot.wallMs) && shot.wallMs >= 0 &&
        shot.wallMs <= 180_000)).toBe(true);
      expect(run.shots.every((shot, index) => index === 0 ||
        shot.wallMs >= run.shots[index - 1]!.wallMs)).toBe(true);
    }
  });
});
