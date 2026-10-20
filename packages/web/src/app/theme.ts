import { useEffect, useSyncExternalStore } from 'react';
export type ThemePreference = 'auto' | 'light' | 'dark';
const key = 'hockey.theme';
let transient: ThemePreference | undefined;
const listeners = new Set<() => void>();
export function readTheme(): ThemePreference {
  if (transient) return transient;
  try { const value = localStorage.getItem(key); return value === 'light' || value === 'dark' ? value : 'auto'; } catch { return 'auto'; }
}
export function resolveTheme(preference: ThemePreference, date = new Date()): 'light' | 'dark' {
  return preference === 'auto' ? (date.getHours() >= 22 || date.getHours() < 8 ? 'dark' : 'light') : preference;
}
export function setTheme(preference: ThemePreference): void {
  transient = undefined;
  try { localStorage.setItem(key, preference); } catch { transient = preference; /* Storage can be unavailable. */ }
  document.documentElement.dataset.theme = resolveTheme(preference);
  listeners.forEach(listener => listener());
}
export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, readTheme, () => 'auto');
}
export function initializeTheme(): void { document.documentElement.dataset.theme = resolveTheme(readTheme()); }
export function useApplicationTheme(): void {
  const preference = useThemePreference();
  useEffect(() => {
    const apply = () => { document.documentElement.dataset.theme = resolveTheme(readTheme()); };
    const storage = () => { apply(); listeners.forEach(listener => listener()); };
    apply();
    let timer: number;
    const schedule = () => {
      apply();
      const now = new Date();
      const next = new Date(now);
      next.setHours(now.getHours() < 8 ? 8 : now.getHours() < 22 ? 22 : 32, 0, 0, 0);
      timer = window.setTimeout(schedule, Math.max(1, next.getTime() - now.getTime()));
    };
    schedule();
    window.addEventListener('focus', apply);
    document.addEventListener('visibilitychange', apply);
    window.addEventListener('storage', storage);
    return () => { clearTimeout(timer); window.removeEventListener('focus', apply); document.removeEventListener('visibilitychange', apply); window.removeEventListener('storage', storage); };
  }, [preference]);
}
