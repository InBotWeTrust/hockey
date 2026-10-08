import { getFightPosture } from './responsiveInput.js';
import type { FightState } from './types.js';
// Normalized arena coordinates. Movement leases prevent skating after disconnect.
export const FIGHT_MOVE_LEASE_MS = 450;
export const FIGHT_REACH = 0.4;
const SPEED = 0.0003;
const MIN = 0.25;
const MAX = 0.75;
const GAP = 0.34;
export function fightPositionsAt(state: FightState, atMs: number): [number, number] {
  if (state.rules.version >= 3 && state.responsive) {
    const frame = [...state.responsive.timeline].reverse().find(f => f.atMs <= atMs);
    if (!frame) return [.32,.68];
    const positions: [number,number] = [...frame.positions];
    const end=Math.min(atMs,state.endedAtMs??state.deadlineMs);
    for (const player of [0,1] as const) {
      const p=getFightPosture(state,player,frame.atMs);
      if (!p.crouch && frame.atMs>=p.readyAtMs) positions[player]+=p.direction*(player===0?1:-1)*SPEED*(p.guard?.5:1)*Math.max(0,Math.min(end,frame.leaseUntil[player])-frame.atMs);
      positions[player]=Math.max(MIN,Math.min(MAX,positions[player]));
    }
    if (positions[1]-positions[0]<GAP) {const middle=(positions[0]+positions[1])/2;positions[0]=middle-GAP/2;positions[1]=middle+GAP/2;}
    return positions;
  }
  const positions: [number, number] = [0.32, 0.68];
  if (state.rules.version < 2) return [0.25, 0.75];
  const end = Math.max(state.phaseStartedAtMs, Math.min(atMs, state.endedAtMs ?? state.deadlineMs));
  const moves = [...(state.moves ?? [])].sort(
    (a, b) => a.effectiveAtMs - b.effectiveAtMs || a.player - b.player || a.seq - b.seq,
  );
  const boundaries = new Set([state.phaseStartedAtMs, end]);
  for (const m of moves) {
    boundaries.add(m.effectiveAtMs);
    boundaries.add(m.effectiveAtMs + FIGHT_MOVE_LEASE_MS);
  }
  for (const a of state.actions) {
    boundaries.add(a.effectiveAtMs);
    boundaries.add(a.activeUntilMs);
  }
  const times = [...boundaries]
    .filter((t) => t >= state.phaseStartedAtMs && t <= end)
    .sort((a, b) => a - b);
  for (let i = 0; i < times.length - 1; i++) {
    const start = times[i]!;
    let remaining = times[i + 1]! - start;
    const velocities = ([0, 1] as const).map((player) => {
      const move = [...moves]
        .reverse()
        .find((m) => m.player === player && m.effectiveAtMs <= start);
      if (!move || start >= move.effectiveAtMs + FIGHT_MOVE_LEASE_MS) return 0;
      const action = state.actions.find(
        (a) => a.player === player && a.effectiveAtMs <= start && start < a.activeUntilMs,
      );
      if (action?.kind === 'attack') return 0;
      return (
        move.direction * (player === 0 ? 1 : -1) * SPEED * (action?.kind === 'block' ? 0.5 : 1)
      );
    });
    // Each segment can reach an arena edge or the opponent, then continues with constrained velocities.
    for (let n = 0; remaining > 0.000001 && n < 5; n++) {
      let v0 = velocities[0]!;
      let v1 = velocities[1]!;
      if ((positions[0] <= MIN + 1e-9 && v0 < 0) || (positions[0] >= MAX - 1e-9 && v0 > 0)) v0 = 0;
      if ((positions[1] <= MIN + 1e-9 && v1 < 0) || (positions[1] >= MAX - 1e-9 && v1 > 0)) v1 = 0;
      if (positions[1] - positions[0] <= GAP + 1e-9 && v0 > v1) {
        const shared =
          v0 > 0 && v1 > 0 ? Math.min(v0, v1) : v0 < 0 && v1 < 0 ? Math.max(v0, v1) : 0;
        v0 = shared;
        v1 = shared;
      }
      let dt = remaining;
      if (v0 < 0) dt = Math.min(dt, (MIN - positions[0]) / v0);
      if (v0 > 0) dt = Math.min(dt, (MAX - positions[0]) / v0);
      if (v1 < 0) dt = Math.min(dt, (MIN - positions[1]) / v1);
      if (v1 > 0) dt = Math.min(dt, (MAX - positions[1]) / v1);
      if (v0 > v1) dt = Math.min(dt, Math.max(0, (positions[1] - positions[0] - GAP) / (v0 - v1)));
      positions[0] += v0 * dt;
      positions[1] += v1 * dt;
      remaining -= dt;
    }
  }
  return positions;
}
export function fightInRange(state: FightState, atMs: number): boolean {
  if (state.rules.version < 2) return true;
  const [a, b] = fightPositionsAt(state, atMs);
  return b - a <= FIGHT_REACH + 1e-9;
}
