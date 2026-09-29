import { describe, expect, it } from 'vitest';
import { advanceObservationProgress, validateObservationSubmission } from
  '../../src/duel/training/observationProgress.js';
import type { ObservationScene } from '@hockey/game-core';

const scene: ObservationScene = {
  id: 'observation-test', stepKey: 'notice_motion', source: 'authored',
  sessionSeed: 'test', goalieId: 'rookie', shotIndex: 1,
  startMs: 1000, endMs: 3000, decisionMs: 2000,
  opening: { startMs: 1900, endMs: 2100 }, bankVersion: 1, gameCoreVersion: 69,
  explanation: 'Путь открыт.',
};

describe('observation lesson progress', () => {
  it('finishes the demonstration only after it is acknowledged', () => {
    expect(advanceObservationProgress('notice_frame', 0, 'observed'))
      .toEqual({ nextVariant: 0, completed: true, sound: true });
  });

  it('requires an open and then a closed frame in the untimed lesson', () => {
    expect(advanceObservationProgress('notice_motion', 0, 'good_mark'))
      .toEqual({ nextVariant: 1, completed: false, sound: true });
    expect(advanceObservationProgress('notice_motion', 1, 'good_skip'))
      .toEqual({ nextVariant: 1, completed: true, sound: true });
    expect(advanceObservationProgress('notice_motion', 1, 'closed'))
      .toEqual({ nextVariant: 1, completed: false, sound: false });
  });

  it('lets a player finish the moving lesson after viewing all clips', () => {
    expect(advanceObservationProgress('notice_independent', 0, 'early'))
      .toEqual({ nextVariant: 1, completed: false, sound: false });
    expect(advanceObservationProgress('notice_independent', 1, 'good_skip'))
      .toEqual({ nextVariant: 2, completed: false, sound: true });
    expect(advanceObservationProgress('notice_independent', 2, 'missed_opening'))
      .toEqual({ nextVariant: 2, completed: true, sound: false });
  });
});

describe('observation submission time', () => {
  it('does not accept a paused-frame answer before the frame is displayed', () => {
    expect(() => validateObservationSubmission(scene, { type: 'classify', answer: 'open' }, 999))
      .toThrow(/too early/i);
    expect(validateObservationSubmission(scene, { type: 'classify', answer: 'open' }, 1000))
      .toBe('good_mark');
  });

  it('does not accept an unseen segment as a skip', () => {
    expect(() => validateObservationSubmission(scene, { type: 'skip' }, 1700))
      .toThrow(/too early/i);
    expect(validateObservationSubmission(scene, { type: 'skip' }, 1800))
      .toBe('missed_opening');
  });

  it('does not move a delayed mark to the current frame', () => {
    expect(() => validateObservationSubmission(scene, { type: 'mark', tapTimeMs: 1900 }, 2000))
      .toThrow(/time/i);
    expect(validateObservationSubmission(scene, { type: 'mark', tapTimeMs: 1900 }, 900))
      .toBe('good_mark');
  });
});
