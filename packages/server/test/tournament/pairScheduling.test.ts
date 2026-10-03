import { describe, expect, it } from 'vitest';
import {
  resolvePairDayStart,
  parsePairStartTimes,
  validateRoundGameDays,
} from '../../src/tournament/playoffScheduling.js';

describe('playoff slot day starts', () => {
  it('rejects configured overlapping daily blocks for an individual slot', () => {
    expect(() =>
      validateRoundGameDays({
        winsRequired: 2,
        readinessMinutes: 5,
        gameDurationMinutes: 20,
        interGameBreakMinutes: 5,
        days: [
          {
            localDate: '2030-10-26',
            firstWaveLocalTime: '18:00',
            maxResultGames: 2,
            pairStartTimes: { R1S1: '23:50' },
          },
          {
            localDate: '2030-10-27',
            firstWaveLocalTime: '18:00',
            maxResultGames: 1,
            pairStartTimes: { R1S1: '00:00' },
          },
        ],
      }),
    ).toThrow('overlap');
  });
  it('rejects invalid clocks and malformed bracket keys', () => {
    expect(() => parsePairStartTimes({ R1S1: '25:00' })).toThrow();
    expect(() => parsePairStartTimes({ unknown: '18:00' })).toThrow();
    expect(() => parsePairStartTimes([])).toThrow();
  });
  const day = {
    localDate: '2030-10-03',
    firstWaveLocalTime: '19:00',
    maxResultGames: 4,
    pairStartTimes: { R1S1: '18:00', R1S2: '21:00' },
  };

  it('resolves each pair independently in the tournament timezone', () => {
    expect(resolvePairDayStart(day, 'R1S1', 'Europe/Moscow').toISOString()).toBe(
      '2030-10-03T15:00:00.000Z',
    );
    expect(resolvePairDayStart(day, 'R1S2', 'Europe/Moscow').toISOString()).toBe(
      '2030-10-03T18:00:00.000Z',
    );
    expect(day.firstWaveLocalTime).toBe('19:00');
  });

  it('inherits the round time when the slot has no override', () => {
    expect(resolvePairDayStart(day, 'R1S3', 'Europe/Moscow').toISOString()).toBe(
      '2030-10-03T16:00:00.000Z',
    );
  });

  it('keeps the third-place slot separate from the final', () => {
    const finalDay = { ...day, pairStartTimes: { R3S1: '18:00', BRONZE: '21:00' } };
    expect(resolvePairDayStart(finalDay, 'BRONZE', 'Europe/Moscow').toISOString()).toBe(
      '2030-10-03T18:00:00.000Z',
    );
    expect(resolvePairDayStart(finalDay, 'R3S1', 'Europe/Moscow').toISOString()).toBe(
      '2030-10-03T15:00:00.000Z',
    );
  });
});
