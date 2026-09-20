import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../auth/authStore.js';
import {
  restartAdvancedTrainingPractice,
  startAdvancedTrainingAssessment,
  startAdvancedTrainingExercise,
  submitAdvancedTrainingShot,
} from './advancedTraining.js';

describe('advanced training API', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.setState({ accessToken: 'TOKEN', refreshToken: null });
  });

  it('uses the server-owned run, shot, restart, and assessment endpoints', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const runId = '11111111-1111-4111-8111-111111111111';

    await startAdvancedTrainingExercise('board-side');
    await submitAdvancedTrainingShot('board-side', {
      run_id: runId,
      shot_index: 1,
      input: { tapTime: 120, shooterTapTime: 100 },
      claimed_result: 'goal',
    });
    await restartAdvancedTrainingPractice('board-side', runId);
    await startAdvancedTrainingAssessment('board-side', runId);

    expect(fetchSpy.mock.calls.map(([url]) => url)).toEqual([
      '/api/duel/training/advanced/board-side/start',
      '/api/duel/training/advanced/board-side/shot',
      '/api/duel/training/advanced/board-side/practice/restart',
      '/api/duel/training/advanced/board-side/assessment/start',
    ]);
    expect(fetchSpy.mock.calls[1]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({
        run_id: runId,
        shot_index: 1,
        input: { tapTime: 120, shooterTapTime: 100 },
        claimed_result: 'goal',
      }),
    });
    expect(fetchSpy.mock.calls[2]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ run_id: runId }),
    });
    expect(fetchSpy.mock.calls[3]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ run_id: runId }),
    });
  });
});
