import type { FightAction, FightContact, FightPlayer, FightPosture } from './types.js';
export function classifyFightContact(action: FightAction, defender: FightPosture, inRange: boolean): FightContact['outcome'] {
  if (!inRange || (action.zone === 'head' && defender.crouch)) return 'miss';
  if (defender.guard && action.zone === (defender.crouch ? 'body' : 'head')) return 'blocked';
  return 'hit';
}
export function fightActionId(action: { phaseId:number; player:FightPlayer; seq:number; actionId?:string }): string {
  return action.actionId ?? `${action.phaseId}:${action.player}:${action.seq}`;
}
