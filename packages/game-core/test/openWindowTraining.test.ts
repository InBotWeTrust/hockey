import { describe, expect, it } from 'vitest';
import { getDailyPeriodSpeedPreset } from '../src/balance/periods.js';
import { getGoalie } from '../src/balance/goalies.js';
import { simulateGoal } from '../src/goal/simulate.js';
import { simulateGoalie } from '../src/goalie/simulate.js';
import { simulateShooter } from '../src/shooter/simulate.js';
import { deriveShotSeed, getSessionPhaseOffsets } from '../src/session.js';
import { resolveShot } from '../src/shot/resolve.js';
import { STICK_NEUTRAL } from '../src/shot/types.js';
import { evaluateOpenWindowDecision, resolveOpenWindowShot, sampleOpenWindowScene,
  scanOpenWindows, type OpenWindowScene } from '../src/openWindowTraining.js';

const scene: OpenWindowScene = {
  id: 'test:notice:1', sessionSeed: 'open-window:test-scene', shotIndex: 1,
  goalieId: 'rookie', startMs: 0, endMs: 20_000, targetMs: 17_500,
  bankVersion: 1, gameCoreVersion: 69,
};

describe('open-window training movement', () => {
  it('samples shooter, goal and goalie exactly like the first daily period', () => {
    const preset = getDailyPeriodSpeedPreset(1);
    const offsets = getSessionPhaseOffsets(scene.sessionSeed);
    const goalie = getGoalie(scene.goalieId);
    const activeGoalie = { ...goalie, frequency: preset.goalieFrequency,
      goalFrequency: preset.goalFrequency };
    const shotSeed = deriveShotSeed(scene.sessionSeed, 1, scene.shotIndex);

    for (const timeMs of [0, 667, 8_000, 17_500, 17_800]) {
      const frame = sampleOpenWindowScene(scene, timeMs);
      expect(frame.shooterX).toBeCloseTo(
        simulateShooter(timeMs + offsets.shooter, preset.shooterFrequency).x, 8);
      expect(frame.goalOffsetX).toBeCloseTo(
        simulateGoal(activeGoalie, timeMs, offsets.goal).offsetX, 8);
      expect(frame.goalieX).toBeCloseTo(
        simulateGoalie(activeGoalie, shotSeed, scene.shotIndex, timeMs, offsets.goalie).position.x, 8);
    }
  });

  it('does not converge to nearly fixed positions before the shot', () => {
    const before = sampleOpenWindowScene(scene, scene.targetMs - 300);
    const atTarget = sampleOpenWindowScene(scene, scene.targetMs);
    expect(Math.abs(atTarget.shooterX - before.shooterX)).toBeGreaterThan(40);
    expect(Math.abs(atTarget.goalOffsetX - before.goalOffsetX)).toBeGreaterThan(10);
    expect(Math.abs(atTarget.goalieX - before.goalieX)).toBeGreaterThan(10);
  });
});

describe('open-window decisions', () => {
  it('uses the ordinary shot resolver at the first daily speed', () => {
    const speeds = getDailyPeriodSpeedPreset(1);
    const tapTime = 8_000;
    const expected = resolveShot({ tapTime, shooterTapTime: tapTime,
      shooterFrequency: speeds.shooterFrequency, goalieFrequency: speeds.goalieFrequency,
      goalFrequency: speeds.goalFrequency, puckSpeedPerMs: speeds.puckSpeedPerMs },
    getGoalie(scene.goalieId), deriveShotSeed(scene.sessionSeed, 1, scene.shotIndex),
    scene.shotIndex, STICK_NEUTRAL, getSessionPhaseOffsets(scene.sessionSeed));
    expect(resolveOpenWindowShot(scene, tapTime)).toEqual(expected);
  });

  it('finds contiguous goal intervals without manufacturing a shot result', () => {
    const intervals = scanOpenWindows(scene, 0, 20_000);
    expect(intervals.length).toBeGreaterThan(0);
    for (const interval of intervals) {
      expect(interval.endMs).toBeGreaterThanOrEqual(interval.startMs);
      expect(resolveOpenWindowShot(scene, interval.startMs).type).toBe('goal');
      expect(resolveOpenWindowShot(scene, interval.endMs).type).toBe('goal');
      if (interval.startMs > 0) {
        expect(resolveOpenWindowShot(scene, interval.startMs - 1).type).not.toBe('goal');
      }
      if (interval.endMs < 20_000) {
        expect(resolveOpenWindowShot(scene, interval.endMs + 1).type).not.toBe('goal');
      }
    }
  });

  it('separates recognizing a nearby opportunity from exact shot timing', () => {
    const intervals = scanOpenWindows(scene, 0, 20_000);
    const interval = intervals.find((candidate) => candidate.startMs > 100)!;
    const shot = evaluateOpenWindowDecision(scene,
      { type: 'shot', tapTimeMs: interval.startMs - 10 }, intervals);
    expect(shot.relevant).toBe(true);
    expect(shot.onTime).toBe(false);
    expect(shot.timing).toBe('early');
    expect(shot.result).not.toBe('goal');
  });

  it('scores an explicit skip only within a bounded opportunity', () => {
    expect(evaluateOpenWindowDecision(scene, { type: 'skip' }, [])).toMatchObject({
      opportunity: 'sensible_skip', result: null,
    });
    expect(evaluateOpenWindowDecision(scene, { type: 'skip' }, [
      { startMs: 1_000, endMs: 1_220 },
    ])).toMatchObject({ opportunity: 'missed_opportunity', result: null });
  });
});
