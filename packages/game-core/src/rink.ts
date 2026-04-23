export interface Vec2 {
  x: number;
  y: number;
}

// RINK logical dimensions. 572×700 matches the court_wide.webp sprite
// aspect (900/1100 ≈ 0.8182); 572/700 = 0.8171 — the 0.1% slack is absorbed
// by Rink.ts cover-by-height.
export const RINK = {
  width: 572,
  height: 700,
} as const;

// Goal — top center. Hitbox scaled up +15%: 90×26 → 104×30, posts 10→12.
// GOAL.x recentered on the rink.
const _goalWidth = 104;
const _goalHeight = 30;
const _postWidth = 12;
const _goalX = (RINK.width - _goalWidth) / 2; // 234
export const GOAL = {
  x: _goalX,
  y: 30,
  width: _goalWidth,
  height: _goalHeight,
  leftPost: { x: _goalX, y: 30, width: _postWidth, height: _goalHeight },
  rightPost: { x: _goalX + _goalWidth - _postWidth, y: 30, width: _postWidth, height: _goalHeight },
} as const;

// Puck start — rink center, between blue and red line.
export const PUCK_START: Vec2 = {
  x: RINK.width / 2,
  y: 580,
};

// In-goal opening (between the posts) — anything crossing here scores.
export const GOAL_OPENING = {
  xMin: GOAL.x + GOAL.leftPost.width,
  xMax: GOAL.x + GOAL.width - GOAL.rightPost.width,
  y: GOAL.y + GOAL.height,
} as const;
