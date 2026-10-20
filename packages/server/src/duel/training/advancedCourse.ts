import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';

type Queryable = Pool | PoolClient;

export const ADVANCED_TRAINING_EXERCISES = [
  { key: 'board-side', title: 'У борта', description: 'Дождись, когда игрок подъедет к указанному борту, и брось из крайней позиции.', skill: 'Позиция', goal: '7 из 10 моментов' },
  { key: 'open-net', title: 'Открытые ворота', description: 'Дождись, когда вратарь полностью освободит створ, и брось в пустые ворота.', skill: 'Обзор', goal: '7 из 10 моментов' },
  { key: 'crossing', title: 'На пересечении', description: 'Брось в короткий момент, когда игрок, ворота и вратарь пересекутся по центру.', skill: 'Тайминг', goal: '7 из 10 моментов' },
  { key: 'goalie-leaving', title: 'Вратарь отъехал', description: 'Брось сразу после того, как вратарь начнёт отъезжать от траектории шайбы.', skill: 'Реакция', goal: '7 из 10 моментов' },
  { key: 'narrow-gap', title: 'Узкий просвет', description: 'Найди небольшой свободный участок ворот рядом с вратарём и попади в него.', skill: 'Меткость', goal: '7 из 10 моментов' },
  { key: 'counter-direction', title: 'Противоход', description: 'Брось в сторону, противоположную движению вратаря.', skill: 'Противоход', goal: '7 из 10 моментов' },
  { key: 'second-tempo', title: 'Второй темп', description: 'Забей два или три гола подряд за один игровой момент.', skill: 'Серия', goal: '7 из 10 моментов' },
  { key: 'rhythm-reset', title: 'Сброс ритма', description: 'Сначала намеренно промахнись, затем сразу забей два или три гола подряд.', skill: 'Ритм', goal: '7 из 10 моментов' },
] as const;

export type AdvancedTrainingExerciseKey = (typeof ADVANCED_TRAINING_EXERCISES)[number]['key'];
export type AdvancedTrainingExerciseState = 'completed' | 'available' | 'locked';

export interface AdvancedTrainingAccess {
  amateur_completed: boolean;
  beginner_training_completed: boolean;
  unlocked: boolean;
}

export interface AdvancedTrainingCatalogExercise {
  key: AdvancedTrainingExerciseKey;
  position: number;
  title: string;
  description: string | null;
  skill: string | null;
  goal: string | null;
  rewardStars: number;
  rewardExperience: number;
  state: AdvancedTrainingExerciseState;
}

const configSchema = z.object({
  enabled: z.boolean(),
  practiceSituations: z.number().int().min(1).max(100),
  assessmentSituations: z.number().int().min(1).max(100),
  requiredSuccesses: z.number().int().min(1).max(100),
  rewardStars: z.number().int().min(0).max(100),
  rewardExperience: z.number().int().min(0).max(100),
}).strict();

export type AdvancedTrainingConfig = z.infer<typeof configSchema>;

export const DEFAULT_ADVANCED_TRAINING_CONFIG: AdvancedTrainingConfig = {
  enabled: false,
  practiceSituations: 5,
  assessmentSituations: 10,
  requiredSuccesses: 7,
  rewardStars: 1,
  rewardExperience: 1,
};

export function resolveAdvancedTrainingAccess(
  amateurCompleted: boolean,
  beginnerTrainingCompleted: boolean,
): AdvancedTrainingAccess {
  return {
    amateur_completed: amateurCompleted,
    beginner_training_completed: beginnerTrainingCompleted,
    unlocked: amateurCompleted && beginnerTrainingCompleted,
  };
}

export function buildAdvancedTrainingCatalog(
  completed: ReadonlySet<string>,
  accessUnlocked: boolean,
  config: AdvancedTrainingConfig = DEFAULT_ADVANCED_TRAINING_CONFIG,
): AdvancedTrainingCatalogExercise[] {
  let nextAvailableAssigned = false;
  return ADVANCED_TRAINING_EXERCISES.map((exercise, index) => {
    const isCompleted = completed.has(exercise.key);
    const isAvailable = accessUnlocked && !isCompleted && !nextAvailableAssigned;
    if (isAvailable) nextAvailableAssigned = true;
    const concealed = exercise.key === 'rhythm-reset' && index > 0 && !completed.has('second-tempo');
    return {
      key: exercise.key,
      position: index + 1,
      title: concealed ? 'Бонусное упражнение' : exercise.title,
      description: concealed ? null : exercise.description,
      skill: concealed ? null : exercise.skill,
      goal: concealed ? null : exercise.goal,
      rewardStars: config.rewardStars,
      rewardExperience: config.rewardExperience,
      state: isCompleted ? 'completed' : isAvailable ? 'available' : 'locked',
    };
  });
}

export async function loadAdvancedTrainingConfig(db: Queryable): Promise<AdvancedTrainingConfig> {
  const { rows } = await db.query<{ value: unknown }>(
    `select value from game_settings where key = 'training.advanced_course.config'`,
  );
  const parsed = configSchema.safeParse(rows[0]?.value);
  return parsed.success ? parsed.data : DEFAULT_ADVANCED_TRAINING_CONFIG;
}

export async function fetchAdvancedTrainingCompletions(
  db: Queryable,
  userId: string,
): Promise<Set<string>> {
  const { rows } = await db.query<{ exercise_key: string }>(
    `select exercise_key from advanced_training_completion where user_id = $1`,
    [userId],
  );
  return new Set(rows.map(({ exercise_key }) => exercise_key));
}
