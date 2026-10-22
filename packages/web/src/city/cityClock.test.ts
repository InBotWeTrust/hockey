import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useCityClock } from './cityClock.js';
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it('refreshes an open settings screen across midnight and after returning from sleep', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-23T23:59:30Z'));
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  const { result, unmount } = renderHook(() => useCityClock());
  expect(result.current.getUTCDate()).toBe(23);
  act(() => {
    vi.advanceTimersByTime(60000);
  });
  expect(result.current.getUTCDate()).toBe(24);
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  act(() => {
    vi.setSystemTime(new Date('2026-10-26T09:00:00Z'));
    vi.advanceTimersByTime(60000);
  });
  expect(result.current.getUTCDate()).toBe(24);
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(result.current.getUTCDate()).toBe(26);
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});
