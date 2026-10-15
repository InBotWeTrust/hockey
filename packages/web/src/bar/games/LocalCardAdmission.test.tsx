import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { LocalCardAdmission } from './LocalCardAdmission.js';
import { gameApi } from './api.js';
vi.mock('./api.js', () => ({ gameApi: { localCards: vi.fn() } }));
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});
it('does not discard an ongoing local card game when a lease renewal fails', async () => {
  vi.useFakeTimers();
  vi.mocked(gameApi.localCards)
    .mockResolvedValueOnce({ ok: true })
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue({ ok: true });
  render(
    <MemoryRouter>
      <LocalCardAdmission>
        <p>Текущие карты</p>
      </LocalCardAdmission>
    </MemoryRouter>,
  );
  await act(async () => {});
  expect(screen.getByText('Текущие карты')).toBeInTheDocument();
  await act(async () => {
    vi.advanceTimersByTime(20000);
  });
  expect(screen.getByText('Текущие карты')).toBeInTheDocument();
});
