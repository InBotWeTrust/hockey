import type { BonusQualificationRules } from '../api/bonusGames.js';

function formatTime(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1_000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function streakSuffix(rules: BonusQualificationRules): string {
  return rules.requiredGoalStreak === undefined ? '' : ` · серия ${rules.requiredGoalStreak}`;
}

export function qualificationDescription(rules: BonusQualificationRules): string {
  if (rules.type === 'goals_in_time') {
    return `${rules.targetGoals} голов за ${formatTime(rules.activeTimeMs)}${streakSuffix(rules)}`;
  }
  return `${rules.targetGoals} голов из ${rules.shotsLimit} бросков${streakSuffix(rules)}`;
}

export function qualificationProgress(
  rules: BonusQualificationRules,
  state: { goals: number; shots: number; currentStreak: number; bestStreak: number },
): string {
  const primary = `ЦЕЛЬ ${state.goals}/${rules.targetGoals}`;
  if (rules.requiredGoalStreak === undefined) return primary;
  const achieved = Math.max(state.currentStreak, state.bestStreak);
  return `${primary} · СЕРИЯ ${Math.min(achieved, rules.requiredGoalStreak)}/${rules.requiredGoalStreak}`;
}
