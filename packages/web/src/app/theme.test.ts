import { describe, expect, it } from 'vitest';
import { resolveTheme } from './theme';
describe('local time theme schedule', () => {
  it.each([[7,59,'dark'],[8,0,'light'],[21,59,'light'],[22,0,'dark'],[0,0,'dark']])('resolves %s:%s', (hour, minute, expected) => {
    expect(resolveTheme('auto', new Date(2026, 9, 12, Number(hour), Number(minute)))).toBe(expected);
  });
  it('honors manual selection regardless of time', () => {
    expect(resolveTheme('light', new Date(2026,9,12,23))).toBe('light');
    expect(resolveTheme('dark', new Date(2026,9,12,12))).toBe('dark');
  });
});

import { act, renderHook } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { readTheme, setTheme, useApplicationTheme } from './theme';
afterEach(() => { localStorage.removeItem('hockey.theme'); vi.useRealTimers(); });
it('switches an open app exactly at 22:00 and 08:00', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026,9,12,21,59,59));
  const { unmount } = renderHook(() => useApplicationTheme());
  expect(document.documentElement.dataset.theme).toBe('light');
  act(() => vi.advanceTimersByTime(1000));
  expect(document.documentElement.dataset.theme).toBe('dark');
  act(() => vi.advanceTimersByTime(10*60*60*1000));
  expect(document.documentElement.dataset.theme).toBe('light');
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});
it('persists manual preference and applies it immediately', () => {
  setTheme('dark');
  expect(readTheme()).toBe('dark');
  expect(localStorage.getItem('hockey.theme')).toBe('dark');
  expect(document.documentElement.dataset.theme).toBe('dark');
});
