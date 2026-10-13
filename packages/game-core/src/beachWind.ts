import { getBonusChallengeShooterMotionTime, type BonusChallengeEnvironmentRules, type BonusChallengeShotPause } from './bonusChallenge.js';
import { createRng } from './rng.js';
const WIND_DURATION_MS = 1000;
const WIND_REVERSE_SPEED = .3;
export type WindTarget = 'player' | 'goalie' | 'goal';
export interface WindGust { startMs: number; target: WindTarget }
/** Generated once for a new interactive attempt and stored in its immutable snapshot. */
export function createWindSchedule(seed: string, durationMs: number): WindGust[] {
  const rng = createRng(seed);
  const random = () => rng.next();
  const choices: WindTarget[] = ['player', 'goalie', 'goal'];
  const targets: WindTarget[] = [...Array<WindTarget>(3).fill('player'), ...Array<WindTarget>(3).fill('goalie'),
    ...Array<WindTarget>(3).fill('goal'), choices[Math.floor(random() * 3)]!];
  for (let i = targets.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [targets[i], targets[j]] = [targets[j]!, targets[i]!];
  }
  const schedule: WindGust[] = [];
  for (let slot = 0; slot < Math.ceil(durationMs / 15000); slot++) {
    const low = Math.max(slot * 15000, (schedule.at(-1)?.startMs ?? -5000) + 5000);
    const high = Math.min((slot + 1) * 15000, durationMs) - WIND_DURATION_MS;
    if (low > high) break;
    schedule.push({ startMs: low + Math.floor(random() * (high - low + 1)), target: targets[slot % 10]! });
  }
  return schedule;
}
export function activeWind(schedule: readonly WindGust[], time: number): WindGust | null {
  return schedule.find(g => time >= g.startMs && time < g.startMs + WIND_DURATION_MS) ?? null;
}
export function windIsActive(schedule: readonly WindGust[], time: number): boolean { return activeWind(schedule, time) !== null; }
export function beachWindClock(schedule: readonly WindGust[], target: WindTarget, time: number): number {
  return time - (1 + WIND_REVERSE_SPEED) * schedule.filter(g => g.target === target)
    .reduce((sum, g) => sum + Math.max(0, Math.min(WIND_DURATION_MS, time - g.startMs)), 0);
}
export function beachWindMotion(rules: BonusChallengeEnvironmentRules, time: number, frequency: number,
  pauses: readonly BonusChallengeShotPause[], schedule: readonly WindGust[]): number {
  const normalMotion = getBonusChallengeShooterMotionTime(rules, time, frequency, pauses);
  // Restore only 30% of motion removed by stumbling; existing shot/rest pauses still win.
  const withoutStumbles = rules.stumbleWindows?.length
    ? getBonusChallengeShooterMotionTime({ ...rules, stumbleWindows: [] }, time, frequency, pauses)
    : normalMotion;
  let motion = normalMotion + .3 * (withoutStumbles - normalMotion);
  for (const gust of schedule) {
    if (gust.target !== 'player' || gust.startMs >= time) continue;
    motion -= (1 + WIND_REVERSE_SPEED) * getBonusChallengeShooterMotionTime(rules, Math.min(time, gust.startMs + WIND_DURATION_MS), frequency, pauses, gust.startMs);
  }
  return motion;
}
