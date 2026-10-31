import { StrictMode } from 'react';
import { act, renderHook, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useCityTour } from './useCityTour.js';
import type { CityTourApi, TourState } from './cityTour.js';
const state: TourState = {
  viewed: [],
  lastLocation: 'yard',
  completed: false,
  gameStarted: false,
  eligible: true,
  target: 100,
  autoShow: true,
};
beforeEach(() => localStorage.clear());
afterEach(cleanup);
it('shares the initial request in StrictMode', async () => {
  const api: CityTourApi = { open: vi.fn(async () => state), action: vi.fn(async () => state) };
  const hook = renderHook(() => useCityTour('strict', false, api), { wrapper: StrictMode });
  await waitFor(() => expect(hook.result.current.mode).toBe('intro'));
  expect(api.open).toHaveBeenCalledTimes(1);
});
it('persists failed writes and retries without losing progress', async () => {
  const action = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(state);
  const api: CityTourApi = { open: async () => state, action };
  const hook = renderHook(() => useCityTour('offline', false, api));
  await waitFor(() => expect(hook.result.current.state).not.toBeNull());
  act(() => hook.result.current.record({ action: 'view', location: 'bank' }));
  await waitFor(() => expect(hook.result.current.syncError).toBe(true));
  expect(hook.result.current.state?.viewed).toContain('bank');
  expect(localStorage.getItem('city-tour-pending-v1:offline')).toContain('bank');
  act(() => hook.result.current.retry());
  await waitFor(() => expect(hook.result.current.syncError).toBe(false));
  expect(localStorage.getItem('city-tour-pending-v1:offline')).toBe('[]');
});
it('retries a failed initial request', async () => {
  const open = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(state);
  const api: CityTourApi = { open, action: async () => state };
  const hook = renderHook(() => useCityTour('retry', true, api));
  await waitFor(() => expect(hook.result.current.syncError).toBe(true));
  act(() => hook.result.current.retry());
  await waitFor(() => expect(hook.result.current.mode).toBe('tour'));
});
it('still saves progress to the server when browser storage is unavailable', async () => {
  const api: CityTourApi = { open: async () => state, action: vi.fn(async () => state) };
  const storage = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
    throw new Error('storage unavailable');
  });
  try {
    const hook = renderHook(() => useCityTour('storage-blocked', false, api));
    await waitFor(() => expect(hook.result.current.state).not.toBeNull());
    act(() => hook.result.current.record({ action: 'view', location: 'bank' }));
    await waitFor(() =>
      expect(api.action).toHaveBeenCalledWith({ action: 'view', location: 'bank' }),
    );
  } finally {
    storage.mockRestore();
  }
});
