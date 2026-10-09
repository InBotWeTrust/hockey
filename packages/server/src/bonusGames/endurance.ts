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

/** Keep the unspent goal window while the result modal prevents another shot. */
export function pauseEnduranceGoalWindow(input: {
  goalWindowEndsAt: Date;
  shotStartedAt: Date;
  flightMs: number;
}): { startsAt: Date; endsAt: Date } | null {
  const resultStartsAtMs = input.shotStartedAt.getTime() + input.flightMs;
  if (resultStartsAtMs >= input.goalWindowEndsAt.getTime()) return null;
  return {
    startsAt: new Date(resultStartsAtMs + BONUS_SHOT_RESULT_PAUSE_MS),
    endsAt: new Date(input.goalWindowEndsAt.getTime() + BONUS_SHOT_RESULT_PAUSE_MS),
  };
}
