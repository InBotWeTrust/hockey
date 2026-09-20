import type { BonusQualificationRules } from '../api/bonusGames.js';

function formatTime(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1_000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function enduranceQualificationLines(
  rules: Extract<BonusQualificationRules, { type: 'survive_goal_windows' }>,
): readonly [string, string] {
  return [
    `Продержаться ${formatTime(rules.activeTimeMs)} мин`,
    `Гол не реже, чем раз в ${rules.goalWindowMs / 1_000} сек`,
  ];
}

function streakSuffix(rules: BonusQualificationRules): string {
  return rules.type === 'points_in_time' ||
    rules.type === 'survive_goal_windows' ||
    rules.requiredGoalStreak === undefined
    ? ''
    : ` · серия ${rules.requiredGoalStreak}`;
}

export function qualificationDescription(rules: BonusQualificationRules): string {
  if (rules.type === 'survive_goal_windows') {
    return enduranceQualificationLines(rules).join(' · ');
  }
  if (rules.type === 'points_in_time') {
    return `${rules.targetPoints} очков за ${formatTime(rules.activeTimeMs)}`;
  }
  if (rules.type === 'goals_in_time') {
    return `${rules.targetGoals} голов за ${formatTime(rules.activeTimeMs)}${streakSuffix(rules)}`;
  }
  return `${rules.targetGoals} голов из ${rules.shotsLimit} бросков${streakSuffix(rules)}`;
}

export function qualificationProgress(
  rules: BonusQualificationRules,
  state: {
    goals: number;
    shots: number;
    totalPoints?: number;
    currentStreak: number;
    bestStreak: number;
  },
): string {
  if (rules.type === 'survive_goal_windows') {
    return `ГОЛЫ ${state.goals}`;
  }
  if (rules.type === 'points_in_time') {
    return `ЦЕЛЬ ${state.totalPoints ?? 0}/${rules.targetPoints}`;
  }
  const primary = `ЦЕЛЬ ${state.goals}/${rules.targetGoals}`;
  if (rules.requiredGoalStreak === undefined) return primary;
  const achieved =
    state.bestStreak >= rules.requiredGoalStreak ? rules.requiredGoalStreak : state.currentStreak;
  return `${primary} · СЕРИЯ ${Math.min(achieved, rules.requiredGoalStreak)}/${rules.requiredGoalStreak}`;
}
