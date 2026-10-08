export type FightPlayer = 0 | 1;
export type FightZone = 'head' | 'body';
export interface FightRules {
  version: number;
  initialHp: number;
  mainDurationMs: number;
  suddenDeathDurationMs: number;
  windupMs: number;
  activeMs: number;
  attackRecoveryMs: number;
  blockMs: number;
  blockRecoveryMs: number;
  deliveryGraceMs: number;
}
export interface FightActionCommand {
  player: FightPlayer;
  phaseId: number;
  seq: number;
  effectiveAtMs: number;
  kind: 'attack' | 'block';
  zone: FightZone;
  actionId?: string;
}
export interface FightMoveCommand {
  player: FightPlayer;
  phaseId: number;
  seq: number;
  effectiveAtMs: number;
  kind: 'move';
  direction: -1 | 0 | 1;
}
export type FightCommand = FightActionCommand | FightMoveCommand | FightInputCommand;
export interface FightAction extends FightActionCommand {
  actionId?: string;
  crouch?: boolean;
  cancelledAtMs?: number;
  outcome?: 'hit' | 'blocked' | 'miss' | 'cancelled';
  activeAtMs: number;
  activeUntilMs: number;
  busyUntilMs: number;
  resolved: boolean;
}
export interface FightState {
  responsive?: FightResponsiveState;
  endedAtMs?: number;
  moves?: FightMoveCommand[];
  rules: FightRules;
  phaseId: number;
  phaseStartedAtMs: number;
  deadlineMs: number;
  status: 'fighting' | 'sudden_death' | 'resolved' | 'cancelled';
  hp: [number, number];
  winner: FightPlayer | null;
  actions: FightAction[];
  lastSeq: [number, number];
  finalizedThroughMs: number;
}
export type FightEvent =
  | {
      type: 'rejected';
      player: FightPlayer;
      seq: number;
      reason: 'phase' | 'duplicate' | 'busy' | 'time';
    }
  | { type: 'damage'; atMs: number; damage: [number, number] }
  | { type: 'phase'; phaseId: number; startsAtMs: number }
  | { type: 'result'; winner: FightPlayer | null; atMs: number };
export interface FightTransition {
  state: FightState;
  events: FightEvent[];
}

export interface FightHeldInput { direction: -1 | 0 | 1; crouch: boolean; guard: boolean }
export interface FightInputCommand {
  player: FightPlayer; phaseId: number; seq: number; effectiveAtMs: number;
  kind: 'input'; input: FightHeldInput; actionId?: string;
}
export interface FightPosture extends FightHeldInput {
  guardUnits: number; readyAtMs: number; hitUntilMs: number; guardBreakUntilMs: number;
}
export interface FightFrame {
  atMs: number; players: [FightPosture, FightPosture]; positions: [number,number];
  leaseUntil: [number,number]; releasedAt: [number|null,number|null]; regenerated: [number,number];
}
export interface FightContact {
  id: string; actionId: string; atMs: number; attacker: FightPlayer; defender: FightPlayer;
  zone: FightZone; outcome: 'hit' | 'blocked' | 'miss'; guardBroken: boolean;
}
export interface FightResponsiveState {
  commands: FightCommand[]; initialHp: [number,number]; timeline: FightFrame[];
  contacts: FightContact[];
}
