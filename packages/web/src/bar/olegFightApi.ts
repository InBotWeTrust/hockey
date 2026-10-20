import type { FightState, FightHeldInput } from '@hockey/game-core';
import { apiFetch } from '../api/apiFetch.js';
export interface BarAccess {
  blockedUntil: string | null;
  fightId: string | null;
}
export interface OlegSnapshot {
  id: string;
  state: FightState;
  serverNow: number;
  outcome: string | null;
  nextSeq: number;
}
export type OlegCommand = { actionId: string; seq: number; phaseId: number } & (
  | { kind: 'attack' }
  | { kind: 'input'; input: FightHeldInput }
);
export const fetchBarAccess = () => apiFetch<BarAccess>('/bar/access');
export const fetchOlegFight = (id: string) => apiFetch<OlegSnapshot>(`/bar/fights/${id}`);
export const commandOlegFight = (id: string, command: OlegCommand) =>
  apiFetch<OlegSnapshot>(`/bar/fights/${id}/commands`, {
    method: 'POST',
    body: JSON.stringify(command),
  });
export const acknowledgeOlegFight = (id: string) =>
  apiFetch<BarAccess>(`/bar/fights/${id}/acknowledge`, { method: 'POST' });
