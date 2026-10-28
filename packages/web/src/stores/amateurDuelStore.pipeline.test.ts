import { afterEach, expect, it, vi } from 'vitest';
import * as api from '../api/amateurDuel.js';
import { useAmateurDuelStore } from './amateurDuelStore.js';
const iso = (n: number) => new Date(Date.UTC(2026, 9, 28, 10, 0, n)).toISOString();
function match(): api.AmateurDuelMatchState {
  return {
    id: 'pipeline',
    status: 'active',
    state_revision: 0,
    server_now: iso(0),
    rules: { duelKind: 'rhythm' },
    current_period_shots: 0,
    current_period_goals: 0,
    me: {
      state: 'period_active',
      current_period: 1,
      current_period_shots: 0,
      current_period_goals: 0,
      shots_taken: 0,
      goals: 0,
      inventory_report: [],
    },
    opponent: {
      state: 'period_active',
      current_period: 1,
      current_period_shots: 0,
      shots_taken: 0,
      goals: 0,
    },
  } as unknown as api.AmateurDuelMatchState;
}
afterEach(() => {
  vi.restoreAllMocks();
  useAmateurDuelStore.setState({ match: null });
});
it.each(['classic', 'express', 'express_plus', 'sniper', 'marathon', 'rhythm'] as const)(
  'preserves two pending %s shots when the first confirmation/poll arrives',
  async (duelKind) => {
    const original = match();
    original.rules.duelKind = duelKind;
    useAmateurDuelStore.setState({ match: original });
    useAmateurDuelStore.getState().optimisticAddShot('goal');
    useAmateurDuelStore.getState().optimisticAddShot('miss');
    const confirmed = {
      ...original,
      state_revision: 1,
      server_now: iso(1),
      current_period_shots: 1,
      current_period_goals: 1,
      me: {
        ...original.me,
        current_period_shots: 1,
        current_period_goals: 1,
        shots_taken: 1,
        goals: 1,
      },
    };
    useAmateurDuelStore.getState().applyState(confirmed);
    expect(useAmateurDuelStore.getState().match).toMatchObject({
      current_period_shots: 2,
      current_period_goals: 1,
      me: { current_period_shots: 1, shots_taken: 2, goals: 1 },
    });
    vi.spyOn(api, 'fetchAmateurMatch').mockResolvedValue({ match: confirmed });
    await useAmateurDuelStore.getState().refresh();
    expect(useAmateurDuelStore.getState().match).toMatchObject({
      current_period_shots: 2,
      me: { shots_taken: 2 },
    });
    useAmateurDuelStore
      .getState()
      .applyState({
        ...confirmed,
        state_revision: 2,
        current_period_shots: 2,
        me: { ...confirmed.me, current_period_shots: 2, shots_taken: 2 },
      });
    expect(useAmateurDuelStore.getState().match).toMatchObject({
      current_period_shots: 2,
      me: { current_period_shots: 2, shots_taken: 2 },
    });
  },
);
it('does not carry queued predictions into another period or match', () => {
  const original = match();
  useAmateurDuelStore.setState({ match: original });
  useAmateurDuelStore.getState().optimisticAddShot('goal');
  const next = { ...original, state_revision: 1, me: { ...original.me, current_period: 2 } };
  useAmateurDuelStore.getState().applyState(next);
  expect(useAmateurDuelStore.getState().match?.current_period_shots).toBe(0);
  useAmateurDuelStore.getState().applyState({ ...original, id: 'different' });
  expect(useAmateurDuelStore.getState().match?.me.shots_taken).toBe(0);
});

it('rolls back dependent predictions after a rejected shot and permits a correctly indexed retry', async () => {
  const original = match();
  useAmateurDuelStore.setState({ match: original });
  useAmateurDuelStore.getState().optimisticAddShot('goal');
  useAmateurDuelStore.getState().optimisticAddShot('goal');
  vi.spyOn(api, 'fetchAmateurMatch').mockResolvedValue({ match: original });
  const submit = vi
    .spyOn(api, 'submitAmateurDuelShot')
    .mockRejectedValue({ status: 409, message: 'rejected' });
  const args = {
    shotIndex: 1,
    input: {
      tapTime: 500,
      puckSpeedPerMs: 1.25,
      shooterFrequency: 0.75,
      goalieFrequency: 0.6,
      goalFrequency: 0.5,
    },
    claimedResult: 'goal' as const,
  };
  expect(await useAmateurDuelStore.getState().submitShot(args)).toBeNull();
  expect(useAmateurDuelStore.getState()).toMatchObject({
    pendingShots: [],
    match: { current_period_shots: 0, current_period_goals: 0, me: { shots_taken: 0, goals: 0 } },
  });
  useAmateurDuelStore.getState().optimisticAddShot('miss');
  submit.mockResolvedValue({
    match_id: original.id,
    state_revision: 1,
    server_result: 'miss',
    confirmed_shot_index: 1,
    participant: { ...original.me, current_period_shots: 1, shots_taken: 1 },
    current_period_inventory: { periodNumber: 1, consumed: [] },
    settled: false,
  } as api.SubmitAmateurDuelShotResponse);
  const confirmed = await useAmateurDuelStore
    .getState()
    .submitShot({ ...args, claimedResult: 'miss' });
  expect(confirmed).not.toBeNull();
  useAmateurDuelStore.getState().applyState(confirmed!.state);
  expect(useAmateurDuelStore.getState()).toMatchObject({
    pendingShots: [],
    match: { current_period_shots: 1, me: { shots_taken: 1, goals: 0 } },
  });
});

it('drops a queued prediction abandoned during a fight or route exit without touching another match', () => {
  const original = match();
  useAmateurDuelStore.setState({ match: original });
  useAmateurDuelStore.getState().optimisticAddShot('goal');
  useAmateurDuelStore.getState().optimisticAddShot('miss');
  useAmateurDuelStore.getState().discardPendingShots(original.id, 1, 2);
  expect(useAmateurDuelStore.getState().match).toMatchObject({
    current_period_shots: 1,
    current_period_goals: 1,
  });
  useAmateurDuelStore
    .getState()
    .applyState({
      ...original,
      state_revision: 1,
      current_period_shots: 1,
      current_period_goals: 1,
      me: {
        ...original.me,
        current_period_shots: 1,
        current_period_goals: 1,
        shots_taken: 1,
        goals: 1,
      },
    });
  expect(useAmateurDuelStore.getState().pendingShots).toHaveLength(0);
  useAmateurDuelStore.getState().applyState({ ...original, id: 'new-match' });
  useAmateurDuelStore.getState().optimisticAddShot('goal');
  useAmateurDuelStore.getState().discardPendingShots(original.id, 1, 0);
  expect(useAmateurDuelStore.getState().match?.current_period_shots).toBe(1);
  useAmateurDuelStore.getState().discardPendingShots('new-match', 1, 0);
  expect(useAmateurDuelStore.getState().match?.current_period_shots).toBe(0);
});
