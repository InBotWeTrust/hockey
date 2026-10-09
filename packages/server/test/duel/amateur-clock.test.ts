import { describe, it, expect } from 'vitest';
import { getParticipantClock } from '../../src/duel/amateur/clock.js';
const player = {
  state: 'period_active',
  period_started_at: new Date(0),
  active_duration_ms: 10_000,
  period_paused_ms: 0,
};
describe('ordinary duel active clock', () => {
  it('combines previous periods and the current active segment', () => {
    expect(getParticipantClock(player, 60_000, 20_000, null)).toMatchObject({
      periodElapsedMs: 20_000,
      totalActiveMs: 30_000,
      remainingMs: 40_000,
      running: true,
    });
  });
  it('freezes distinct personal remaining times at the shared pause', () => {
    const pause = new Date(20_000);
    expect(getParticipantClock(player, 120_000, 40_000, pause)).toMatchObject({
      periodElapsedMs: 20_000,
      remainingMs: 100_000,
      running: false,
    });
    expect(
      getParticipantClock(
        { ...player, period_started_at: new Date(15_000) },
        140_000,
        40_000,
        pause,
      ).remainingMs,
    ).toBe(135_000);
  });
  it('excludes completed pauses after resume without removing active recovery time', () => {
    expect(
      getParticipantClock({ ...player, period_paused_ms: 20_000 }, 60_000, 45_000, null),
    ).toMatchObject({ periodElapsedMs: 25_000, totalActiveMs: 35_000, remainingMs: 35_000 });
  });
  it('does not accrue active time on a break or before starting', () => {
    expect(
      getParticipantClock(
        { ...player, state: 'break_active', period_started_at: null },
        60_000,
        50_000,
        null,
      ),
    ).toMatchObject({ periodElapsedMs: 0, totalActiveMs: 10_000, running: false });
  });
  it('caps a completed timed period and supports legacy rows', () => {
    const { period_paused_ms: _, ...legacy } = player;
    expect(getParticipantClock(legacy, 60_000, 80_000, null)).toMatchObject({
      periodElapsedMs: 60_000,
      totalActiveMs: 70_000,
      remainingMs: 0,
    });
  });
});
