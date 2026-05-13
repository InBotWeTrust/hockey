export interface DailyPeriodSpeedPreset {
  periodNumber: 1 | 2 | 3;
  goalFrequency: number;
  goalieFrequency: number;
  shooterFrequency: number;
  puckSpeedPerMs: number;
}

export const DAILY_PERIOD_SPEED_PRESETS: readonly DailyPeriodSpeedPreset[] = [
  {
    periodNumber: 1,
    goalFrequency: 0.5,
    goalieFrequency: 0.6,
    shooterFrequency: 0.75,
    puckSpeedPerMs: 1.25,
  },
  {
    periodNumber: 2,
    goalFrequency: 0.5,
    goalieFrequency: 0.6,
    shooterFrequency: 0.7,
    puckSpeedPerMs: 1.25,
  },
  {
    periodNumber: 3,
    goalFrequency: 0.5,
    goalieFrequency: 0.6,
    shooterFrequency: 0.65,
    puckSpeedPerMs: 1.25,
  },
];

export function getDailyPeriodSpeedPreset(periodNumber: number): DailyPeriodSpeedPreset {
  const normalized = Math.min(3, Math.max(1, Math.trunc(periodNumber))) as 1 | 2 | 3;
  const preset = DAILY_PERIOD_SPEED_PRESETS.find((p) => p.periodNumber === normalized);
  if (!preset) {
    throw new Error(`Missing daily period speed preset: ${normalized}`);
  }
  return preset;
}
