import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { cityTimeOfDay } from './lighting.js';
import { useYardLighting, yardArtwork } from './yardLighting.js';
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it.each([0, 5, 6, 9, 10, 17, 18, 20, 21, 23])(
  'uses the map lighting schedule at hour %s',
  (hour) => {
    const time = cityTimeOfDay(new Date(2026, 9, 19, hour));
    expect(yardArtwork(time).panorama).toBe(
      `/section-panoramas/yard${time === 'day' ? '' : `-${time}`}-v1.webp`,
    );
    expect(yardArtwork(time).thumbnail(2)).toBe(
      `/section-panoramas/yard${time === 'day' ? '' : `-${time}`}-2.webp`,
    );
  },
);
it('preloads new lighting, ignores stale loads and stops its clock on leaving the yard', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 19, 17, 59, 59));
  const pending: Array<() => void> = [];
  vi.stubGlobal(
    'Image',
    class {
      src = '';
      decode() {
        return new Promise<void>((resolve) => pending.push(resolve));
      }
    },
  );
  const hook = renderHook(({ enabled }) => useYardLighting(enabled), {
    initialProps: { enabled: true },
  });
  expect(hook.result.current.time).toBe('day');
  act(() => {
    vi.advanceTimersByTime(1000);
  });
  expect(hook.result.current.time).toBe('day');
  act(() => {
    vi.setSystemTime(new Date(2026, 9, 19, 21));
    window.dispatchEvent(new Event('focus'));
  });
  await act(async () => pending[0]!());
  expect(hook.result.current.time).toBe('day');
  await act(async () => pending[1]!());
  expect(hook.result.current.time).toBe('night');
  hook.rerender({ enabled: false });
  expect(vi.getTimerCount()).toBe(0);
});
it('retries a failed background without hiding the current image', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 19, 17, 59, 59));
  const decode = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
  vi.stubGlobal(
    'Image',
    class {
      src = '';
      decode = decode;
    },
  );
  const { result } = renderHook(() => useYardLighting(true));
  await act(async () => {
    vi.advanceTimersByTime(1000);
  });
  expect(result.current.time).toBe('day');
  await act(async () => {
    vi.advanceTimersByTime(1000);
  });
  expect(result.current.time).toBe('sunset');
});
