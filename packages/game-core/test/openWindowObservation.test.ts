import { describe, expect, it } from 'vitest';
import { evaluateObservationDecision, getObservationScene,
  validateObservationScene, type ObservationScene } from '../src/openWindowObservation.js';
import { resolveOpenWindowShot, sampleOpenWindowScene } from '../src/openWindowTraining.js';
import { GOAL_OPENING } from '../src/rink.js';
import { GOALIE_SIZE } from '../src/goalie/types.js';
import { PERSPECTIVE_COURT_GOALIE_VISUAL_X_SCALE,
  PERSPECTIVE_COURT_GOAL_VISUAL_OFFSET_X_SCALE,
  PERSPECTIVE_COURT_VISUAL_X_CENTER } from '../src/court/perspective.js';

function visiblyOpen(scene: ObservationScene): boolean {
  const frame = sampleOpenWindowScene({ ...scene, targetMs: scene.decisionMs }, scene.decisionMs);
  const goalOffsetX = frame.goalOffsetX * PERSPECTIVE_COURT_GOAL_VISUAL_OFFSET_X_SCALE;
  const goalieX = PERSPECTIVE_COURT_VISUAL_X_CENTER +
    (frame.goalieX - PERSPECTIVE_COURT_VISUAL_X_CENTER) *
      PERSPECTIVE_COURT_GOALIE_VISUAL_X_SCALE;
  return frame.shooterX > GOAL_OPENING.xMin + goalOffsetX + 8 &&
    frame.shooterX < GOAL_OPENING.xMax + goalOffsetX - 8 &&
    Math.abs(frame.shooterX - goalieX) > GOALIE_SIZE.width / 2 + 13;
}

const open: ObservationScene = {
  id: 'test-open', stepKey: 'notice_motion', source: 'authored',
  sessionSeed: 'test-open', goalieId: 'rookie', shotIndex: 1,
  startMs: 500, endMs: 2500, decisionMs: 1500,
  opening: { startMs: 1400, endMs: 1700 }, bankVersion: 4, gameCoreVersion: 69,
  explanation: 'Путь открыт.',
};
const closed: ObservationScene = {
  ...open, id: 'test-closed', decisionMs: 1000, opening: null,
};

describe('observation decisions', () => {
  it('judges a paused open frame without reaction-time pressure', () => {
    expect(evaluateObservationDecision(open, { type: 'classify', answer: 'open' }))
      .toBe('good_mark');
    expect(evaluateObservationDecision(open, { type: 'classify', answer: 'closed' }))
      .toBe('missed_opening');
  });

  it('judges a paused closed frame without reaction-time pressure', () => {
    expect(evaluateObservationDecision(closed, { type: 'classify', answer: 'closed' }))
      .toBe('good_skip');
    expect(evaluateObservationDecision(closed, { type: 'classify', answer: 'open' }))
      .toBe('closed');
  });

  it('includes both boundaries of a moving opening', () => {
    expect(evaluateObservationDecision(open, { type: 'mark', tapTimeMs: 1400 }))
      .toBe('good_mark');
    expect(evaluateObservationDecision(open, { type: 'mark', tapTimeMs: 1700 }))
      .toBe('good_mark');
    expect(evaluateObservationDecision(open, { type: 'mark', tapTimeMs: 1399 }))
      .toBe('early');
    expect(evaluateObservationDecision(open, { type: 'mark', tapTimeMs: 1701 }))
      .toBe('late');
  });

  it('ignores a recorded clip’s historical shot result', () => {
    const recorded = { ...open, source: 'recorded' as const };
    expect(evaluateObservationDecision(recorded, { type: 'mark', tapTimeMs: 1500 }))
      .toBe('good_mark');
    expect(evaluateObservationDecision(recorded, { type: 'skip' }))
      .toBe('missed_opening');
  });

  it('rejects a scene with a decision outside its playback range', () => {
    expect(() => validateObservationScene({ ...open, decisionMs: 2501 }))
      .toThrow(/decision/i);
  });

  it('supplies an open and a closed paused scene', () => {
    const demo = getObservationScene('notice_frame', 0);
    const openScene = getObservationScene('notice_motion', 0);
    const closedScene = getObservationScene('notice_motion', 1);
    expect(visiblyOpen(demo)).toBe(true);
    expect(visiblyOpen(openScene)).toBe(true);
    expect(visiblyOpen(closedScene)).toBe(false);
    expect(resolveOpenWindowShot({ ...demo, targetMs: demo.decisionMs },
      demo.decisionMs).type).toBe('goal');
    expect(resolveOpenWindowShot({ ...openScene, targetMs: openScene.decisionMs },
      openScene.decisionMs).type).toBe('goal');
    expect(resolveOpenWindowShot({ ...closedScene, targetMs: closedScene.decisionMs },
      closedScene.decisionMs).type).not.toBe('goal');
    expect(openScene.opening).not.toBeNull();
    expect(closedScene.opening).toBeNull();
    const before = sampleOpenWindowScene({ ...openScene, targetMs: openScene.decisionMs },
      openScene.decisionMs - 500);
    const atPause = sampleOpenWindowScene({ ...openScene, targetMs: openScene.decisionMs },
      openScene.decisionMs);
    expect(Math.abs(atPause.shooterX - before.shooterX)).toBeGreaterThan(30);
  });

  it('keeps recorded candidates tied to existing game recordings', () => {
    expect(getObservationScene('notice_independent', 0)).toMatchObject({
      source: 'recorded', recordingKey: 'egor-78',
      opening: { startMs: 30880, endMs: 31200 },
    });
    expect(getObservationScene('notice_independent', 1)).toMatchObject({
      source: 'recorded', recordingKey: 'egor-78', opening: null,
    });
  });
});
