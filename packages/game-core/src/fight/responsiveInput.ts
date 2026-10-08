import type { FightState, FightPlayer, FightPosture, FightFrame, FightHeldInput } from './types.js';
export const FIGHT_INPUT_LEASE_MS = 750;
export const FIGHT_INPUT_RENEW_MS = 150;
export const FIGHT_GUARD_UNITS = 3;
export const FIGHT_RESPONSIVE_HIT_MS = 200;
export const FIGHT_GUARD_BREAK_MS = 300;
export const neutralFightInput = (): FightHeldInput => ({ direction: 0 as const, crouch: false, guard: false });
export function getFightPosture(state: FightState, player: FightPlayer, atMs: number): FightPosture {
  const frame = [...(state.responsive?.timeline ?? [])].reverse().find(f => f.atMs <= atMs);
  const result: FightPosture = frame ? {...frame.players[player]} : {...neutralFightInput(), guardUnits:3,readyAtMs:0,hitUntilMs:0,guardBreakUntilMs:0};
  if (frame) {
    if (atMs >= result.readyAtMs) {
      const held = [...(state.responsive?.commands ?? [])].reverse().find(c=>c.player===player&&c.kind==='input'&&c.effectiveAtMs<=atMs);
      if (held?.kind==='input') Object.assign(result,held.input);
    }
    if (atMs >= frame.leaseUntil[player] && atMs >= result.readyAtMs) Object.assign(result,neutralFightInput());
    const released = frame.releasedAt[player];
    if (released !== null) result.guardUnits = Math.min(3, result.guardUnits + Math.max(0,Math.floor((atMs - released - 600)/500)) - frame.regenerated[player]);
    if (atMs < result.hitUntilMs || atMs < result.guardBreakUntilMs || result.guardUnits === 0) result.guard = false;
  }
  return result;
}
export function cloneFightFrame(frame: FightFrame): FightFrame {
  return {...frame,players:frame.players.map(p=>({...p})) as FightFrame['players'],positions:[...frame.positions],leaseUntil:[...frame.leaseUntil],releasedAt:[...frame.releasedAt],regenerated:[...frame.regenerated]};
}
