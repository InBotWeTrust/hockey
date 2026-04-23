export interface ShooterState {
  x: number;
}

// lefthand/righthand.webp: 700×950 top-down. Sprite width +15% → 60.
// Shooter body travels the same range for both grips; the puck is offset
// from the body horizontally based on grip so the blade can reach different
// boards.
//
// Margin 55 — sprite corner в повороте (BASE_ROTATION=0.32 рад) влезает с
// небольшим зазором от бортов RINK=572: sqrt(30² + 40.5²) ≈ 50 + 5 запас.
export const SHOOTER_MIN_X    = 55;
export const SHOOTER_MAX_X    = 517;
export const SHOOTER_CENTER_X = (SHOOTER_MIN_X + SHOOTER_MAX_X) / 2;  // = 286
export const SHOOTER_AMPLITUDE = (SHOOTER_MAX_X - SHOOTER_MIN_X) / 2; // = 231
export const SHOOTER_FREQUENCY = 0.45; // Hz

export const SHOOTER_SIZE = { width: 28, height: 26 } as const;
