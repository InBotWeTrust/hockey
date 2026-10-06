import type { FightRules } from './types.js';
export const DEFAULT_FIGHT_RULES: Readonly<FightRules> = Object.freeze({
  version: 1, initialHp: 3, mainDurationMs: 15_000, suddenDeathDurationMs: 10_000,
  windupMs: 150, activeMs: 200, attackRecoveryMs: 400,
  blockMs: 700, blockRecoveryMs: 350, deliveryGraceMs: 150,
});
