import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { useCityWeather } from './cityLocation.js';
import { apiFetch } from '../api/apiFetch.js';
vi.mock('../api/apiFetch.js', () => ({ apiFetch: vi.fn() }));
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it('polls city weather once an hour rather than every half hour', async () => {
  vi.useFakeTimers();
  focusManager.setFocused(true);
  vi.mocked(apiFetch).mockResolvedValue({ status: 'fresh', weather: null });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const city = {
    id: '1',
    name: 'Москва',
    region: '',
    country: 'Россия',
    latitude: 55.75,
    longitude: 37.62,
    timeZone: 'Europe/Moscow',
  };
  const hook = renderHook(() => useCityWeather('user', city), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(apiFetch).toHaveBeenCalledTimes(1);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(31 * 60000);
  });
  expect(apiFetch).toHaveBeenCalledTimes(1);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(29 * 60000);
  });
  expect(apiFetch).toHaveBeenCalledTimes(2);
  hook.unmount();
  client.clear();
  focusManager.setFocused(undefined);
});
