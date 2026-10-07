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
}
export interface FightMoveCommand {
  player: FightPlayer;
  phaseId: number;
  seq: number;
  effectiveAtMs: number;
  kind: 'move';
  direction: -1 | 0 | 1;
}
export type FightCommand = FightActionCommand | FightMoveCommand;
export interface FightAction extends FightActionCommand {
  outcome?: 'hit' | 'blocked' | 'miss';
  activeAtMs: number;
  activeUntilMs: number;
  busyUntilMs: number;
  resolved: boolean;
}
export interface FightState {
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
