import { z } from 'zod';
import type { TournamentConfig } from './types.js';

const playoffSizeSchema = z.union([
  z.literal(2),
  z.literal(4),
  z.literal(8),
  z.literal(16),
]);

const common = {
  participantLimit: z.number().int().min(2),
  playoffSize: playoffSizeSchema,
  timezone: z.string().min(1).refine(
    (timezone) => {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
        return true;
      } catch {
        return false;
      }
    },
    { message: 'invalid tournament timezone' },
  ),
  registrationMode: z.enum(['open', 'approval', 'invite_only']),
  visibility: z.enum(['public', 'hidden']),
  entryFeeCoins: z.number().int().min(0),
};

const headToHeadSchema = z
  .object({
    ...common,
    regularSource: z.literal('head_to_head'),
    roundRobinCycles: z.number().int().min(1).max(20),
    roundsPerDay: z.number().int().min(1).max(24),
    firstRoundLocalTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
    fixtureWindowMs: z.number().int().min(60_000).max(86_400_000),
    roundBreakMs: z.number().int().min(0).max(86_400_000),
    dailyDays: z.null(),
    dailyMetric: z.null(),
    bestDays: z.null(),
  })
  .superRefine((config, ctx) => {
    if (config.participantLimit > 64) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['participantLimit'],
        message: 'head-to-head tournaments support at most 64 participants',
      });
    }
    const occupiedMs =
      config.roundsPerDay * config.fixtureWindowMs +
      Math.max(0, config.roundsPerDay - 1) * config.roundBreakMs;
    if (occupiedMs > 86_400_000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['roundsPerDay'],
        message: 'round windows must fit inside one day',
      });
    }
    if (config.playoffSize > config.participantLimit) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['playoffSize'],
        message: 'playoff size cannot exceed participant limit',
      });
    }
  });

const dailyAggregateSchema = z
  .object({
    ...common,
    regularSource: z.literal('daily_aggregate'),
    roundRobinCycles: z.null(),
    roundsPerDay: z.null(),
    firstRoundLocalTime: z.null(),
    fixtureWindowMs: z.null(),
    roundBreakMs: z.null(),
    dailyDays: z.number().int().min(1).max(366),
    dailyMetric: z.enum(['goals_sum', 'accuracy_average', 'daily_place_points']),
    bestDays: z.number().int().min(1).nullable(),
  })
  .superRefine((config, ctx) => {
    if (config.participantLimit > 10_000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['participantLimit'],
        message: 'daily aggregate tournaments support at most 10000 participants',
      });
    }
    if (config.playoffSize > config.participantLimit) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['playoffSize'],
        message: 'playoff size cannot exceed participant limit',
      });
    }
    if (config.bestDays !== null && config.bestDays > config.dailyDays) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['bestDays'],
        message: 'best days cannot exceed regular-season days',
      });
    }
  });

const classicPeriodSpeedPresetSchema = z.object({
  periodNumber: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  goalFrequency: z.number().min(0.1).max(3),
  goalieFrequency: z.number().min(0.1).max(3),
  shooterFrequency: z.number().min(0.1).max(3),
  puckSpeedPerMs: z.number().min(0.2).max(5),
});

const classicRulesSchema = z
  .object({
    goalieId: z.string().trim().min(1).max(80).default('rookie'),
    shotsPerPeriod: z.number().int().min(1).max(100),
    periodDurationMs: z.number().int().min(1_000).max(10_800_000),
    breakDurationMs: z.number().int().min(0).max(10_800_000),
    incompleteResultPolicy: z
      .enum(['all_shots', 'completed_periods', 'completed_game'])
      .default('completed_game'),
    periodSpeedPresets: z.array(classicPeriodSpeedPresetSchema).length(3),
  })
  .superRefine((rules, ctx) => {
    const periodNumbers = rules.periodSpeedPresets.map((preset) => preset.periodNumber).sort();
    if (periodNumbers.join(',') !== '1,2,3') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['periodSpeedPresets'],
        message: 'classic requires speed settings for periods 1, 2 and 3',
      });
    }
  });

const classicSchema = z
  .object({
    ...common,
    regularSource: z.literal('classic'),
    roundRobinCycles: z.null(),
    roundsPerDay: z.null(),
    firstRoundLocalTime: z.null(),
    fixtureWindowMs: z.null(),
    roundBreakMs: z.null(),
    dailyDays: z.number().int().min(1).max(366),
    dailyMetric: z.enum(['goals_sum', 'accuracy_average', 'daily_place_points']),
    bestDays: z.number().int().min(1).nullable(),
    classicRules: classicRulesSchema,
  })
  .superRefine((config, ctx) => {
    if (config.participantLimit > 10_000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['participantLimit'],
        message: 'classic tournaments support at most 10000 participants',
      });
    }
    if (config.playoffSize > config.participantLimit) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['playoffSize'],
        message: 'playoff size cannot exceed participant limit',
      });
    }
    if (config.bestDays !== null && config.bestDays > config.dailyDays) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['bestDays'],
        message: 'best days cannot exceed regular-season days',
      });
    }
  });

const tournamentConfigSchema = z.union([headToHeadSchema, dailyAggregateSchema, classicSchema]);

export function parseTournamentConfig(input: unknown): TournamentConfig {
  return tournamentConfigSchema.parse(input) as TournamentConfig;
}
