import { describe, expect, it } from 'vitest';
import {
  DEMO_SHOTS_PER_PERIOD,
  advanceDemoSessionShot,
  createDemoSessionState,
} from './demoSession.js';

describe('demoSession', () => {
  it('finishes after the first-period shot limit', () => {
    let state = createDemoSessionState('demo:test');
    for (let i = 0; i < DEMO_SHOTS_PER_PERIOD - 1; i += 1) {
      state = advanceDemoSessionShot(state, i % 2 === 0 ? 'goal' : 'save');
      expect(state.status).toBe('active');
    }

    state = advanceDemoSessionShot(state, 'goal');

    expect(state.status).toBe('finished');
    expect(state.shotsTaken).toBe(DEMO_SHOTS_PER_PERIOD);
    expect(state.goals).toBe(16);
  });

  it('does not advance a finished session', () => {
    const finished = {
      ...createDemoSessionState('demo:test'),
      status: 'finished' as const,
      shotsTaken: DEMO_SHOTS_PER_PERIOD,
      goals: 12,
    };

    expect(advanceDemoSessionShot(finished, 'goal')).toEqual(finished);
  });
});
