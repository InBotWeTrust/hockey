import { z } from 'zod';
import type { Pool, PoolClient } from 'pg';
import { SHOOTER_AMPLITUDE, SHOOTER_CENTER_X, type ShotResult } from '@hockey/game-core';

type Queryable = Pool | PoolClient;

export const INITIAL_TRAINING_EXERCISE_KEYS = [
  'first-shot',
  'three-positions',
  'follow-the-goal',
  'moving-goal',
  'find-the-gap',
  'pressure-window',
  'game-pace',
] as const;

export const INITIAL_TRAINING_GOALIE_ID = 'rookie' as const;

export function resolveInitialTrainingGoalieId(_openTrainingGoalieId: string): 'rookie' {
  return INITIAL_TRAINING_GOALIE_ID;
}

export type InitialTrainingExerciseKey = (typeof INITIAL_TRAINING_EXERCISE_KEYS)[number];
export type InitialTrainingExerciseState = 'completed' | 'available' | 'locked';
export type InitialTrainingZone = 'right' | 'left' | 'center';

export function requiredInitialTrainingZone(
  key: InitialTrainingExerciseKey,
  creditedGoals: number,
  targetGoals: number,
): InitialTrainingZone | null {
  if (creditedGoals >= targetGoals) return null;
  if (key === 'moving-goal' || key === 'find-the-gap') {
    const goalsPerZone = targetGoals / 3;
    return (['right', 'left', 'center'] as const)[Math.floor(creditedGoals / goalsPerZone)] ?? null;
  }
  if (key === 'pressure-window' || key === 'game-pace') {
    return creditedGoals % 2 === 0 ? 'right' : 'left';
  }
  return null;
}

export function evaluateInitialTrainingGoal(
  key: InitialTrainingExerciseKey,
  creditedGoals: number,
  targetGoals: number,
  result: ShotResult['type'],
  shooterX: number,
): { credited: boolean; wrongZone: boolean } {
  const requiredZone = requiredInitialTrainingZone(key, creditedGoals, targetGoals);
  if (requiredZone === null) return { credited: result === 'goal', wrongZone: false };
  const leftBoundary = SHOOTER_CENTER_X - SHOOTER_AMPLITUDE / 3;
  const rightBoundary = SHOOTER_CENTER_X + SHOOTER_AMPLITUDE / 3;
  const shotZone = shooterX < leftBoundary ? 'left' : shooterX >= rightBoundary ? 'right' : 'center';
  const wrongZone = shotZone !== requiredZone;
  return { credited: result === 'goal' && !wrongZone, wrongZone };
}

const initialTrainingConfigSchema = z
  .object({
    enabled: z.boolean(),
    targetGoals: z
      .object({
        'first-shot': z.number().int().min(1).max(100),
        'three-positions': z.number().int().min(3).max(100),
        'follow-the-goal': z.number().int().min(1).max(100),
        'moving-goal': z.number().int().min(3).max(99).multipleOf(3),
        'find-the-gap': z.number().int().min(3).max(99).multipleOf(3),
        'pressure-window': z.number().int().min(2).max(100).multipleOf(2),
        'game-pace': z.number().int().min(2).max(100).multipleOf(2),
      })
      .strict(),
    positionOffsetX: z.number().min(1).max(220),
    goalieFrequencyMultipliers: z
      .object({
        'find-the-gap': z.number().min(0.1).max(1),
        'pressure-window': z.number().min(0.1).max(1),
        'game-pace': z.number().min(0.1).max(1),
      })
      .strict(),
    goalFrequencyMultipliers: z
      .object({
        'moving-goal': z.number().min(0.1).max(1),
        'find-the-gap': z.number().min(0.1).max(1),
        'pressure-window': z.number().min(0.1).max(1),
        'game-pace': z.number().min(0.1).max(1),
      })
      .strict(),
    rewardStars: z.number().int().min(0).max(100),
    rewardExperience: z.number().int().min(0).max(100),
  })
  .strict();

const previousProgressionInitialTrainingConfigSchema = initialTrainingConfigSchema.omit({
  goalFrequencyMultipliers: true,
});

