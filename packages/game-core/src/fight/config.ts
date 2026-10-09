import type { FightRules } from './types.js';
export const DEFAULT_FIGHT_RULES: Readonly<FightRules> = Object.freeze({
  version: 4,
  initialHp: 5,
  mainDurationMs: 20_000,
  suddenDeathDurationMs: 10_000,
  windupMs: 80,
  activeMs: 100,
  attackRecoveryMs: 150,
  blockMs: 700,
  blockRecoveryMs: 200,
  deliveryGraceMs: 150,
});

export const FIGHT_HIT_REACTION_MS = 350;
export const FIGHT_FINISH_ANIMATION_MS = 700;
export const FIGHT_RESULT_DISPLAY_MS = 2000;

export const FIGHT_MEDICAL_AID_MS = 10_000;
