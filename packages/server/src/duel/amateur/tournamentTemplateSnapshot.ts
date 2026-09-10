import { z } from 'zod';

export const tournamentDuelTemplateSnapshotSchema = z
  .object({
    title: z.string(),
    description: z.string(),
    difficulty: z.enum(['easy', 'medium', 'hard']),
    duelKind: z.enum(['express', 'express_plus', 'classic']),
    duelVariant: z.enum(['classic', 'time_attack']),
    rankedEnabled: z.boolean(),
    matchmakingEnabled: z.boolean(),
    matchmakingVenuePolicy: z.enum([
      'neutral_default',
      'random_participant_home',
      'random_unselected',
    ]),
    totalPeriods: z.number().int().min(1).max(9),
    shotsPerPeriod: z.number().int().min(1).max(1000),
    periodDurationMs: z.number().int().min(1000).max(10_800_000),
    breakDurationMs: z.number().int().min(0).max(10_800_000),
    challengeTtlMs: z.number().int().min(1000),
    readyDurationMs: z.number().int().min(1000),
    readyNoShowCooldownMs: z.number().int().min(0),
    matchmakingTimeoutMs: z.number().int().min(1000),
    rankedDailyLimit: z.number().int().min(0),
    rankedSameOpponentLimit: z.number().int().min(0),
    powerCap: z.number().int().min(0),
    goalieId: z.string().min(1),
    periodSpeedPresets: z.array(z.unknown()),
    periodRules: z.array(z.unknown()).nullable(),
    requiredInventoryItemId: z.string().uuid().nullable(),
    inventoryChargesPerPeriod: z.number().int().min(0),
    winPoints: z.number().int().min(0),
    drawPoints: z.number().int().min(0),
    winCurrencyReward: z.number().int().min(0),
    drawCurrencyReward: z.number().int().min(0),
    winStarReward: z.number().int().min(0),
  })
  .strict();

export type TournamentDuelTemplateSnapshot = z.infer<typeof tournamentDuelTemplateSnapshotSchema>;