const legacyInitialTrainingConfigSchema = z
  .object({
    enabled: z.boolean(),
    targetGoals: z
      .object({
        'first-shot': z.number().int().min(1).max(100),
        'three-positions': z.number().int().min(3).max(100),
        'follow-the-goal': z.number().int().min(1).max(100),
        'moving-goal': z.number().int().min(1).max(100),
        'find-the-gap': z.number().int().min(1).max(100),
      })
      .strict(),
    positionOffsetX: z.number().min(1).max(220),
    goalieFrequencyMultiplier: z.number().min(0.1).max(1),
    rewardStars: z.number().int().min(0).max(100),
    rewardExperience: z.number().int().min(0).max(100),
  })
  .strict();

export type InitialTrainingConfig = z.infer<typeof initialTrainingConfigSchema>;

export const DEFAULT_INITIAL_TRAINING_CONFIG: InitialTrainingConfig = {
  enabled: false,
  targetGoals: {
    'first-shot': 10,
    'three-positions': 9,
    'follow-the-goal': 10,
    'moving-goal': 9,
    'find-the-gap': 9,
    'pressure-window': 6,
    'game-pace': 6,
  },
  positionOffsetX: 160,
  goalieFrequencyMultipliers: {
    'find-the-gap': 1,
    'pressure-window': 0.65,
    'game-pace': 1,
  },
  goalFrequencyMultipliers: {
    'moving-goal': 1,
    'find-the-gap': 1,
    'pressure-window': 1,
    'game-pace': 1,
  },
  rewardStars: 1,
  rewardExperience: 1,
};

const exerciseCopy: Record<
  InitialTrainingExerciseKey,
  { title: string; description: string }
> = {
  'first-shot': {
    title: 'Первый бросок',
    description: 'Попади в неподвижные пустые ворота.',
  },
  'three-positions': {
    title: 'Три позиции',
    description: 'Забивай в ворота слева, по центру и справа.',
  },
  'follow-the-goal': {
    title: 'Следи за воротами',
    description: 'После каждого броска ворота меняют позицию.',
  },
  'moving-goal': {
    title: 'Три зоны',
    description: 'Забей по 3 гола справа, слева и по центру в указанном порядке. Ворота движутся в игровом темпе.',
  },
  'find-the-gap': {
    title: 'Три зоны с вратарём',
    description: 'Снова забей по 3 гола справа, слева и по центру. Теперь ворота защищает вратарь.',
  },
  'pressure-window': {
    title: 'Меняй стороны',
    description: 'Забивай по очереди справа и слева: 3 пары голов в пустые движущиеся ворота.',
  },
  'game-pace': {
    title: 'Игровой темп',
    description: 'Повтори чередование сторон с вратарём на игровой скорости.',
  },
};

export interface InitialTrainingCatalogExercise {
  key: InitialTrainingExerciseKey;
  position: number;
  title: string;
  description: string;
  targetGoals: number;
  rewardStars: number;
  rewardExperience: number;
  state: InitialTrainingExerciseState;
}

export interface InitialTrainingExerciseScene {
  goalOffsetX: number;
  movingGoal: boolean;
  hasGoalie: boolean;
  goalieFrequencyMultiplier: number;
  goalFrequencyMultiplier: number;
}

export function parseInitialTrainingConfig(value: unknown): InitialTrainingConfig {
  const parsed = initialTrainingConfigSchema.safeParse(value);
  if (parsed.success) return parsed.data;

  const previousProgression = previousProgressionInitialTrainingConfigSchema.safeParse(value);
  if (previousProgression.success) {
    return {
      ...previousProgression.data,
      goalFrequencyMultipliers: DEFAULT_INITIAL_TRAINING_CONFIG.goalFrequencyMultipliers,
    };
  }

  const legacy = legacyInitialTrainingConfigSchema.safeParse(value);
  if (!legacy.success) return DEFAULT_INITIAL_TRAINING_CONFIG;
  return {
    ...DEFAULT_INITIAL_TRAINING_CONFIG,
    enabled: legacy.data.enabled,
    targetGoals: {
      ...DEFAULT_INITIAL_TRAINING_CONFIG.targetGoals,
      ...legacy.data.targetGoals,
    },
    positionOffsetX: legacy.data.positionOffsetX,
    goalieFrequencyMultipliers: {
      ...DEFAULT_INITIAL_TRAINING_CONFIG.goalieFrequencyMultipliers,
      'find-the-gap': legacy.data.goalieFrequencyMultiplier,
    },
    rewardStars: legacy.data.rewardStars,
    rewardExperience: legacy.data.rewardExperience,
  };
}

