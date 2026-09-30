import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../auth/authStore.js';
import {
  fetchInitialTrainingCourse,
  startInitialTrainingExercise,
  submitInitialTrainingShot,
  type InitialTrainingCatalogResponse,
} from './initialTraining.js';

describe('initial training course API', () => {
  it('types the authoritative beginner completion field', () => {
    const catalog = { beginner_training_completed: true } as InitialTrainingCatalogResponse;
    expect(catalog.beginner_training_completed).toBe(true);
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.setState({ accessToken: 'TOKEN', refreshToken: null });
  });

  it('uses the course catalog, exercise start and verified shot endpoints', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await fetchInitialTrainingCourse();
    await startInitialTrainingExercise('first-shot');
    await submitInitialTrainingShot('first-shot', {
      run_id: '11111111-1111-4111-8111-111111111111',
      shot_index: 1,
      input: { tapTime: 120, shooterTapTime: 100 },
      claimed_result: 'goal',
    });

    expect(fetchSpy.mock.calls.map(([url]) => url)).toEqual([
      '/api/duel/training/course',
      '/api/duel/training/course/first-shot/start',
      '/api/duel/training/course/first-shot/shot',
    ]);
    expect(fetchSpy.mock.calls[1]?.[1]).toMatchObject({ method: 'POST' });
    expect(fetchSpy.mock.calls[2]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({
        run_id: '11111111-1111-4111-8111-111111111111',
        shot_index: 1,
        input: { tapTime: 120, shooterTapTime: 100 },
        claimed_result: 'goal',
      }),
    });
  });
});
