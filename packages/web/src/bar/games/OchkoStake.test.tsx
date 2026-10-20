import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { OchkoStake } from './OchkoStake.js';
import { gameApi } from './api.js';
vi.mock('./api.js', () => ({ gameApi: { ochkoOffer: vi.fn(), startOchkoStake: vi.fn() } }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it('lets a user counter above 30 up to their balance and prevents duplicate starts', async () => {
  vi.mocked(gameApi.ochkoOffer).mockResolvedValue({
    offerId: 'o',
    stars: 20,
    balance: 100,
    expiresAt: 1e12,
  });
  vi.mocked(gameApi.startOchkoStake).mockImplementation(() => new Promise(() => {}));
  render(<OchkoStake onStarted={vi.fn()} />);
  await act(async () => {});
  fireEvent.change(screen.getByLabelText('Ставка в звёздах'), { target: { value: '50' } });
  const button = screen.getByRole('button', { name: 'Играть на 50 звёзд' });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(gameApi.startOchkoStake).toHaveBeenCalledTimes(1);
  expect(vi.mocked(gameApi.startOchkoStake).mock.calls[0]![0].stars).toBe(50);
});
it('rejects noninteger amounts and more than the shown balance', async () => {
  vi.mocked(gameApi.ochkoOffer).mockResolvedValue({
    offerId: 'o',
    stars: 10,
    balance: 20,
    expiresAt: 1e12,
  });
  render(<OchkoStake onStarted={vi.fn()} />);
  await act(async () => {});
  for (const value of ['0', '21', '1.5']) {
    fireEvent.change(screen.getByLabelText('Ставка в звёздах'), { target: { value } });
    expect(screen.getByRole('button', { name: /Играть/ })).toBeDisabled();
  }
});
it('retries an uncertain start with the same input instead of debiting again', async () => {
  vi.mocked(gameApi.ochkoOffer).mockResolvedValue({
    offerId: 'o',
    stars: 10,
    balance: 20,
    expiresAt: 1e12,
  });
  vi.mocked(gameApi.startOchkoStake).mockRejectedValue(new Error('Сеть'));
  render(<OchkoStake onStarted={vi.fn()} />);
  await act(async () => {});
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Играть на 10 звёзд' }));
  });
  expect(screen.getByLabelText('Ставка в звёздах')).toBeDisabled();
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Повторить отправку' }));
  });
  expect(vi.mocked(gameApi.startOchkoStake).mock.calls[0]![0]).toEqual(
    vi.mocked(gameApi.startOchkoStake).mock.calls[1]![0],
  );
});
