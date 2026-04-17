import type { Vec2 } from '../rink.js';

export type GoaliePatternId = 'linear' | 'sine' | 'dash' | 'feint';

export interface GoalieConfig {
  id: string;
  name: string;
  pattern: GoaliePatternId;
  hp: number;
  baseReward: number;
  firstClearBonus: number;
  // Параметры паттерна — масштаб, частота, резкость.
  speed: number; // усл.ед/сек для linear и амплитуды для других
  amplitude: number; // в долях ширины створа (0..1)
  frequency: number; // Гц (для sine) или частота событий (для dash/feint)
}

export interface GoalieState {
  position: Vec2; // центр вратаря
  width: number; // ширина AABB
  height: number; // высота AABB
}

export const GOALIE_SIZE = { width: 80, height: 24 } as const;
