import type { FightAction } from '@hockey/game-core';
import type { FighterPose } from './Fighter.js';
export function fightVisualPose(action: FightAction, nowMs: number): FighterPose {
  if (nowMs < action.effectiveAtMs) return 'idle';
  if (action.kind === 'block')
    return nowMs < action.activeUntilMs ? `block_${action.zone}` : 'idle';
  return action.resolved && nowMs < action.busyUntilMs ? `attack_${action.zone}` : 'idle';
}