export function buildInitialTrainingCatalog(
  completed: ReadonlySet<string>,
  config: InitialTrainingConfig,
): InitialTrainingCatalogExercise[] {
  let nextAvailableAssigned = false;
  return INITIAL_TRAINING_EXERCISE_KEYS.map((key, index) => {
    const isCompleted = completed.has(key);
    const isAvailable = !isCompleted && !nextAvailableAssigned;
    if (isAvailable) nextAvailableAssigned = true;
    return {
      key,
      position: index + 1,
      ...exerciseCopy[key],
      targetGoals: config.targetGoals[key],
      rewardStars: config.rewardStars,
      rewardExperience: config.rewardExperience,
      state: isCompleted ? 'completed' : isAvailable ? 'available' : 'locked',
    };
  });
}

export function exerciseSceneForProgress(
  key: InitialTrainingExerciseKey,
  progress: { shotIndex: number; goals: number },
  config: InitialTrainingConfig,
): InitialTrainingExerciseScene {
  const positionOffsets = [-config.positionOffsetX, 0, config.positionOffsetX] as const;
  if (key === 'three-positions') {
    const goalsPerPosition = Math.max(1, Math.ceil(config.targetGoals['three-positions'] / 3));
    const position = Math.min(2, Math.floor(progress.goals / goalsPerPosition));
    return {
      goalOffsetX: positionOffsets[position]!,
      movingGoal: false,
      hasGoalie: false,
      goalieFrequencyMultiplier: 1,
      goalFrequencyMultiplier: 0,
    };
  }
  if (key === 'follow-the-goal') {
    const position = Math.max(0, progress.shotIndex - 1) % positionOffsets.length;
    return {
      goalOffsetX: positionOffsets[position]!,
      movingGoal: false,
      hasGoalie: false,
      goalieFrequencyMultiplier: 1,
      goalFrequencyMultiplier: 0,
    };
  }
  return {
    goalOffsetX: 0,
    movingGoal:
      key === 'moving-goal' ||
      key === 'find-the-gap' ||
      key === 'pressure-window' ||
      key === 'game-pace',
    hasGoalie: key === 'find-the-gap' || key === 'game-pace',
    goalieFrequencyMultiplier:
      key === 'find-the-gap' || key === 'game-pace'
        ? config.goalieFrequencyMultipliers[key]
        : 1,
    goalFrequencyMultiplier:
      key === 'moving-goal' ||
      key === 'find-the-gap' ||
      key === 'pressure-window' ||
      key === 'game-pace'
        ? config.goalFrequencyMultipliers[key]
        : 0,
  };
}

export function isInitialTrainingExerciseKey(
  value: string,
): value is InitialTrainingExerciseKey {
  return INITIAL_TRAINING_EXERCISE_KEYS.some((key) => key === value);
}

export async function loadInitialTrainingConfig(
  db: Queryable,
): Promise<InitialTrainingConfig> {
  const { rows } = await db.query<{ value: unknown }>(
    `select value
       from game_settings
      where key = 'training.initial_course.config'`,
  );
  return parseInitialTrainingConfig(rows[0]?.value);
}

export async function fetchInitialTrainingCompletions(
  db: Queryable,
  userId: string,
): Promise<Set<string>> {
  const { rows } = await db.query<{ exercise_key: string }>(
    `select exercise_key
       from initial_training_completion
      where user_id = $1`,
    [userId],
  );
  return new Set(rows.map((row) => row.exercise_key));
}

export async function isInitialTrainingCompleted(
  db: Queryable,
  userId: string,
): Promise<boolean> {
  const { rows } = await db.query<{ completed: boolean }>(
    `select count(*) = $2::int as completed
       from initial_training_completion
      where user_id = $1`,
    [userId, INITIAL_TRAINING_EXERCISE_KEYS.length],
  );
  return rows[0]?.completed === true;
}

export async function fetchInitialTrainingOpenAccess(
  db: Queryable,
  userId: string,
): Promise<'legacy' | 'course' | null> {
  const { rows } = await db.query<{ source: 'legacy' | 'course' }>(
    `select source
       from initial_training_open_access
      where user_id = $1`,
    [userId],
  );
  return rows[0]?.source ?? null;
}

export async function grantInitialTrainingOpenAccess(
  db: Queryable,
  userId: string,
  source: 'legacy' | 'course',
  now: Date,
): Promise<void> {
  await db.query(
    `insert into initial_training_open_access (user_id, source, unlocked_at)
     values ($1, $2, $3)
     on conflict (user_id) do nothing`,
    [userId, source, now],
  );
}
