import type * as ApiModule from '../api/apiFetch.js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { VisitorShop } from './VisitorShop.js';
import { apiFetch, ApiError } from '../api/apiFetch.js';
vi.mock('../api/apiFetch.js', async (original) => ({
  ...(await original<typeof ApiModule>()),
  apiFetch: vi.fn(),
}));
const catalog = {
  revision: 1,
  settings: {
    cardDays: 30,
    freeMessages: 10,
    cardMessages: 30,
    freeGames: 3,
    cardGames: 2,
    products: [
      {
        id: 'visitor-card',
        title: 'Карта посетителя',
        kind: 'card',
        amount: 1,
        coins: 14900,
        stars: 300,
      },
    ],
  },
  state: {
    serverNow: '2026-10-17T12:00:00Z',
    resetAt: '2026-10-18T00:00:00Z',
    card: { purchased: false, active: false, expiresAt: null },
    messages: { remaining: 0, paid: 0 },
    games: { byCharacter: { maria: 0 } },
  },
};
beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});
const mount = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <VisitorShop />
    </QueryClientProvider>,
  );
it('purchases with no remaining messages and retries an uncertain purchase using the same request', async () => {
  const purchases: unknown[] = [];
  let attempts = 0;
  vi.mocked(apiFetch).mockImplementation(async (url, options) => {
    if (url === '/bar/visitor') return catalog as never;
    purchases.push(JSON.parse(String(options?.body)));
    attempts++;
    if (attempts === 1) throw new Error('offline');
    return catalog.state as never;
  });
  mount();
  fireEvent.click(await screen.findByRole('button', { name: /14.*900 монет/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Подтвердить покупку' }));
  await screen.findByText('offline');
  fireEvent.click(screen.getByRole('button', { name: 'Подтвердить покупку' }));
  await screen.findByText('Покупка готова. Можно продолжать!');
  expect(purchases).toHaveLength(2);
  expect(purchases[1]).toEqual(purchases[0]);
});
it('renders insufficient funds and price changes without granting a card', async () => {
  vi.mocked(apiFetch).mockImplementation(async (url) => {
    if (url === '/bar/visitor') return catalog as never;
    throw new ApiError(409, 'bar_insufficient_funds', 'Не хватает средств для покупки.');
  });
  mount();
  fireEvent.click(await screen.findByRole('button', { name: '300 звёзд' }));
  fireEvent.click(screen.getByRole('button', { name: 'Подтвердить покупку' }));
  expect(await screen.findByText('Не хватает средств для покупки.')).toBeInTheDocument();
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Подтвердить покупку' })).toBeNull(),
  );
});
