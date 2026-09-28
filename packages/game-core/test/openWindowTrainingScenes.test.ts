import { describe, expect, it } from 'vitest';
import { GAME_CORE_VERSION } from '../src/version.js';
import { getDailyPeriodSpeedPreset } from '../src/balance/periods.js';
import { resolveOpenWindowShot, sampleOpenWindowScene,
  scanOpenWindows } from '../src/openWindowTraining.js';
import { OPEN_WINDOW_STEPS, getOpenWindowScene, validateOpenWindowScene,
  OPEN_WINDOW_BANK_VERSION } from '../src/openWindowTrainingScenes.js';

describe('open-window scene bank', () => {
  it('has twelve ordered skill steps and independent unseen checks', () => {
    expect(OPEN_WINDOW_STEPS).toHaveLength(12);
    expect(OPEN_WINDOW_STEPS.map((step) => step.stage)).toEqual([
      'notice', 'notice', 'notice', 'anticipate', 'anticipate', 'anticipate',
      'decide', 'decide', 'decide', 'pace', 'pace', 'pace',
    ]);
    for (const step of OPEN_WINDOW_STEPS) {
      const scenes = Array.from({ length: 7 }, (_, variant) =>
        getOpenWindowScene(step.key, variant));
      expect(scenes.map((scene) => scene.role)).toEqual([
        'demonstration', 'practice', 'check', 'check', 'check', 'check', 'check',
      ]);
      expect(new Set(scenes.map((scene) => scene.sessionSeed)).size).toBe(7);
      expect(new Set(scenes.map((scene) => scene.id)).size).toBe(7);
      expect(scenes.every((scene) => scene.stepKey === step.key)).toBe(true);
    }
  });

  it('reproduces a human-usable target window from first-period daily movement', () => {
    const traversalMs = 500 / getDailyPeriodSpeedPreset(1).shooterFrequency;
    for (const step of OPEN_WINDOW_STEPS) {
      for (let variant = 0; variant < 7; variant += 1) {
        const scene = getOpenWindowScene(step.key, variant);
        expect(scene.bankVersion).toBe(OPEN_WINDOW_BANK_VERSION);
        expect(scene.gameCoreVersion).toBe(GAME_CORE_VERSION);
        expect(scene.targetMs - scene.startMs).toBeGreaterThanOrEqual(8 * traversalMs);
        const width = scene.targetWindow.endMs - scene.targetWindow.startMs + 1;
        if (step.stage === 'notice') expect(width).toBeGreaterThanOrEqual(200);
        if (step.stage === 'anticipate') expect(width).toBeGreaterThanOrEqual(160);
        expect(resolveOpenWindowShot(scene, scene.targetWindow.startMs).type).toBe('goal');
        expect(resolveOpenWindowShot(scene, scene.targetWindow.endMs).type).toBe('goal');
        expect(validateOpenWindowScene(scene)).toBeUndefined();
      }
    }
  });

  it('keeps all three entities moving rather than converging to a fixed pre-shot position', () => {
    for (const step of OPEN_WINDOW_STEPS) {
      const scene = getOpenWindowScene(step.key, 0);
      const frames = Array.from({ length: 21 }, (_, index) =>
        sampleOpenWindowScene(scene, scene.targetMs - 1000 + index * 100));
      for (const key of ['shooterX', 'goalOffsetX', 'goalieX'] as const) {
        const values = frames.map((frame) => frame[key]);
        expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(key === 'shooterX' ? 300 : 20);
      }
    }
  });

  it('mixes broad, medium and risky windows in later check scenes', () => {
    for (const step of OPEN_WINDOW_STEPS.filter((item) =>
      item.stage === 'decide' || item.stage === 'pace')) {
      const width = (variant: number) => {
        const { targetWindow } = getOpenWindowScene(step.key, variant);
        return targetWindow.endMs - targetWindow.startMs + 1;
      };
      expect(width(2)).toBeGreaterThanOrEqual(200);
      expect(width(3)).toBeGreaterThanOrEqual(120);
      expect(width(3)).toBeLessThan(200);
      expect(width(4)).toBeGreaterThanOrEqual(80);
      expect(width(4)).toBeLessThan(120);
      expect(width(5)).toBeGreaterThanOrEqual(200);
      expect(width(6)).toBeGreaterThanOrEqual(120);
      expect(width(6)).toBeLessThan(200);
    }
  });

  it('provides a real poor traversal to skip before the later opening', () => {
    const traversalMs = 500 / getDailyPeriodSpeedPreset(1).shooterFrequency;
    for (let variant = 0; variant < 7; variant += 1) {
      const scene = getOpenWindowScene('decide_skip', variant);
      expect(scene.skipSegment).toBeDefined();
      expect(scene.skipSegment!.endMs - scene.skipSegment!.startMs).toBeGreaterThanOrEqual(
        traversalMs - 2);
      expect(scene.skipSegment!.endMs).toBeLessThan(scene.targetWindow.startMs);
      expect(scanOpenWindows(scene, scene.skipSegment!.startMs, scene.skipSegment!.endMs)
        .every((window) => window.endMs - window.startMs + 1 < 160)).toBe(true);
    }
  });

  it('rejects a declared window that hides a closed gap between two goals', () => {
    const candidate = OPEN_WINDOW_STEPS.flatMap((step) =>
      Array.from({ length: 7 }, (_, variant) => getOpenWindowScene(step.key, variant)))
      .map((scene) => ({ scene, intervals: scanOpenWindows(scene,
        scene.targetMs - 1200, scene.targetMs + 1200) }))
      .find(({ intervals }) => intervals.length >= 2);
    expect(candidate).toBeDefined();
    const first = candidate!.intervals[0]!;
    const second = candidate!.intervals[1]!;
    const tampered = { ...candidate!.scene, targetMs: first.startMs,
      targetWindow: { startMs: first.startMs, endMs: second.endMs } };
    expect(() => validateOpenWindowScene(tampered)).toThrow(/does not reproduce/);
  });
});
