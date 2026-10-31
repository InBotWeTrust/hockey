import { waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { trackNovice } from './noviceFunnel.js';
import { apiFetch } from '../api/apiFetch.js';
const auth = vi.hoisted(() => ({ user: { id: 'test-player' }, accessToken: 'test-only' }));
vi.mock('../auth/authStore.js', () => ({
  useAuthStore: Object.assign((select: (s: typeof auth) => unknown) => select(auth), {
    getState: () => auth,
  }),
}));
vi.mock('../api/apiFetch.js', () => ({ apiFetch: vi.fn() }));
beforeEach(() => {
  auth.user = { id: crypto.randomUUID() };
  auth.accessToken = 'test-only';
  vi.mocked(apiFetch).mockReset().mockResolvedValue({ ok: true });
});
it('deduplicates repeated views without sending user profile or client timestamps', async () => {
  trackNovice('city_first_seen');
  trackNovice('city_first_seen');
  expect(apiFetch).toHaveBeenCalledTimes(1);
  const body = JSON.parse(vi.mocked(apiFetch).mock.calls[0]![1]!.body as string);
  expect(Object.keys(body).sort()).toEqual(['event', 'sessionId']);
  expect(body.event).toBe('city_first_seen');
});
it('does not send unauthenticated observations and tolerates delivery failure', async () => {
  auth.accessToken = '';
  trackNovice('city_first_seen');
  expect(apiFetch).not.toHaveBeenCalled();
  auth.accessToken = 'test-only';
  vi.mocked(apiFetch).mockRejectedValueOnce(new Error('offline'));
  trackNovice('city_first_seen');
  await waitFor(() => {
    trackNovice('city_first_seen');
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });
});
