export interface DuelLimitSettings {
  daily: number;
  weekly: number;
  monthly: number;
  perFormatMonthly: number;
  outgoingInvites: number;
}

const MOSCOW_OFFSET_HOURS = 3;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export function limitWindows(now: Date) {
  const local = new Date(now.getTime() + MOSCOW_OFFSET_HOURS * HOUR_MS);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  const date = local.getUTCDate();
  const dayStartLocal = Date.UTC(year, month, date);
  const weekStartLocal = dayStartLocal - ((local.getUTCDay() + 6) % 7) * DAY_MS;
  const monthStartLocal = Date.UTC(year, month, 1);
  const toUtc = (localTimestamp: number) => new Date(localTimestamp - MOSCOW_OFFSET_HOURS * HOUR_MS);
  return {
    dayStart: toUtc(dayStartLocal),
    weekStart: toUtc(weekStartLocal),
    monthStart: toUtc(monthStartLocal),
    nextDay: toUtc(dayStartLocal + DAY_MS),
    nextWeek: toUtc(weekStartLocal + 7 * DAY_MS),
    nextMonth: toUtc(Date.UTC(year, month + 1, 1)),
  };
}
