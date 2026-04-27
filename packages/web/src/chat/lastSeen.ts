// Telegram-style "last seen" formatting for the DM header subtitle.
// Pure: takes the ISO timestamp and the current time, returns a Russian-
// localized phrase. `now` is a parameter so tests can pin time.

const ONLINE_WINDOW_MS = 2 * 60 * 1000; // < 2 min from last_seen → online
const HOUR_MS = 60 * 60 * 1000;

const WEEKDAY_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'] as const;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function formatHM(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function pluralizeMinutes(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} минуту`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} минуты`;
  return `${n} минут`;
}

export function formatLastSeen(iso: string | null, now: Date = new Date()): string | null {
  if (!iso) return null;
  const seen = new Date(iso);
  const ms = now.getTime() - seen.getTime();
  if (Number.isNaN(ms)) return null;

  if (ms < ONLINE_WINDOW_MS) return 'в сети';

  if (ms < HOUR_MS) {
    const minutes = Math.max(1, Math.floor(ms / 60_000));
    return `был ${pluralizeMinutes(minutes)} назад`;
  }

  const today = startOfDay(now);
  const seenDay = startOfDay(seen);
  const dayDiff = Math.round((today.getTime() - seenDay.getTime()) / (24 * HOUR_MS));

  if (dayDiff === 0) return `был сегодня в ${formatHM(seen)}`;
  if (dayDiff === 1) return `был вчера в ${formatHM(seen)}`;
  if (dayDiff > 0 && dayDiff < 7) return `был в ${WEEKDAY_SHORT[seen.getDay()]} в ${formatHM(seen)}`;

  return `был ${pad2(seen.getDate())}.${pad2(seen.getMonth() + 1)}.${seen.getFullYear()}`;
}
