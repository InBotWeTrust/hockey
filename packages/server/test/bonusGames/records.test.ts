import { describe, expect, it } from 'vitest';
import { recordScore, compareRecordScores, recordReward } from '../../src/bonusGames/records.js';

describe('bonus records', () => {
  it('compares each mode without rounding', () => {
    expect(
      compareRecordScores(recordScore('speed', 1001, 10, 5), recordScore('speed', 1002, 9, 5)),
    ).toBe(-1);
    expect(
      compareRecordScores(recordScore('accuracy', 2000, 5, 4), recordScore('accuracy', 1000, 6, 4)),
    ).toBe(-1);
    expect(
      compareRecordScores(recordScore('accuracy', 999, 5, 4), recordScore('accuracy', 1000, 5, 4)),
    ).toBe(-1);
    expect(
      compareRecordScores(
        recordScore('marksmanship', 1000, 5, 4),
        recordScore('marksmanship', 1000, 6, 4),
      ),
    ).toBe(-1);
    expect(
      compareRecordScores(
        recordScore('endurance', 60000, 25, 10),
        recordScore('endurance', 60000, 50, 9),
      ),
    ).toBe(-1);
    expect(
      compareRecordScores(
        recordScore('endurance', 60000, 25, 10),
        recordScore('endurance', 60000, 50, 10),
      ),
    ).toBe(0);
  });
  it('ranks accuracy by exact goal ratio, then time', () => {
    expect(compareRecordScores(recordScore('accuracy',2000,20,20),recordScore('accuracy',1000,10,9))).toBe(-1);
    expect(compareRecordScores(recordScore('accuracy',900,20,10),recordScore('accuracy',1000,10,5))).toBe(-1);
    expect(compareRecordScores(recordScore('accuracy',1000,20,10),recordScore('accuracy',1000,10,5))).toBe(0);
    expect(compareRecordScores(recordScore('accuracy',2000,1000000,999999),recordScore('accuracy',1000,999999,999998))).toBe(-1);
  });
  it('rewards improvements only and adds both awards', () => {
    expect(recordReward(false, false)).toEqual({ stars: 0, experience: 0 });
    expect(recordReward(true, false)).toEqual({ stars: 2, experience: 10 });
    expect(recordReward(false, true)).toEqual({ stars: 10, experience: 30 });
    expect(recordReward(true, true)).toEqual({ stars: 12, experience: 40 });
  });
});
