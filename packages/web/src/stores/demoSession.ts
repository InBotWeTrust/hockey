import type { ShotResultType } from '../api/duel.js';

export const DEMO_SHOTS_PER_PERIOD = 30;
export const DEMO_PERIOD_NUMBER = 1;
export const DEMO_TOTAL_PERIODS = 3;
export const DEMO_GOALIE_ID = 'rookie';

export type DemoSessionStatus = 'active' | 'finished';

export interface DemoSessionState {
  status: DemoSessionStatus;
  seed: string;
  shotsTaken: number;
  goals: number;
}

export function createDemoSeed(): string {
  try {
    const bytes = new Uint32Array(2);
    crypto.getRandomValues(bytes);
    const first = (bytes[0] ?? 0).toString(36);
    const second = (bytes[1] ?? 0).toString(36);
    return `demo:${first}:${second}`;
  } catch {
    return `demo:${Date.now().toString(36)}`;
  }
}

export function createDemoSessionState(seed = createDemoSeed()): DemoSessionState {
  return {
    status: 'active',
    seed,
    shotsTaken: 0,
    goals: 0,
  };
}

export function advanceDemoSessionShot(
  state: DemoSessionState,
  claimedResult: ShotResultType,
): DemoSessionState {
  if (state.status === 'finished') return state;
  const shotsTaken = Math.min(DEMO_SHOTS_PER_PERIOD, state.shotsTaken + 1);
  return {
    ...state,
    status: shotsTaken >= DEMO_SHOTS_PER_PERIOD ? 'finished' : 'active',
    shotsTaken,
    goals: state.goals + (claimedResult === 'goal' ? 1 : 0),
  };
}
