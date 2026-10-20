import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { InventoryScreen } from './InventoryScreen.js';

const products = [
  {
    id: 'visitor-card',
    title: 'Карта посетителя',
    kind: 'card',
    amount: 1,
    coins: 14900,
    stars: 300,
  },
  ...[10, 30, 100].map((amount, i) => ({
    id: `messages-${amount}`,
    title: `${amount} сообщений`,
    kind: 'messages',
    amount,
    coins: [1000, 2500, 6000][i],
    stars: [20, 50, 120][i],
  })),
];
beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.endsWith('/bar/visitor')
        ? {
            revision: 1,
            settings: {
              cardDays: 30,
              freeMessages: 10,
              cardMessages: 30,
              freeGames: 3,
              cardGames: 2,
              products,
            },
            state: {
              card: { active: false, purchased: false, expiresAt: null },
              messages: { remaining: 0, paid: 0 },
              games: { byCharacter: {} },
              resetAt: '2026-10-20T00:00:00Z',
            },
          }
        : {
            balances: { tokens: 20000, stars: 1000 },
            equipped: { stickItemId: null, skatesItemId: null, nutritionItemId: null },
            items: { stick: [], skates: [], nutrition: [], recovery: [] },
          };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
});
function mount(entry = '/inventory') {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/inventory" element={<InventoryScreen />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
it('places Bar last in circular navigation and opens the same product row layout', async () => {
  const view = mount();
  const bar = await screen.findByRole('tab', { name: 'Бар' });
  expect(screen.getAllByRole('tab').at(-1)).toBe(bar);
  expect(bar).toHaveAttribute('aria-selected', 'false');
  fireEvent.click(bar);
  expect(await screen.findByRole('heading', { name: 'Бар' })).toBeInTheDocument();
  expect(view.container.querySelectorAll('.inventory-product-card')).toHaveLength(4);
  expect(view.container.querySelectorAll('.inventory-product-card img')).toHaveLength(4);
  fireEvent.click(screen.getByRole('button', { name: /Купить Карта постоянного клиента/ }));
  const dialog = screen.getByRole('dialog', { name: /Купить.*Карта постоянного клиента/ });
  expect(
    within(dialog).getByRole('button', { name: /Купить за 14.*900 монет/ }),
  ).toBeInTheDocument();
  expect(within(dialog).getByRole('button', { name: 'Купить за 300 звёзд' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Подтвердить покупку' })).not.toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Закрыть' }));
  fireEvent.click(screen.getAllByRole('tab')[0]!);
  expect(screen.getByRole('tab', { name: 'Бар' })).toHaveAttribute('aria-selected', 'false');
});
it('supports opening the Bar category directly without an extra toggle', async () => {
  const view = mount('/inventory?category=bar');
  expect(await screen.findByRole('heading', { name: 'Бар' })).toBeInTheDocument();
  await screen.findByRole('heading', { name: '10 сообщений' });
  expect(view.container.querySelectorAll('.inventory-product-card')).toHaveLength(4);
});
