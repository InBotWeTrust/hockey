export interface Vec2 {
  x: number;
  y: number;
}

export const RINK = {
  width: 390,
  height: 700,
} as const;

// Ворота — сверху, центр по горизонтали. y=20 даёт отступ от скруглённых углов катка.
export const GOAL = {
  x: 150,
  y: 20,
  width: 90,
  height: 26,
  leftPost: { x: 150, y: 20, width: 3, height: 26 },
  rightPost: { x: 237, y: 20, width: 3, height: 26 },
} as const;

// Точка старта шайбы — центр нижней зоны поля.
export const PUCK_START: Vec2 = {
  x: RINK.width / 2,
  y: 620,
};

// Зона ворот, внутри которой траектория считается «в створе».
export const GOAL_OPENING = {
  xMin: GOAL.x + GOAL.leftPost.width,
  xMax: GOAL.x + GOAL.width - GOAL.rightPost.width,
  y: GOAL.y + GOAL.height,
} as const;
