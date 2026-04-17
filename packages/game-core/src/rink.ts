export interface Vec2 {
  x: number;
  y: number;
}

export const RINK = {
  width: 390,
  height: 700,
} as const;

// Ворота — сверху, центр по горизонтали.
export const GOAL = {
  x: 45,
  y: 0,
  width: 300,
  height: 60,
  // Штанги — AABB в которых попадание = miss ('wide' слева/справа).
  leftPost: { x: 45, y: 0, width: 6, height: 60 },
  rightPost: { x: 339, y: 0, width: 6, height: 60 },
} as const;

// Точка старта шайбы — центр низа поля.
export const PUCK_START: Vec2 = {
  x: RINK.width / 2,
  y: 660,
};

// Зона ворот, внутри которой траектория считается «в створе».
export const GOAL_OPENING = {
  xMin: GOAL.x + GOAL.leftPost.width,
  xMax: GOAL.x + GOAL.width - GOAL.rightPost.width,
  y: GOAL.y + GOAL.height,
} as const;
