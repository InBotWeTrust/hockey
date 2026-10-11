export const SCORED_DUEL_KINDS = ['sniper', 'marathon'] as const;
export type MarathonWindowMs = 4000 | 7000;
export interface MarathonShot {
  startedMs: number;
  flightMs: number;
  goal: boolean;
}
export interface MarathonProjection {
  score: number;
  goals: number;
  penalties: number;
  windowEndsMs: number;
}
/** Replay accepted shots against fixed deadlines. Penalties at zero never become debt. */
export function projectMarathon(input: {
  durationMs: number;
  windowMs: MarathonWindowMs;
  elapsedMs: number;
  shots: readonly MarathonShot[];
}): MarathonProjection {
  let score = 0,
    goals = 0,
    penalties = 0,
    windowEndsMs = input.windowMs as number;
  const expire = (until: number, inclusive: boolean) => {
    const bound = Math.min(until, input.durationMs);
    while (inclusive ? windowEndsMs <= bound : windowEndsMs < bound) {
      score = Math.max(0, score - 1);
      penalties++;
      windowEndsMs += input.windowMs;
    }
  };
  for (const shot of input.shots) {
    if (shot.startedMs > input.durationMs) continue;
    expire(shot.startedMs, false);
    if (shot.goal) {
      score++;
      goals++;
      windowEndsMs = shot.startedMs + shot.flightMs + input.windowMs;
    }
  }
  expire(input.elapsedMs, true);
  return { score, goals, penalties, windowEndsMs };
}
export function compareScoredDuel(input: {
  kind: 'sniper' | 'marathon';
  a: { score: number; goals: number; shots: number };
  b: { score: number; goals: number; shots: number };
}): number {
  const { a, b } = input;
  if (a.score !== b.score) return Math.sign(a.score - b.score);
  if (input.kind === 'marathon') return Math.sign(a.goals - b.goals);
  return Math.sign(a.goals * Math.max(1, b.shots) - b.goals * Math.max(1, a.shots));
}
