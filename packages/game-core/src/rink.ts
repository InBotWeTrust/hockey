export interface Vec2 {
  x: number;
  y: number;
}

export const RINK = {
  width: 390,
  height: 700,
} as const;

// Ворота — сверху, центр по горизонтали. y=30 опускает их вниз от скруглённых
// углов катка под новый court-спрайт (679×1100, аспект 0.617).
// leftPost/rightPost.width=8 → opening = [158..232] (74 ед.), визуально шире
// спрайта ворот, но засчёт гола работает только в этом окне.
export const GOAL = {
  x: 150,
  y: 30,
  width: 90,
  height: 26,
  leftPost: { x: 150, y: 30, width: 8, height: 26 },
  rightPost: { x: 232, y: 30, width: 8, height: 26 },
} as const;

// Точка старта шайбы — между нижней синей и нижней красной линией.
export const PUCK_START: Vec2 = {
  x: RINK.width / 2,
  y: 580,
};

// Зона ворот, внутри которой траектория считается «в створе».
export const GOAL_OPENING = {
  xMin: GOAL.x + GOAL.leftPost.width,
  xMax: GOAL.x + GOAL.width - GOAL.rightPost.width,
  y: GOAL.y + GOAL.height,
} as const;
