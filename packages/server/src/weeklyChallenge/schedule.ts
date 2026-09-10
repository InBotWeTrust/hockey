const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const CHALLENGE_DURATION_MS = (6 * 24 + 12) * 60 * 60 * 1000;
const NEXT_VISIBLE_LEAD_MS = 12 * 60 * 60 * 1000;

export interface WeeklyChallengeWindow {
  currentStart: Date;
  currentEnd: Date;
  nextStart: Date;
  nextEnd: Date;
  nextVisibleFrom: Date;
}

export function getWeeklyChallengeWindow(now: Date): WeeklyChallengeWindow {
  const moscowNow = new Date(now.getTime() + MOSCOW_OFFSET_MS);
  const daysSinceMonday = (moscowNow.getUTCDay() + 6) % 7;
  const currentStart = new Date(
    Date.UTC(
      moscowNow.getUTCFullYear(),
      moscowNow.getUTCMonth(),
      moscowNow.getUTCDate() - daysSinceMonday,
      -3,
    ),
  );
  const currentEnd = new Date(currentStart.getTime() + CHALLENGE_DURATION_MS);
  const nextStart = new Date(currentStart.getTime() + WEEK_MS);
  const nextEnd = new Date(nextStart.getTime() + CHALLENGE_DURATION_MS);
  const nextVisibleFrom = new Date(nextStart.getTime() - NEXT_VISIBLE_LEAD_MS);

  return { currentStart, currentEnd, nextStart, nextEnd, nextVisibleFrom };
}
