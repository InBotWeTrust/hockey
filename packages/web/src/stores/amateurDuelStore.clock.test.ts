import { afterEach, describe, expect, it, vi } from 'vitest';
import * as api from '../api/amateurDuel.js';
import { ApiError } from '../api/apiFetch.js';
import { marathonWindowRemainingMs } from '../components/duel/marathonClock.js';
import { useAmateurDuelStore } from './amateurDuelStore.js';

const epoch = Date.parse('2026-10-26T10:00:00Z');
const iso = (ms: number) => new Date(epoch + ms).toISOString();
function match(): api.AmateurDuelMatchState {
  return {
    id: 'marathon-clock', status: 'active', state_revision: 1,
    server_now: iso(2000), received_at_performance_ms: 2000,
    rules: { duelKind: 'marathon', scoredClockVersion: 2, marathonWindowMs: 4000 },
    current_period_shots: 0, current_period_goals: 0,
    period_started_at: iso(0), period_ends_at: iso(240000),
    me: { state: 'period_active', current_period: 1, current_period_shots: 0,
      current_period_goals: 0, shots_taken: 0, goals: 0, active_duration_ms: 0,
      inventory_report: [], result_pause_ends_at: null,
      clock: {periodElapsedMs: 2000, totalActiveMs: 2000, remainingMs: 238000, running: true},
      marathon_window_started_at: iso(0), marathon_window_ends_at: iso(4000) },
    opponent: {state: 'period_active', current_period: 1, current_period_shots: 0, shots_taken: 0, goals: 0},
  } as unknown as api.AmateurDuelMatchState;
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); useAmateurDuelStore.setState({match: null}); });

