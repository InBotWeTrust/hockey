import type { TournamentClassicIncompleteResultPolicy } from './types.js';

export interface ClassicPeriodResult {
  periodNumber: number;
  shots: number;
  goals: number;
}

export interface ClassicResult {
  goals: number;
  shots: number;
  counted: boolean;
  gameCompleted: boolean;
}

export function resolveClassicResult(input: {
  policy: TournamentClassicIncompleteResultPolicy;
  completedPeriods: ClassicPeriodResult[];
  activePeriod: Omit<ClassicPeriodResult, 'periodNumber'> | null;
}): ClassicResult {
  const gameCompleted = new Set(input.completedPeriods.map((period) => period.periodNumber)).size >= 3;
  if (!gameCompleted && input.policy === 'completed_game') {
    return { goals: 0, shots: 0, counted: false, gameCompleted: false };
  }

  const included = [
    ...input.completedPeriods,
    ...(input.policy === 'all_shots' && input.activePeriod !== null ? [input.activePeriod] : []),
  ];
  return {
    goals: included.reduce((total, period) => total + period.goals, 0),
    shots: included.reduce((total, period) => total + period.shots, 0),
    counted: true,
    gameCompleted,
  };
}
