export interface ShooterState {
  x: number;
}

// left_new/right_new.webp: 700×950 top-down. Shooter body travels the same
// range for both grips; the puck is offset from the body horizontally based
// on grip so the blade can reach different boards.
//
// Шутер двигается в пределах [16..374] — sprite (52px) edge выходит
// за RINK borders на 10 ед. с каждой стороны под более широкий court-спрайт.
export const SHOOTER_MIN_X    = 16;
export const SHOOTER_MAX_X    = 374;
export const SHOOTER_CENTER_X = (SHOOTER_MIN_X + SHOOTER_MAX_X) / 2;  // = 195
export const SHOOTER_AMPLITUDE = (SHOOTER_MAX_X - SHOOTER_MIN_X) / 2; // = 179
export const SHOOTER_FREQUENCY = 0.45; // Hz

export const SHOOTER_SIZE = { width: 28, height: 26 } as const;