describe('delayed duel clock snapshots', () => {
  it('shares an in-flight poll instead of queuing duplicate match requests', async () => {
    const original = match();
    useAmateurDuelStore.setState({match: original});
    let resolve!: (value: {match: api.AmateurDuelMatchState}) => void;
    const fetch = vi.spyOn(api, 'fetchAmateurMatch').mockImplementation(() => new Promise(r => {resolve = r;}));
    const first = useAmateurDuelStore.getState().refresh();
    const second = useAmateurDuelStore.getState().refresh();
    expect(fetch).toHaveBeenCalledTimes(1);
    resolve({match: original});
    await Promise.all([first, second]);
  });

  it('releases a stalled poll so the next refresh can recover', async () => {
    vi.useFakeTimers();
    const original = match();
    useAmateurDuelStore.setState({match: original});
    const fetch = vi.spyOn(api, 'fetchAmateurMatch').mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValue({match: original});
    const stalled = useAmateurDuelStore.getState().refresh();
    await vi.advanceTimersByTimeAsync(12000);
    expect(useAmateurDuelStore.getState().loading).toBe(false);
    await stalled;
    await useAmateurDuelStore.getState().refresh();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('applies a successful period start even when a poll arrives while it is pending', async () => {
    const original = match();
    original.me = {...original.me, state: 'accepted', current_period: 1};
    useAmateurDuelStore.setState({match: original, inFlight: false});
    let resolve!: (value: {match: api.AmateurDuelMatchState}) => void;
    vi.spyOn(api, 'startAmateurDuelPeriod').mockImplementation(() => new Promise(r => {resolve = r;}));
    const pending = useAmateurDuelStore.getState().startPeriod();
    vi.spyOn(api, 'fetchAmateurMatch').mockResolvedValue({match: {...original}});
    await useAmateurDuelStore.getState().refresh();
    const active = {...original, me: {...original.me, state: 'period_active' as const, current_period: 2}};
    resolve({match: active});
    await pending;
    expect(useAmateurDuelStore.getState().match?.me).toMatchObject({state: 'period_active', current_period: 2});
  });

  it.each([4000, 7000])('resumes the %i ms Marathon window once after a delayed goal acknowledgement', async (windowMs) => {
    let performanceMs = 2000;
    vi.spyOn(performance, 'now').mockImplementation(() => performanceMs);
    const original = match();
    useAmateurDuelStore.setState({match: original});
    useAmateurDuelStore.getState().optimisticAddShot('goal');
    vi.spyOn(api, 'submitAmateurDuelShot').mockImplementation(async () => {
      performanceMs = 3200;
      return { match_id: original.id, server_now: iso(2100), state_revision: 2,
        server_result: 'goal', confirmed_shot_index: 1, settled: false,
        current_period_inventory: {periodNumber: 1, consumed: []},
        participant: {...original.me, shots_taken: 1, goals: 1, current_period_shots: 1,
          current_period_goals: 1, result_pause_starts_at: iso(2500), result_pause_ends_at: iso(3500),
          clock: {periodElapsedMs: 2100, totalActiveMs: 2100, remainingMs: 237900, running: true},
          marathon_window_started_at: iso(3500), marathon_window_ends_at: iso(3500 + windowMs)} };
    });
    const result = await useAmateurDuelStore.getState().submitShot({shotIndex: 1, claimedResult: 'goal',
      input: {tapTime: 2000, periodTapTime: 2000, puckSpeedPerMs: 1, shooterFrequency: .75, goalieFrequency: .6, goalFrequency: .5}});
    expect(result).not.toBeNull();
    useAmateurDuelStore.getState().applyState(result!.state);
    const current = useAmateurDuelStore.getState().match!;
    // Keep the authoritative snapshot paired with its timestamp.
    expect(current.server_now).toBe(iso(2100));
    expect(current.me.clock?.remainingMs).toBe(237900);
    for (const [at, expected] of [[3500, windowMs], [3600, windowMs - 100], [4500, windowMs - 1000]]) {
      performanceMs = at!;
      const nowMs = Date.parse(current.server_now) + performanceMs - current.received_at_performance_ms!;
      expect(current.me.clock!.remainingMs - (nowMs - Date.parse(current.server_now))).toBe(240000 - at!);
      expect(marathonWindowRemainingMs({nowMs, windowMs,
        startsAtMs: Date.parse(current.me.marathon_window_started_at!),
        endsAtMs: Date.parse(current.me.marathon_window_ends_at!), frozenRemainingMs: null,
        shot: {contactAtMs: epoch + 2500, resumeAtMs: epoch + 3500,
          previousEndsAtMs: epoch + windowMs, pending: false, goal: true}})).toBe(expected);
    }
  });

  it('does not rewind the period clock when a newer poll took longer to arrive', async () => {
    vi.spyOn(performance, 'now').mockReturnValue(4000);
    const original = match();
    useAmateurDuelStore.setState({match: original});
    vi.spyOn(api, 'fetchAmateurMatch').mockResolvedValue({match: {...original,
      server_now: iso(2500), received_at_performance_ms: 4000}});
    await useAmateurDuelStore.getState().refresh();
    const current = useAmateurDuelStore.getState().match!;
    expect(Date.parse(current.server_now) + 4000 - current.received_at_performance_ms!).toBe(epoch + 4000);
  });

  it.each(['classic', 'express', 'express_plus', 'sniper', 'marathon', 'rhythm'])(
    'does not advance %s time twice when a deferred acknowledgement follows a newer poll', (kind) => {
      vi.spyOn(performance, 'now').mockReturnValue(5000);
      const original = match();
      original.rules.duelKind = kind as api.AmateurDuelMatchState['rules']['duelKind'];
      const polled = {...original, server_now: iso(4000), received_at_performance_ms: 4000};
      useAmateurDuelStore.setState({match: polled});
      // Prepared at t=2000, applied after the result animation and a poll at t=4000.
      const acknowledged = {...original, state_revision: 2,
        me: {...original.me, current_period_shots: 1, shots_taken: 1}};
      useAmateurDuelStore.getState().applyState(acknowledged);
      const current = useAmateurDuelStore.getState().match!;
      expect(Date.parse(current.server_now) + 5000 - current.received_at_performance_ms!).toBe(epoch + 5000);
    },
  );

  it('starts a new clock estimate for another match or period', () => {
    vi.spyOn(performance, 'now').mockReturnValue(4000);
    const original = match();
    useAmateurDuelStore.setState({match: original});
    const next = {...original, server_now: iso(2500), received_at_performance_ms: 4000,
      me: {...original.me, current_period: 2}};
    useAmateurDuelStore.getState().applyState(next);
    expect(useAmateurDuelStore.getState().match?.received_at_performance_ms).toBe(4000);
    useAmateurDuelStore.getState().applyState({...next, id: 'other'});
    expect(useAmateurDuelStore.getState().match?.received_at_performance_ms).toBe(4000);
  });

  it('does not revive an expired Marathon window from an out-of-order poll at the same revision', async () => {
    vi.spyOn(performance, 'now').mockReturnValue(6000);
    const original = {...match(), server_now: iso(6000), received_at_performance_ms: 6000};
    original.me = {...original.me, format_score: 0, marathon_penalties: 1,
      marathon_window_started_at: iso(4000), marathon_window_ends_at: iso(8000)};
    useAmateurDuelStore.setState({match: original});
    vi.spyOn(api, 'fetchAmateurMatch').mockResolvedValue({match: {...original,
      server_now: iso(3000), me: {...original.me, format_score: 1, marathon_penalties: 0,
        marathon_window_started_at: iso(0), marathon_window_ends_at: iso(4000)}}});
    await useAmateurDuelStore.getState().refresh();
    expect(useAmateurDuelStore.getState().match?.me).toMatchObject({format_score: 0, marathon_penalties: 1,
      marathon_window_ends_at: iso(8000)});
  });

  it('retains a local clock snapshot when an opponent poll does not include the pending shot', async () => {
    vi.spyOn(performance, 'now').mockReturnValue(4000);
    const original = match();
    useAmateurDuelStore.setState({match: original});
    useAmateurDuelStore.getState().optimisticAddShot('goal');
    vi.spyOn(api, 'fetchAmateurMatch').mockResolvedValue({match: {...original,
      server_now: iso(3500), received_at_performance_ms: 4000,
      opponent: {...original.opponent, shots_taken: 1, current_period_shots: 1}}});
    await useAmateurDuelStore.getState().refresh();
    const current = useAmateurDuelStore.getState().match!;
    expect(current.me.clock).toEqual(original.me.clock);
    expect(current.server_now).toBe(original.server_now);
    expect(current.me.clock!.remainingMs - (Date.parse(current.server_now) + 4000 - current.received_at_performance_ms! - epoch - 2000)).toBe(236000);
    expect(current.opponent.shots_taken).toBe(1);
  });
});

describe('shot rejection during opponent polling', () => {
  it('rolls back the rejected optimistic shot after an opponent update and permits the same shot index again', async () => {
    const original = match();
    useAmateurDuelStore.setState({match: original});
    let rejectShot!: (error: unknown) => void;
    vi.spyOn(api, 'submitAmateurDuelShot').mockImplementationOnce(() => new Promise((_resolve, reject) => {rejectShot = reject;}));
    useAmateurDuelStore.getState().optimisticAddShot('goal');
    const pending = useAmateurDuelStore.getState().submitShot({shotIndex: 1, claimedResult: 'goal',
      input: {tapTime: 2000, puckSpeedPerMs: 1, shooterFrequency: .75, goalieFrequency: .6, goalFrequency: .5}});
    const updated = {...original, opponent: {...original.opponent, shots_taken: 1, current_period_shots: 1, goals: 1}};
    vi.spyOn(api, 'fetchAmateurMatch').mockResolvedValue({match: updated});
    await useAmateurDuelStore.getState().refresh();
    rejectShot(new ApiError(409, 'conflict', 'player is still recovering from a stumble'));
    await pending;
    expect(useAmateurDuelStore.getState().match).toMatchObject({current_period_shots: 0, current_period_goals: 0,
      me: {shots_taken: 0, goals: 0}, opponent: {shots_taken: 1, goals: 1}});
    expect(useAmateurDuelStore.getState().inFlight).toBe(false);
    vi.mocked(api.submitAmateurDuelShot).mockResolvedValueOnce({match_id: original.id,
      server_result: 'goal', confirmed_shot_index: 1, settled: false, state_revision: 2,
      current_period_inventory: {periodNumber: 1, consumed: []},
      participant: {...original.me, shots_taken: 1, goals: 1, current_period_shots: 1, current_period_goals: 1}});
    useAmateurDuelStore.getState().optimisticAddShot('goal');
    const retried = await useAmateurDuelStore.getState().submitShot({shotIndex: 1, claimedResult: 'goal',
      input: {tapTime: 4000, puckSpeedPerMs: 1, shooterFrequency: .75, goalieFrequency: .6, goalFrequency: .5}});
    expect(retried).not.toBeNull();
    useAmateurDuelStore.getState().applyState(retried!.state);
    expect(useAmateurDuelStore.getState().match).toMatchObject({current_period_shots: 1,
      me: {shots_taken: 1, goals: 1}, opponent: {shots_taken: 1, goals: 1}});
  });

  it('does not subtract a shot already confirmed by polling when its duplicate receives 409', async () => {
    const original = match();
    useAmateurDuelStore.setState({match: original});
    let rejectShot!: (error: unknown) => void;
    vi.spyOn(api, 'submitAmateurDuelShot').mockImplementationOnce(() => new Promise((_resolve, reject) => {rejectShot = reject;}));
    useAmateurDuelStore.getState().optimisticAddShot('goal');
    const pending = useAmateurDuelStore.getState().submitShot({shotIndex: 1, claimedResult: 'goal',
      input: {tapTime: 2000, puckSpeedPerMs: 1, shooterFrequency: .75, goalieFrequency: .6, goalFrequency: .5}});
    const confirmed = {...original, state_revision: 2, current_period_shots: 1, current_period_goals: 1,
      me: {...original.me, current_period_shots: 1, current_period_goals: 1, shots_taken: 1, goals: 1}};
    vi.spyOn(api, 'fetchAmateurMatch').mockResolvedValue({match: confirmed});
    await useAmateurDuelStore.getState().refresh();
    rejectShot(new ApiError(409, 'conflict', 'shot index mismatch'));
    await pending;
    expect(useAmateurDuelStore.getState().match).toMatchObject({current_period_shots: 1, me: {shots_taken: 1, goals: 1}});
  });

  it('does not apply a rejected old shot to another match', async () => {
    const original = match();
    useAmateurDuelStore.setState({match: original});
    let rejectShot!: (error: unknown) => void;
    vi.spyOn(api, 'submitAmateurDuelShot').mockImplementationOnce(() => new Promise((_resolve, reject) => {rejectShot = reject;}));
    vi.spyOn(api, 'fetchAmateurMatch').mockResolvedValue({match: original});
    useAmateurDuelStore.getState().optimisticAddShot('goal');
    const pending = useAmateurDuelStore.getState().submitShot({shotIndex: 1, claimedResult: 'goal',
      input: {tapTime: 2000, puckSpeedPerMs: 1, shooterFrequency: .75, goalieFrequency: .6, goalFrequency: .5}});
    const other = {...original, id: 'other-match'};
    useAmateurDuelStore.setState({match: other});
    rejectShot(new ApiError(409, 'conflict', 'shot index mismatch'));
    await pending;
    expect(useAmateurDuelStore.getState().match).toBe(other);
  });
});
