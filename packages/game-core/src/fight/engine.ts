import { createFightState as createLegacyFightState, advanceFight as advanceLegacyFight } from './legacyEngine.js';
import { advanceResponsiveFight } from './responsiveEngine.js';
import type { FightRules, FightState, FightCommand, FightTransition } from './types.js';
export function createFightState(rules: FightRules, phaseStartMs: number): FightState {
  return createLegacyFightState(rules, phaseStartMs);
}
export function advanceFight(input: FightState, commands: readonly FightCommand[], finalizedThroughMs: number): FightTransition {
  return input.rules.version>=3 ? advanceResponsiveFight(input,commands,finalizedThroughMs) : advanceLegacyFight(input,commands,finalizedThroughMs);
}
