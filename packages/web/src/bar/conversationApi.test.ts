import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { apiFetch } from '../api/apiFetch.js';
import { sendConversation } from './conversationApi.js';

vi.mock('../api/apiFetch.js', () => ({ apiFetch: vi.fn() }));
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), ms);
    return controller.signal;
  });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it.each([110000, 125000])('bounds a conversation taking %i milliseconds', async (responseMs) => {
  vi.mocked(apiFetch).mockImplementation((_url, init) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve({ revision: 1 }), responseMs);
    init?.signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new Error('aborted'));
    }, { once: true });
  }));
  const pending = sendConversation('daria', { id: 'message-1', revision: 0, content: 'Привет!' })
    .then(() => 'answered', () => 'cancelled');
  await vi.advanceTimersByTimeAsync(responseMs + 1);
  expect(await pending).toBe(responseMs === 110000 ? 'answered' : 'cancelled');
});
