// LocalStorage marker — last `period_log.ended_at` (ISO ts) the user has
// dismissed. The period summary modal auto-shows for any period with
// ended_at strictly greater than this watermark; closing it advances the
// watermark to that period's ended_at. Switching to ts-based markers
// (instead of period_number/day_date keys) avoids stale entries across
// days and reruns.

const KEY = 'hockey.daily.lastSeenPeriodAt';

interface Stored {
  user_id: string;
  ended_at: string;
}

function load(): Stored[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is Stored =>
        typeof e === 'object' &&
        e !== null &&
        typeof (e as Stored).user_id === 'string' &&
        typeof (e as Stored).ended_at === 'string',
    );
  } catch {
    return [];
  }
}

function save(entries: Stored[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(entries.slice(-20)));
  } catch {
    // ignore quota errors
  }
}

export function getLastSeenAt(userId: string): string | null {
  const found = load().find((e) => e.user_id === userId);
  return found?.ended_at ?? null;
}

export function setLastSeenAt(userId: string, endedAt: string): void {
  const entries = load().filter((e) => e.user_id !== userId);
  entries.push({ user_id: userId, ended_at: endedAt });
  save(entries);
}
