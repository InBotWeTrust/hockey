import type { Player, Winner } from './darts.js';
import {
  ARM_STEP_MS,
  ARM_DURATION_MS,
  ARM_INPUT_TTL_MS,
  ARM_WARNING_MS,
  ARM_IDLE_LOSS_MS,
  ARM_DRAW_MARGIN,
  ARM_PROGRESS_RATE,
} from './armwrestlingBalance.js';
export type Wrist = 'straight' | 'inside' | 'outside';
export interface ArmInput {
  seq: number;
  supportHeld: boolean;
  support: number;
  pressing: boolean;
  wrist: Wrist;
}
export interface ArmState {
  kind: 'armwrestling';
  // Compatibility metadata; the match has simultaneous inputs.
  turn: Player;
  progress: number;
  stamina: [number, number];
  inputs: [ArmInput, ArmInput];
  lastSeq: [number, number];
  expiry: [number, number];
  releasedSince: [number | null, number | null];
  warning: [boolean, boolean];
  startedAt: number;
  endsAt: number;
  simulatedAt: number;
  observedAt: number;
  seed: number;
  winner: Winner;
  reason: 'pin' | 'inactivity' | 'time' | null;
}
const resting = (): ArmInput => ({
  seq: 0,
  supportHeld: false,
  support: 0,
  pressing: false,
  wrist: 'straight',
});
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export function createArmwrestling(now: number, seed: number): ArmState {
  return {
    kind: 'armwrestling',
    turn: 0,
    progress: 0,
    stamina: [1, 1],
    inputs: [resting(), resting()],
    lastSeq: [0, 0],
    expiry: [now, now],
    releasedSince: [now, now],
    warning: [false, false],
    startedAt: now,
    endsAt: now + ARM_DURATION_MS,
    simulatedAt: now,
    observedAt: now,
    seed: seed >>> 0,
    winner: null,
    reason: null,
  };
}
function idleAt(g: ArmState, p: Player): number {
  return g.releasedSince[p] ?? g.expiry[p];
}
function settle(g: ArmState, at: number): void {
  if (Math.abs(g.progress) >= 1) {
    g.winner = g.progress > 0 ? 0 : 1;
    g.reason = 'pin';
    return;
  }
  const idle = ([0, 1] as const).map((p) => at - idleAt(g, p));
  g.warning = [idle[0]! >= ARM_WARNING_MS, idle[1]! >= ARM_WARNING_MS];
  if (idle.some((t) => t >= ARM_IDLE_LOSS_MS)) {
    const a = idleAt(g, 0),
      b = idleAt(g, 1);
    g.winner = a === b ? 'draw' : a < b ? 1 : 0;
    g.reason = 'inactivity';
    return;
  }
  if (at >= g.endsAt) {
    g.winner = Math.abs(g.progress) <= ARM_DRAW_MARGIN ? 'draw' : g.progress > 0 ? 0 : 1;
    g.reason = 'time';
  }
}
export function advanceArmwrestling(state: ArmState, now: number): ArmState {
  if (!Number.isFinite(now)) throw new Error('Invalid time');
  if (state.winner !== null || now < state.observedAt) return state;
  const g: ArmState = { ...state, stamina: [...state.stamina], warning: [...state.warning] };
  const until = Math.min(
    now,
    g.endsAt,
    idleAt(g, 0) + ARM_IDLE_LOSS_MS,
    idleAt(g, 1) + ARM_IDLE_LOSS_MS,
  );
  while (g.simulatedAt + ARM_STEP_MS <= until && g.winner === null) {
    const at = g.simulatedAt + ARM_STEP_MS,
      dt = ARM_STEP_MS / 1000;
    const force: number[] = [],
      defence: number[] = [];
    for (const p of [0, 1] as const) {
      const input = at <= g.expiry[p] ? g.inputs[p] : resting();
      const support = input.supportHeld ? input.support : 0;
      const energy = 0.18 + 0.82 * g.stamina[p];
      force[p] = input.pressing
        ? (0.35 + 0.65 * support) *
          energy *
          (input.wrist === 'inside' ? 1.22 : input.wrist === 'outside' ? 0.78 : 1)
        : 0;
      defence[p] = (input.wrist === 'outside' ? 0.27 : 0.12) * support * energy;
      const drain =
        (input.pressing ? 0.1 * (input.wrist === 'inside' ? 1.4 : 1) : 0) + support * 0.025;
      g.stamina[p] = clamp(g.stamina[p] + dt * (input.pressing ? -drain : 0.13 - drain), 0, 1);
    }
    const delta = Math.max(0, force[0]! - defence[1]!) - Math.max(0, force[1]! - defence[0]!);
    g.progress = clamp(g.progress + delta * ARM_PROGRESS_RATE * dt, -1, 1);
    g.simulatedAt = at;
    settle(g, at);
  }
  if (g.winner === null) settle(g, until);
  g.observedAt = now;
  return g;
}
export function applyArmInput(
  state: ArmState,
  player: Player,
  input: ArmInput,
  now: number,
): ArmState {
  if (
    !Number.isSafeInteger(input.seq) ||
    input.seq < 1 ||
    !Number.isFinite(input.support) ||
    input.support < 0 ||
    input.support > 1 ||
    typeof input.supportHeld !== 'boolean' ||
    typeof input.pressing !== 'boolean' ||
    !['straight', 'inside', 'outside'].includes(input.wrist)
  )
    throw new Error('Invalid arm input');
  if (input.seq <= state.lastSeq[player]) return state;
  const g = advanceArmwrestling(state, now);
  if (g.winner !== null || now < state.observedAt) return g;
  const inputs: ArmState['inputs'] = [...g.inputs],
    lastSeq: ArmState['lastSeq'] = [...g.lastSeq],
    expiry: ArmState['expiry'] = [...g.expiry],
    releasedSince: ArmState['releasedSince'] = [...g.releasedSince];
  inputs[player] = { ...input };
  lastSeq[player] = input.seq;
  expiry[player] = now + ARM_INPUT_TTL_MS;
  releasedSince[player] =
    input.supportHeld || input.pressing
      ? null
      : (g.releasedSince[player] ?? Math.min(now, g.expiry[player]));
  const n = { ...g, inputs, lastSeq, expiry, releasedSince };
  settle(n, now);
  return n;
}
