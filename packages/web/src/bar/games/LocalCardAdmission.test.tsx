import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { LocalCardAdmission, useLocalCardLease } from './LocalCardAdmission.js';
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

it('starts a distinct rematch even while an old heartbeat is pending', async () => {
  vi.useFakeTimers();
  let finishHeartbeat!: () => void;
  vi.mocked(gameApi.localCards).mockResolvedValueOnce({ok:true}).mockImplementationOnce(() => new Promise(resolve => { finishHeartbeat = () => resolve({ok:true}); })).mockResolvedValue({ok:true});
  function Probe() { const lease = useLocalCardLease(); return <button onClick={() => void lease?.reserve(true)}>Реванш</button>; }
  render(<MemoryRouter><LocalCardAdmission><Probe /></LocalCardAdmission></MemoryRouter>);
  await act(async () => {});
  const first = vi.mocked(gameApi.localCards).mock.calls[0]![0];
  await act(async () => { vi.advanceTimersByTime(20000); });
  fireEvent.click(screen.getByText('Реванш'));
  await act(async () => { finishHeartbeat(); });
  const calls = vi.mocked(gameApi.localCards).mock.calls.filter(call => !call[1]);
  expect(calls.at(-1)![0]).not.toBe(first);
});
