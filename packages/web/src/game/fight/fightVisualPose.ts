import type { FightAction } from '@hockey/game-core';
import type { FighterPose } from './Fighter.js';
export function fightVisualPose(action: FightAction, nowMs: number): FighterPose {
  if (nowMs < action.effectiveAtMs || nowMs >= action.busyUntilMs) return 'idle';
  if (action.kind === 'block')
    return nowMs < action.activeUntilMs ? `block_${action.zone}` : 'idle';
  if (nowMs < action.activeAtMs || !action.resolved) return `windup_${action.zone}`;
  return `attack_${action.zone}`;
}
