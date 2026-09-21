export const BONUS_SHOT_RESULT_PAUSE_MS = 1_000;

export function evaluateEnduranceDeadlines(input: {
  periodEndsAt: Date;
  goalWindowEndsAt: Date;
  now: Date;
}): 'active' | 'completed' | 'failed' {
  const periodEndsAtMs = input.periodEndsAt.getTime();
  const goalWindowEndsAtMs = input.goalWindowEndsAt.getTime();
  const terminalAtMs = Math.min(periodEndsAtMs, goalWindowEndsAtMs);

  if (input.now.getTime() < terminalAtMs) return 'active';
  return periodEndsAtMs <= goalWindowEndsAtMs ? 'completed' : 'failed';
}

export function nextEnduranceGoalWindow(input: {
  shotStartedAt: Date;
  flightMs: number;
  goalWindowMs: number;
}): { startsAt: Date; endsAt: Date } {
  const startsAt = new Date(
    input.shotStartedAt.getTime() + input.flightMs + BONUS_SHOT_RESULT_PAUSE_MS,
  );
  return {
    startsAt,
    endsAt: new Date(startsAt.getTime() + input.goalWindowMs),
  };
}
