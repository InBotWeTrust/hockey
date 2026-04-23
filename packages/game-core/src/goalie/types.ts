import { GOAL, type Vec2 } from '../rink.js';

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
  goalAmplitude: number; // rink units — горизонтальный ход ворот, 0 = статично
  goalFrequency: number; // Hz — частота движения ворот, 0 = статично
}

export interface GoalieState {
  position: Vec2; // центр вратаря
  width: number; // ширина AABB
  height: number; // высота AABB
}

// AABB вратаря: width 50 — ещё чуть шире для лучшего ощущения «отбивает».
export const GOALIE_SIZE = { width: 50, height: 24 } as const;

// Goalie stands in front of the goal (between goal line and player).
export const GOALIE_Y = GOAL.y + GOAL.height + GOALIE_SIZE.height / 2 + 4;
