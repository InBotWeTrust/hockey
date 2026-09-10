import { z } from 'zod';

const requiredGoalStreakSchema = z.number().int().min(1).max(1_000).optional();

const qualificationRulesSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('goals_from_shots'),
      targetGoals: z.number().int().min(1).max(1_000_000),
      shotsLimit: z.number().int().min(1).max(1_000_000),
      requiredGoalStreak: requiredGoalStreakSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('goals_in_time'),
      targetGoals: z.number().int().min(1).max(1_000_000),
      activeTimeMs: z.number().int().min(1_000).max(86_400_000),
      requiredGoalStreak: requiredGoalStreakSchema,
    })
    .strict(),
]);

export type BonusQualificationRules = z.infer<typeof qualificationRulesSchema>;

export interface BonusQualificationState {
  goals: number;
  shotsTaken: number;
  bestGoalStreak: number;
  activeElapsedMs: number;
}

export interface BonusQualificationEvaluation {
  passed: boolean;
  primaryMet: boolean;
  streakMet: boolean;
  accuracyPercent: number;
}

interface BonusSkillPeriodRule {
  durationMs: number;
  shotsLimit: number | null;
}

export function validateBonusSkillRules(
  skillCode: 'speed' | 'accuracy',
  rules: BonusQualificationRules,
  periods: BonusSkillPeriodRule[],
): void {
  if (skillCode === 'speed') {
    if (rules.type !== 'goals_in_time') {
      throw new Error('speed requires goals in time rules');
    }
    if (periods.some((period) => period.shotsLimit !== null)) {
      throw new Error('speed periods cannot have a shots limit');
    }
    const totalDurationMs = periods.reduce((sum, period) => sum + period.durationMs, 0);
    if (rules.activeTimeMs !== totalDurationMs) {
      throw new Error('speed active time must equal the total period duration');
    }
    return;
  }

  if (rules.type !== 'goals_from_shots') {
    throw new Error('accuracy requires goals from shots rules');
  }
  if (periods.some((period) => period.shotsLimit === null)) {
    throw new Error('accuracy periods require a shots limit');
  }
  const totalShots = periods.reduce((sum, period) => sum + (period.shotsLimit ?? 0), 0);
  if (rules.shotsLimit !== totalShots) {
    throw new Error('accuracy shots limit must equal the total period quota');
  }
}

export function normalizeBonusQualificationRules(
  value: unknown,
  legacy: { targetGoals: number; shotsLimit: number },
): BonusQualificationRules {
  if (value === null || value === undefined) {
    return {
      type: 'goals_from_shots',
      targetGoals: legacy.targetGoals,
      shotsLimit: legacy.shotsLimit,
    };
  }

  const parsed = qualificationRulesSchema.safeParse(value);
  if (!parsed.success) throw new Error('invalid bonus qualification rules');
  if (parsed.data.type === 'goals_from_shots' && parsed.data.targetGoals > parsed.data.shotsLimit) {
    throw new Error('target goals cannot exceed shots limit');
  }
  return parsed.data;
}

export function evaluateBonusQualification(
  rules: BonusQualificationRules,
  state: BonusQualificationState,
): BonusQualificationEvaluation {
  const accuracyPercent = state.shotsTaken === 0 ? 0 : (state.goals / state.shotsTaken) * 100;
  const primaryMet =
    state.goals >= rules.targetGoals &&
    (rules.type !== 'goals_in_time' || state.activeElapsedMs <= rules.activeTimeMs);
  const streakMet =
    rules.requiredGoalStreak === undefined || state.bestGoalStreak >= rules.requiredGoalStreak;

  return { passed: primaryMet && streakMet, primaryMet, streakMet, accuracyPercent };
}

export function advanceGoalStreak(
  streak: { current: number; best: number },
  result: 'goal' | 'save' | 'miss',
): { current: number; best: number } {
  if (result !== 'goal') return { current: 0, best: streak.best };
  const current = streak.current + 1;
  return { current, best: Math.max(streak.best, current) };
}
