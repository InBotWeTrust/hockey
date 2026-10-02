import type { DuelPlayerCondition } from '@hockey/game-core';
export function beachNoticeLabel(condition: DuelPlayerCondition | null, puckSpeed: number, shooterFrequency = 1): string | null {
  if (!condition) return null;
  if (condition.status === 'exhausted_stop') return 'Передышка · лёд продолжает таять';
  if (condition.stumbleActive) return 'Споткнулся на мокром льду · бросок недоступен';
  const player = Math.max(0, Math.round((1 - Math.max(.1 / shooterFrequency, condition.shooterSpeedMultiplier)) * 100));
  const puck = Math.max(0, Math.round(-condition.puckSpeedDelta / puckSpeed * 100));
  if (condition.fatigueLevel === 'heavy') return `Сильная усталость и мокрый лёд · игрок −${player}%`;
  if (condition.status === 'tired') return `Усталость и мокрый лёд · игрок −${player}%`;
  return `Лёд тает · игрок −${player}% · шайба −${puck}%`;
}
