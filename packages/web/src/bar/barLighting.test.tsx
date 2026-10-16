import {act, renderHook} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
import {useBarLighting} from './barLighting.js';

afterEach(() => {vi.useRealTimers(); vi.unstubAllGlobals();});
it('keeps loaded artwork until all new sections decode and ignores stale phase loads', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 16, 9, 59, 59));
  const loads: {src: string; resolve: () => void; reject: () => void}[] = [];
  vi.stubGlobal('Image', class {
    src = '';
    decode() {return new Promise<void>((resolve, reject) => loads.push({src: this.src, resolve, reject}));}
  });
  const hook = renderHook(() => useBarLighting('interior'));
  expect(hook.result.current.phase).toBe('morning');
  await act(async () => {await vi.advanceTimersByTimeAsync(1000);});
  expect(loads).toHaveLength(3);
  await act(async () => {loads[0]!.resolve(); loads[1]!.resolve();});
  expect(hook.result.current.phase).toBe('morning');
  vi.setSystemTime(new Date(2026, 9, 16, 18));
  await act(async () => {window.dispatchEvent(new Event('focus'));});
  expect(loads).toHaveLength(6);
  await act(async () => {loads.slice(0,3).forEach(load => load.resolve());});
  expect(hook.result.current.phase).toBe('morning');
  await act(async () => {loads.slice(3).forEach(load => load.resolve());});
  expect(hook.result.current.phase).toBe('sunset');
  expect(hook.result.current.previous).toBe('morning');
  hook.unmount();
});
it('keeps the last good phase on failure and retries only requested artwork', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 16, 20, 59, 59));
  const decode = vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValue(undefined);
  vi.stubGlobal('Image', class {src = ''; decode = decode;});
  const hook = renderHook(() => useBarLighting('blocked'));
  await act(async () => {await vi.advanceTimersByTimeAsync(1000);});
  expect(hook.result.current.phase).toBe('sunset');
  await act(async () => {await vi.advanceTimersByTimeAsync(1000);});
  expect(hook.result.current.phase).toBe('night');
  expect(decode).toHaveBeenCalledTimes(2);
  hook.unmount();
});
