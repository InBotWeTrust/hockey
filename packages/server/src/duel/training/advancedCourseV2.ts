import type { Pool, PoolClient } from 'pg';
import type { AdvancedTrainingV2Technique } from '@hockey/game-core';
import { loadAdvancedTrainingConfig, type AdvancedTrainingConfig } from './advancedCourse.js';

type Queryable = Pool | PoolClient;

export const ADVANCED_TRAINING_V2_EXERCISES: readonly {
  key: AdvancedTrainingV2Technique;
  title: string;
  description: string;
  skill: string;
}[] = [
  { key: 'near_goalie', title: 'Вратарь рядом', description: 'Поймай момент, когда вратарь находится рядом с воротами, но вне створа.', skill: 'Геометрия' },
  { key: 'counter_direction', title: 'Противоход', description: 'Брось, когда игрок и ворота движутся в противоположных направлениях.', skill: 'Направление' },
  { key: 'complex', title: 'Сложный', description: 'Найди открытый участок ворот рядом с перекрывающим створ вратарём.', skill: 'Просвет' },
  { key: 'precise', title: 'Меткий', description: 'Попади в узкий внутренний просвет сбоку от вратаря.', skill: 'Точность' },
  { key: 'behind_goalie', title: 'За вратаря', description: 'Игрок идёт в одну сторону, ворота и вратарь — в другую. Попади за вратаря.', skill: 'Противоход' },
  { key: 'corner', title: 'Сложный в углу', description: 'Попади в небольшой просвет, когда ворота или вратарь подходят к борту.', skill: 'Угол' },
  { key: 'edge', title: 'На грани', description: 'Проведи шайбу совсем рядом с краем вратаря.', skill: 'Точность' },
  { key: 'super_precise', title: 'Суперметкий', description: 'Попади в просвет не шире десяти единиц.', skill: 'Предельная точность' },
];

export async function fetchAdvancedTrainingV2Completions(
  db: Queryable, userId: string,
): Promise<Set<AdvancedTrainingV2Technique>> {
  const { rows } = await db.query<{ exercise_key: AdvancedTrainingV2Technique }>(
    `select exercise_key from advanced_training_v2_completion where user_id = $1`, [userId]);
  return new Set(rows.map((row) => row.exercise_key));
}

export function buildAdvancedTrainingV2Catalog(
  completed: ReadonlySet<AdvancedTrainingV2Technique>,
  accessUnlocked: boolean,
  config: AdvancedTrainingConfig,
) {
  let nextAvailableAssigned = false;
  return ADVANCED_TRAINING_V2_EXERCISES.map((exercise, index) => {
    const isCompleted = completed.has(exercise.key);
    const isAvailable = accessUnlocked && !isCompleted && !nextAvailableAssigned;
    if (isAvailable) nextAvailableAssigned = true;
    return {
      ...exercise,
      position: index + 1,
      goal: 'Слева и справа: практика 1+1, зачёт 2+2',
      rewardStars: config.rewardStars,
      rewardExperience: config.rewardExperience,
      state: isCompleted ? 'completed' as const : isAvailable ? 'available' as const : 'locked' as const,
    };
  });
}

export { loadAdvancedTrainingConfig };
