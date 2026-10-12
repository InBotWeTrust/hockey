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

export interface ScoredShotClock {
  tapTime: number;
  periodTapTime?: number;
  shooterTapTime?: number;
  resultPauseMs?: number;
}

/** Restore visual clocks without stopping the authoritative period clock. */
export function restoreScoredSceneClocks(elapsedMs: number, last: ScoredShotClock | undefined, flightMs: number) {
  const wallTap = last?.periodTapTime ?? last?.tapTime ?? 0;
  const hasPausedScene = last?.periodTapTime !== undefined;
  const priorScenePauseMs = hasPausedScene ? Math.max(0, wallTap - last!.tapTime) : 0;
  const resultPauseMs = hasPausedScene
    ? Math.min(last?.resultPauseMs ?? 1000, Math.max(0, elapsedMs - wallTap - flightMs)) : 0;
  const sceneElapsedMs = Math.max(0, elapsedMs - priorScenePauseMs - resultPauseMs);
  const priorShooterPauseMs = last ? Math.max(0, last.tapTime - (last.shooterTapTime ?? last.tapTime)) : 0;
  return {
    scene_elapsed_ms: sceneElapsedMs,
    shooter_elapsed_ms: Math.max(0, sceneElapsedMs - priorShooterPauseMs - Math.min(flightMs, Math.max(0, elapsedMs - wallTap))),
  };
}
