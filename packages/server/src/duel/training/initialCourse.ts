import { z } from 'zod';
import type { Pool, PoolClient } from 'pg';

type Queryable = Pool | PoolClient;

export const INITIAL_TRAINING_EXERCISE_KEYS = [
  'first-shot',
  'three-positions',
  'follow-the-goal',
  'moving-goal',
  'find-the-gap',
] as const;

export const INITIAL_TRAINING_GOALIE_ID = 'rookie' as const;

export function resolveInitialTrainingGoalieId(_openTrainingGoalieId: string): 'rookie' {
  return INITIAL_TRAINING_GOALIE_ID;
}

export type InitialTrainingExerciseKey = (typeof INITIAL_TRAINING_EXERCISE_KEYS)[number];
export type InitialTrainingExerciseState = 'completed' | 'available' | 'locked';

const initialTrainingConfigSchema = z
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
    'first-shot': 5,
    'three-positions': 6,
    'follow-the-goal': 5,
    'moving-goal': 5,
    'find-the-gap': 5,
  },
  positionOffsetX: 160,
  goalieFrequencyMultiplier: 0.5,
  rewardStars: 1,
  rewardExperience: 1,
};

const exerciseCopy: Record<
  InitialTrainingExerciseKey,
  { title: string; description: string }
> = {
  'first-shot': {
    title: 'Первый бросок',
    description: 'Поймай момент и попади в неподвижные ворота по центру.',
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
    title: 'Ворота в движении',
    description: 'Выбери момент для броска по движущимся воротам.',
  },
  'find-the-gap': {
    title: 'Найди свободный угол',
    description: 'Дождись свободного угла и обыграй вратаря.',
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
}

export function parseInitialTrainingConfig(value: unknown): InitialTrainingConfig {
  const parsed = initialTrainingConfigSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_INITIAL_TRAINING_CONFIG;
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
    const position = Math.min(2, Math.floor(progress.goals / 2));
    return {
      goalOffsetX: positionOffsets[position]!,
      movingGoal: false,
      hasGoalie: false,
      goalieFrequencyMultiplier: config.goalieFrequencyMultiplier,
    };
  }
  if (key === 'follow-the-goal') {
    const position = Math.max(0, progress.shotIndex - 1) % positionOffsets.length;
    return {
      goalOffsetX: positionOffsets[position]!,
      movingGoal: false,
      hasGoalie: false,
      goalieFrequencyMultiplier: config.goalieFrequencyMultiplier,
    };
  }
  return {
    goalOffsetX: 0,
    movingGoal: key === 'moving-goal' || key === 'find-the-gap',
    hasGoalie: key === 'find-the-gap',
    goalieFrequencyMultiplier: config.goalieFrequencyMultiplier,
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
